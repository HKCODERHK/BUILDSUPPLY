-- 034: when a bill was marked delivered.
--
-- Asked for 2026-09-21: "if a customer doesn't mark delivered in 1 day it
-- should be marked as delivered if the supplier has marked it as delivered".
-- The app could not answer that, because `invoices.delivered` is a yes/no with
-- no timestamp — nothing recorded *when* the supplier marked it, so "a day
-- later" had nothing to count from.
--
-- What this adds:
--   * `invoices.delivered_at` — set by mark_invoice_delivered, the one place
--     that flips `delivered` to true.
--   * `customer_khata` and `order_status` return it, so the customer's khata
--     and their order timeline can stop waiting once a day has passed.
--
-- What this deliberately does NOT do: write `received_at`. That field is the
-- customer's own word — 030's invoice_received_guard stops even the supplier
-- setting it, which is what lets a bill say "Customer confirmed received" and
-- mean it in an argument. A day-old delivery with no reply is shown as
-- exactly that, in its own words, and the guard stays as it is.
--
-- Nothing about money, stock or a bill's total changes. Safe to run twice.

-- ── 1. The column, and when it already happened ───────────────────────────

alter table public.invoices add column if not exists delivered_at timestamptz;

comment on column public.invoices.delivered_at is
  'When the supplier marked this bill delivered (034). Null on bills delivered before 034 existed, where the date is simply not known; the app reads null-but-delivered as "long enough ago".';

-- Bills already delivered keep a null: the moment is genuinely not recorded
-- anywhere, and guessing a date here would put an invented fact in the
-- record. Every one of them was delivered before this migration ran, so the
-- app treating null-but-delivered as "more than a day ago" is true.

-- ── 2. The one place that marks a bill delivered ──────────────────────────
-- Unchanged apart from the timestamp: same lock order, same one-way flip
-- (a second call still changes nothing), same stock move.

create or replace function public.mark_invoice_delivered(p_invoice_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
begin
  update public.invoices
     set delivered = true, delivered_at = now()
   where id = p_invoice_id and delivered = false and status <> 'Cancelled' and kind = 'bill';
  if not found then
    return false;
  end if;

  perform public._lock_materials(array(
    select material_id from public.invoice_items where invoice_id = p_invoice_id and material_id is not null));
  update public.materials m
     set stock_qty = greatest(0, m.stock_qty - q.qty)
    from (select material_id, sum(qty) as qty
            from public.invoice_items
           where invoice_id = p_invoice_id and material_id is not null
           group by material_id) q
   where m.id = q.material_id;
  return true;
end;
$$;

revoke all on function public.mark_invoice_delivered(uuid) from public, anon;
grant execute on function public.mark_invoice_delivered(uuid) to authenticated, service_role;

-- ── 3. The two public reads that have to carry it ───────────────────────
-- Both are the versions this repo already had (033 and 031), with
-- `delivered_at` added beside `delivered`. Nothing else in either moved.

create or replace function public.customer_khata(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  s record;
  b record;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('found', false);
  end if;
  select cu.id, cu.supplier_id, cu.name, cu.phone, cu.address, cu.site into c
    from public.customers cu
   where cu.khata_token = p_token;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  select sp.business_name, sp.address, sp.phone, sp.gst_number, sp.logo_url, sp.status,
         sp.upi_id, sp.khata_upi_enabled, sp.order_link, sp.ordering_enabled into s
    from public.suppliers sp
   where sp.id = c.supplier_id;
  -- Like the order page: nothing while the account is not active.
  if not found or s.status <> 'active' then
    return jsonb_build_object('found', false);
  end if;
  select cb.pending, cb.advance into b from public.customer_balances cb where cb.customer_id = c.id;
  return jsonb_build_object(
    'found', true,
    'supplier', jsonb_build_object('business_name', s.business_name, 'address', s.address, 'phone', s.phone,
                                   'gst_number', s.gst_number, 'logo_url', s.logo_url),
    'customer', jsonb_build_object('name', c.name, 'phone', c.phone, 'address', c.address, 'site', c.site),
    'pending', coalesce(b.pending, 0),
    'advance', coalesce(b.advance, 0),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object('invoice_no', i.invoice_no, 'kind', i.kind, 'status', i.status, 'site', i.site,
                                          'total', i.total, 'paid', i.paid, 'created_at', i.created_at,
                                          'delivered', i.delivered, 'delivered_at', i.delivered_at, 'received_at', i.received_at,
                                          -- False means the shop took this order by phone or at
                                          -- the counter: no order_request ever stood behind it.
                                          'from_order', i.quotation_id is not null and exists (
                                            select 1 from public.order_requests o
                                             where o.supplier_id = c.supplier_id
                                               and o.quotation_id = i.quotation_id))
                       order by i.created_at, i.id)
        from public.invoices i
       where i.customer_id = c.id and i.status <> 'Cancelled'), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'amount', p.amount, 'mode', p.mode, 'created_at', p.created_at,
               'payment_allocations', coalesce((
                 select jsonb_agg(jsonb_build_object('amount', a.amount, 'released_at', null,
                                                     'invoices', jsonb_build_object('invoice_no', i2.invoice_no, 'kind', i2.kind, 'site', i2.site)))
                   from public.payment_allocations a
                   join public.invoices i2 on i2.id = a.invoice_id
                  where a.payment_id = p.id and a.released_at is null), '[]'::jsonb))
             order by p.created_at, p.id)
        from public.payments p
       where p.customer_id = c.id), '[]'::jsonb),
    -- Their estimates, newest 20: number, status, site, total — the lines
    -- come through khata_document when they download one.
    'estimates', coalesce((
      select jsonb_agg(jsonb_build_object('quote_no', x.quote_no, 'status', x.status, 'site', x.site,
                                          'total', x.total, 'created_at', x.created_at)
                       order by x.created_at desc, x.id desc)
        from (select q.id, q.quote_no, q.status, q.site, q.total, q.created_at
                from public.quotations q
               where q.customer_id = c.id
               order by q.created_at desc, q.id desc
               limit 20) x), '[]'::jsonb),
    -- Their online orders, newest 10: made into this customer, or placed from
    -- their phone and not yet decided. 'code' opens the order's status link.
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object('code', x.public_token, 'status', x.status, 'created_at', x.created_at,
                                          'delivery_date', x.delivery_date, 'item_count', jsonb_array_length(x.items),
                                          -- The bill this order turned into, once one exists —
                                          -- the same link order_status already reports.
                                          'bill', (select i.invoice_no
                                                     from public.invoices i
                                                    where i.quotation_id = x.quotation_id
                                                      and i.status <> 'Cancelled'
                                                    order by i.created_at, i.id
                                                    limit 1))
                       order by x.created_at desc, x.id desc)
        from (select o.id, o.public_token, o.status, o.created_at, o.delivery_date, o.items, o.quotation_id
                from public.order_requests o
               where o.supplier_id = c.supplier_id
                 and (o.customer_id = c.id or (o.customer_id is null and c.phone is not null and o.phone = c.phone))
               order by o.created_at desc, o.id desc
               limit 10) x), '[]'::jsonb))
    -- "Pay by UPI" only when the supplier has switched it on and set an ID.
    || case when s.khata_upi_enabled and s.upi_id is not null
            then jsonb_build_object('upi_id', s.upi_id)
            else '{}'::jsonb end
    -- "Order materials" only while the supplier takes orders.
    || case when s.ordering_enabled and s.order_link is not null
            then jsonb_build_object('order_link', s.order_link)
            else '{}'::jsonb end;
