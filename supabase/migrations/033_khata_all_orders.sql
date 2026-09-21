-- 033: a customer's khata shows every order, not only the online ones.
--
-- Asked for 2026-09-21. "My orders" on the khata link listed order_requests
-- and nothing else, so a customer who had phoned the shop, or walked in, saw
-- an empty list — their order was there, but under My bills, wearing a bill
-- number. The page could not tell one from the other: nothing in the khata's
-- payload said which bill an online order became, or which bills came from
-- no order at all.
--
-- Two fields, both read-only, both derivable from what is already stored:
--   * each order gains `bill` — the live bill made from its estimate, if one
--     has been made (order_requests.quotation_id → invoices.quotation_id), the
--     same link order_status already reports;
--   * each bill gains `from_order` — true when an online order of this
--     customer's produced it. A bill with `from_order` false is an order the
--     shop took by phone or at the counter.
--
-- Nothing else about customer_khata changes: same arguments, same security
-- definer, same grants (create or replace keeps them), no table touched, no
-- row written. Safe to run twice.

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
                                          'delivered', i.delivered, 'received_at', i.received_at,
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
