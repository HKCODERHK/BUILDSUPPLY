-- 047 — Customer-side UX round, the database part (2026-10-15).
--
-- Read functions only. No table, column, row, policy or grant changes;
-- every function keeps its exact arguments, so `create or replace` keeps its
-- grants and security definer. Safe to run twice.
--
--   #2  customer_khata: each online order says whether the shop has made an
--       estimate for it yet ('has_estimate'), so the khata link and /me stop
--       calling an order accepted on the spot "Estimate ready".
--   #10 order_status: the estimate's total is owed (and offered as a UPI
--       amount) only while the estimate is Draft or Sent. A converted
--       estimate whose bill was cancelled no longer asks for its total.
--   #11 customer_khata: a shop that is not active answers
--       {found: false, paused: true} instead of {found: false}, with nothing
--       of the shop or the customer in it. my_shops keeps such a shop on the
--       customer's account (its name and 'paused', no figures) instead of
--       silently dropping it, which /me read as "the shop stopped your link".
--       my_khata passes customer_khata's answer through unchanged.
--   #28 order_status: estimate lines in the order they were saved (ctid), as
--       khata_document (031) and the estimate PDF already show them.
--
-- Nothing new is revealed: the paused answer needs the customer's own
-- 32-hex khata code (or their own signed-in connection), and says only that
-- the shop is paused — plus, on the account, the shop's name, which that
-- customer already saved.

begin;

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
  -- Like the order page: nothing while the account is not active. But say
  -- it is paused (047, #11): the link itself is still good, so the phone
  -- must not forget it, and the customer is not told to ask for a new one.
  -- Nothing of the shop or the account is returned.
  if not found then
    return jsonb_build_object('found', false);
  end if;
  if s.status <> 'active' then
    return jsonb_build_object('found', false, 'paused', true);
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
                                          -- Whether the shop has priced it yet (047, #2): an
                                          -- approved order without one is "accepted", not
                                          -- "estimate ready".
                                          'has_estimate', x.quotation_id is not null,
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
  v_due numeric := 0;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('found', false);
  end if;
  select r.status, r.created_at, r.decided_at, r.delivery_date, r.items, r.reject_code, r.reject_reason,
         r.quotation_id, r.customer_response, r.responded_at, r.payment_method,
         s.business_name, s.order_link, s.ordering_enabled, s.status as supplier_status,
         s.upi_id, s.khata_upi_enabled into o
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
    'payment_method', o.payment_method,
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
      -- The estimate is owed only while it is still open (047, #10). Once it
      -- is converted or expired it is not a debt: a converted estimate whose
      -- bill was cancelled must not ask for its total.
      v_due := case when q.status in ('Draft', 'Sent') then coalesce(q.total, 0) else 0 end;
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
                             -- The order they were saved in (047, #28), as
                             -- khata_document and the estimate PDF show them;
                             -- the ids are random uuids.
                             order by qi.ctid)
              from public.quotation_items qi
             where qi.quotation_id = q.id), '[]'::jsonb)),
        'response', o.customer_response,
        'responded_at', o.responded_at);
      select i.invoice_no, i.created_at, i.delivered, i.delivered_at, i.received_at, i.total, i.paid into b
        from public.invoices i
       where i.quotation_id = q.id and i.kind = 'bill' and i.status <> 'Cancelled'
       order by i.created_at desc, i.id desc
       limit 1;
      if found then
        -- Once there is a bill it is the bill that is owed, not the estimate.
        v_due := greatest(0, coalesce(b.total, 0) - coalesce(b.paid, 0));
        v := v || jsonb_build_object('bill', jsonb_build_object(
          'invoice_no', b.invoice_no, 'created_at', b.created_at, 'delivered', b.delivered,
          'delivered_at', b.delivered_at, 'received_at', b.received_at,
          'total', b.total, 'paid', b.paid));
      end if;
    end if;
  end if;
  -- Only for the customer who said they would pay online, and only while
  -- there is an amount and the shop still takes UPI.
  if o.payment_method = 'online' and o.khata_upi_enabled and o.upi_id is not null and v_due > 0.005 then
    v := v || jsonb_build_object('upi_id', o.upi_id, 'due', v_due);
  end if;
  return v;
end;
$$;

create or replace function public.my_shops()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := public._customer_caller();
  r record;
  k jsonb;
  out jsonb := '[]'::jsonb;
begin
  for r in
    select cc.id, c.khata_token
      from public.customer_connections cc
      join public.customers c on c.id = cc.customer_id
     where cc.user_id = v_user and cc.revoked_at is null and c.khata_token is not null
     order by cc.connected_at, cc.id
  loop
    k := public.customer_khata(r.khata_token);
    if coalesce((k ->> 'found')::boolean, false) then
      out := out || jsonb_build_array(jsonb_build_object(
        'connection', r.id,
        'business_name', k -> 'supplier' ->> 'business_name',
        'logo_url', k -> 'supplier' ->> 'logo_url',
        'customer_name', k -> 'customer' ->> 'name',
        'customer_phone', k -> 'customer' ->> 'phone',
        'customer_site', k -> 'customer' ->> 'site',
        'order_link', k ->> 'order_link',
        'pending', k -> 'pending',
        'advance', k -> 'advance'
      ));
    elsif coalesce((k ->> 'paused')::boolean, false) then
      -- A shop the platform has paused stays on the account (047, #11), named
      -- so the customer knows which, with nothing else of it.
      out := out || jsonb_build_array(jsonb_build_object(
        'connection', r.id,
        'paused', true,
        'business_name', (select sp.business_name
                            from public.customers cu join public.suppliers sp on sp.id = cu.supplier_id
                           where cu.khata_token = r.khata_token),
        'logo_url', null,
        'customer_name', null,
        'customer_phone', null,
        'customer_site', null,
        'order_link', null,
        'pending', 0,
        'advance', 0
      ));
    end if;
  end loop;
  return out;
end;
$$;

commit;