end;
$$;

create or replace function public.order_status(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o record;
  q record;
  b record;
  v jsonb;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('found', false);
  end if;
  select r.status, r.created_at, r.decided_at, r.delivery_date, r.items, r.reject_code, r.reject_reason,
         r.quotation_id, r.customer_response, r.responded_at,
         s.business_name, s.order_link, s.ordering_enabled, s.status as supplier_status into o
    from public.order_requests r
    join public.suppliers s on s.id = r.supplier_id
   where r.public_token = p_token;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  v := jsonb_build_object(
    'found', true,
    'status', o.status,
    'business_name', o.business_name,
    'created_at', o.created_at,
    'decided_at', o.decided_at,
    'delivery_date', o.delivery_date,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', i->>'name', 'unit', i->>'unit', 'qty', (i->>'qty')::numeric) order by n)
        from jsonb_array_elements(o.items) with ordinality as x(i, n)), '[]'::jsonb));
  -- "Order more": only while the supplier takes orders.
  if o.ordering_enabled and o.supplier_status = 'active' and o.order_link is not null then
    v := v || jsonb_build_object('order_link', o.order_link);
  end if;
  if o.status = 'rejected' then
    v := v || jsonb_build_object('reject_code', o.reject_code, 'reject_reason', o.reject_reason);
  end if;
  -- Approved: the estimate the supplier made from it, the customer's answer,
  -- and the bill once the estimate became one.
  if o.status = 'approved' and o.quotation_id is not null then
    select qt.id, qt.quote_no, qt.status, qt.subtotal, qt.gst_amount, qt.transport_labour_charge, qt.total into q
      from public.quotations qt
     where qt.id = o.quotation_id;
    if found then
      v := v || jsonb_build_object(
        'estimate', jsonb_build_object(
          'quote_no', q.quote_no,
          'status', q.status,
          'subtotal', q.subtotal,
          'gst_amount', q.gst_amount,
          'transport_labour_charge', q.transport_labour_charge,
          'total', q.total,
          'items', coalesce((
            select jsonb_agg(jsonb_build_object('description', qi.description, 'qty', qi.qty, 'rate', qi.rate, 'amount', qi.amount)
                             order by qi.id)
              from public.quotation_items qi
             where qi.quotation_id = q.id), '[]'::jsonb)),
        'response', o.customer_response,
        'responded_at', o.responded_at);
      select i.invoice_no, i.created_at, i.delivered, i.delivered_at, i.received_at into b
        from public.invoices i
       where i.quotation_id = q.id and i.kind = 'bill' and i.status <> 'Cancelled'
       order by i.created_at desc, i.id desc
       limit 1;
      if found then
        v := v || jsonb_build_object('bill', jsonb_build_object(
          'invoice_no', b.invoice_no, 'created_at', b.created_at, 'delivered', b.delivered,
          'delivered_at', b.delivered_at, 'received_at', b.received_at));
      end if;
    end if;
  end if;
  return v;
end;
$$;

-- Neither function's grants change: `create or replace` keeps them, and both
-- were already granted to anon by 028 and 026.
