-- 031: the customer's links carry a little more, and the supplier keeps a
-- list of drivers.
--
-- Supplier helpers, round 2 (2026-09-15):
--   1. Khata link: the customer's estimates and online orders, the order link
--      while ordering is on, and khata_document(code, kind, number) — one of
--      their own bills or estimates with its lines, so they can download its
--      PDF from the link.
--   2. Order status link: the bill made from the estimate (number, date,
--      delivered, received), when the order was decided, and the order link
--      while ordering is on — the customer's timeline.
--   3. Order page: the business address and phone, for Call and Get
--      directions. Both are printed on every bill already.
--   4. Drivers: the supplier's saved drivers (name and phone), for "Send to
--      driver" on WhatsApp. Only the supplier reads them — no admin access,
--      as for every business table since migration 019.
--
-- Nothing about bills, payments, stock or balances changes, and nothing is
-- sent to anyone. Safe to paste twice. Needs 030.

begin;

-- ── 1. Drivers ─────────────────────────────────────────────────────────

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null default auth.uid() references public.suppliers (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  phone text not null check (phone ~ '^[0-9]{10}$'),
  created_at timestamptz not null default now(),
  unique (supplier_id, phone)
);

alter table public.drivers enable row level security;
drop policy if exists drivers_select_own on public.drivers;
create policy drivers_select_own on public.drivers
  for select using (supplier_id = auth.uid());
drop policy if exists drivers_insert_own on public.drivers;
create policy drivers_insert_own on public.drivers
  for insert with check (supplier_id = auth.uid());
drop policy if exists drivers_update_own on public.drivers;
create policy drivers_update_own on public.drivers
  for update using (supplier_id = auth.uid()) with check (supplier_id = auth.uid());
drop policy if exists drivers_delete_own on public.drivers;
create policy drivers_delete_own on public.drivers
  for delete using (supplier_id = auth.uid());
revoke all on public.drivers from anon;
grant select, insert, update, delete on public.drivers to authenticated;

-- ── 2. The order page: as in 026, plus the address and phone ───────────

create or replace function public.order_page(p_link text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s record;
begin
  select id, business_name, logo_url, address, phone, ordering_enabled, order_show_prices, status into s
    from public.suppliers
   where order_link = lower(btrim(coalesce(p_link, ''))) and role = 'supplier';
  if not found then
    return jsonb_build_object('found', false);
  end if;
  -- Switched off, or the account suspended: say only that.
  if not s.ordering_enabled or s.status <> 'active' then
    return jsonb_build_object('found', true, 'open', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'open', true,
    'business_name', s.business_name,
    'logo_url', s.logo_url,
    'address', nullif(btrim(coalesce(s.address, '')), ''),
    'phone', nullif(btrim(coalesce(s.phone, '')), ''),
    'show_prices', s.order_show_prices,
    'materials', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'name', m.name,
               'category', m.category,
               'unit', coalesce(nullif(btrim(m.unit_label), ''), nullif(btrim(m.per_label), ''), nullif(btrim(m.stock_unit), ''), ''),
               'price', case when s.order_show_prices and m.rate > 0 then m.rate end)
             order by m.category nulls last, m.name)
        from public.materials m
       where m.supplier_id = s.id), '[]'::jsonb));
end;
$$;

-- ── 3. The status link: as in 030, plus the timeline ───────────────────

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
      select i.invoice_no, i.created_at, i.delivered, i.received_at into b
        from public.invoices i
       where i.quotation_id = q.id and i.kind = 'bill' and i.status <> 'Cancelled'
       order by i.created_at desc, i.id desc
       limit 1;
      if found then
        v := v || jsonb_build_object('bill', jsonb_build_object(
          'invoice_no', b.invoice_no, 'created_at', b.created_at, 'delivered', b.delivered, 'received_at', b.received_at));
      end if;
    end if;
  end if;
  return v;
end;
$$;

-- ── 4. The khata link: as in 030, plus estimates, orders, order link ───

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
                                          'delivered', i.delivered, 'received_at', i.received_at)
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
                                          'delivery_date', x.delivery_date, 'item_count', jsonb_array_length(x.items))
                       order by x.created_at desc, x.id desc)
        from (select o.id, o.public_token, o.status, o.created_at, o.delivery_date, o.items
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

-- ── 5. One bill or estimate, for its PDF on the khata link ─────────────
-- Only that customer's own: a live bill, or any of their estimates.

create or replace function public.khata_document(p_token text, p_kind text, p_no text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  d record;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' or coalesce(p_kind, '') not in ('bill', 'estimate') then
    return jsonb_build_object('found', false);
  end if;
  select cu.id, s.status as supplier_status into c
    from public.customers cu
    join public.suppliers s on s.id = cu.supplier_id
   where cu.khata_token = p_token;
  if not found or c.supplier_status <> 'active' then
    return jsonb_build_object('found', false);
  end if;

  if p_kind = 'bill' then
    select i.id, i.invoice_no, i.created_at, i.site, i.subtotal, i.gst_amount, i.transport_labour_charge,
           i.total, i.paid, i.status into d
      from public.invoices i
     where i.customer_id = c.id and i.invoice_no = p_no and i.kind = 'bill' and i.status <> 'Cancelled'
     order by i.created_at desc
     limit 1;
    if not found then
      return jsonb_build_object('found', false);
    end if;
    return jsonb_build_object(
      'found', true,
      'kind', 'bill',
      'invoice_no', d.invoice_no,
      'created_at', d.created_at,
      'site', d.site,
      'subtotal', d.subtotal,
      'gst_amount', d.gst_amount,
      'transport_labour_charge', d.transport_labour_charge,
      'total', d.total,
      'paid', d.paid,
      'status', d.status,
      -- Lines in the order they were saved, as the bill page lists them
      -- (ids are random, so ordering by id would shuffle them).
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('description', ii.description, 'qty', ii.qty, 'rate', ii.rate, 'amount', ii.amount)
                         order by ii.ctid)
          from public.invoice_items ii
         where ii.invoice_id = d.id), '[]'::jsonb));
  end if;

  select q.id, q.quote_no, q.created_at, q.site, q.subtotal, q.gst_amount, q.transport_labour_charge,
         q.total, q.status into d
    from public.quotations q
   where q.customer_id = c.id and q.quote_no = p_no
   order by q.created_at desc
   limit 1;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'kind', 'estimate',
    'quote_no', d.quote_no,
    'created_at', d.created_at,
    'site', d.site,
    'subtotal', d.subtotal,
    'gst_amount', d.gst_amount,
    'transport_labour_charge', d.transport_labour_charge,
    'total', d.total,
    'status', d.status,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('description', qi.description, 'qty', qi.qty, 'rate', qi.rate, 'amount', qi.amount)
                       order by qi.ctid)
        from public.quotation_items qi
       where qi.quotation_id = d.id), '[]'::jsonb));
end;
$$;

-- ── 6. Who may call what ───────────────────────────────────────────────

revoke all on function public.order_page(text) from public;
grant execute on function public.order_page(text) to anon, authenticated, service_role;
revoke all on function public.order_status(text) from public;
grant execute on function public.order_status(text) to anon, authenticated, service_role;
revoke all on function public.customer_khata(text) from public;
grant execute on function public.customer_khata(text) to anon, authenticated, service_role;
revoke all on function public.khata_document(text, text, text) from public;
grant execute on function public.khata_document(text, text, text) to anon, authenticated, service_role;

commit;
