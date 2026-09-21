-- 037: how the customer means to pay, and approving an order on the spot.
--
-- Two things asked for 2026-09-22:
--
--   1. **A payment method on an online order.** A customer should be able to
--      order whether or not they want to pay online, and the supplier should
--      see which before they start pricing it. Cash is what nearly every
--      order is; "pay online" means the customer pays the supplier's own UPI
--      ID directly, because there is no payment gateway in this app and there
--      is not going to be one. **Nothing is ever marked paid by this.** The
--      money goes straight to the supplier's bank, BuildSupply never sees it,
--      and the supplier records it with Receive payment as they always have.
--      The choice is an intention, not a receipt.
--
--      It is offered only where it can actually be acted on: the supplier has
--      a UPI ID and has switched UPI on for customers. That is the same
--      `khata_upi_enabled` switch 029 added — one switch, one idea ("I take
--      UPI from customers"), rather than a second one to keep in step.
--
--   2. **Approving an order without leaving Orders.** Until now Approve meant
--      "write the estimate", and the status only turned Approved once that
--      estimate was saved. The supplier can now say yes on the spot —
--      `accept_order` — and price it afterwards; the customer sees Approved
--      straight away. `approve_order` still does the whole thing in one step
--      for anyone who would rather, and now also accepts an order that was
--      already said yes to but has no estimate yet.
--
-- Nothing about money, stock, balances or a bill's total changes. Safe to run
-- twice.

begin;

-- ── 1. What the customer said about paying ──────────────────────────────

alter table public.order_requests
  add column if not exists payment_method text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_requests_payment_method_check') then
    alter table public.order_requests
      add constraint order_requests_payment_method_check
      check (payment_method is null or payment_method in ('cash', 'online'));
  end if;
end $$;

comment on column public.order_requests.payment_method is
  'What the customer said they would do (037): cash, or pay the supplier''s UPI ID directly. Null on orders placed before this, and on any order where the shop does not take UPI so the question was never asked. It never means the money arrived.';

-- ── 2. The order page says whether paying online is on offer ────────────
-- 031's function, plus `upi`. Nothing else in it moved, and the UPI ID itself
-- is deliberately NOT returned here: there is no amount to pay yet, so there
-- is nothing for the customer to do with it.

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
  select id, business_name, logo_url, address, phone, ordering_enabled, order_show_prices, status,
         upi_id, khata_upi_enabled into s
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
    -- Only then is the question worth asking.
    'upi', s.khata_upi_enabled and s.upi_id is not null,
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

-- ── 3. Placing an order can carry the choice ────────────────────────────
-- The parameter list changes, so the old signature goes and its grants are
-- re-made by hand — `create or replace` only keeps them when the signature is
-- the same. Everything inside is 032's, with the method read and stored.

drop function if exists public.place_order(text, uuid, text, text, text, date, text, jsonb, text);

create or replace function public.place_order(
  p_link text,
  p_request_id uuid,
  p_name text,
  p_phone text,
  p_site text,
  p_delivery_date date,
  p_note text,
  p_items jsonb,
  p_trap text default null,
  p_payment_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  c record;
  v_id uuid;
  v_token text;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := public._normalize_phone(p_phone);
  v_site text := nullif(btrim(coalesce(p_site, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_items jsonb;
  v_count int;
  v_pay text;
begin
  -- A hidden field only bots fill in: they are told it worked, and nothing is kept.
  if btrim(coalesce(p_trap, '')) <> '' then
    return jsonb_build_object('ok', true, 'token', null);
  end if;

  select id, ordering_enabled, status, upi_id, khata_upi_enabled into s
    from public.suppliers
   where order_link = lower(btrim(coalesce(p_link, ''))) and role = 'supplier';
  if not found or not s.ordering_enabled or s.status <> 'active' then
    raise exception 'Online ordering is currently unavailable.';
  end if;
  if p_request_id is null then
    raise exception 'Something went wrong. Please try again.';
  end if;

  -- The same form sent twice (a double tap, a retry): the first order.
  select public_token into v_token
    from public.order_requests where supplier_id = s.id and request_id = p_request_id;
  if found then
    return jsonb_build_object('ok', true, 'token', v_token, 'duplicate', true);
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'Please enter your name.';
  end if;
  if v_phone !~ '^[0-9]{10}$' then
    raise exception 'Please enter a 10-digit mobile number.';
  end if;

  -- A number this supplier blocked: told it worked, like the bot trap, and
  -- nothing is kept — so there is nothing to learn by trying again.
  if exists (select 1 from public.order_blocked_phones where supplier_id = s.id and phone = v_phone) then
    return jsonb_build_object('ok', true, 'token', null);
  end if;

  if p_delivery_date is not null and (p_delivery_date < v_today or p_delivery_date > v_today + 90) then
    raise exception 'Please choose a delivery date within the next 90 days.';
  end if;
  if char_length(coalesce(v_site, '')) > 120 then
    raise exception 'The site or address is too long.';
  end if;
  if char_length(coalesce(v_note, '')) > 300 then
    raise exception 'The note is too long.';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 60 then
    raise exception 'Please send fewer items in one order.';
  end if;

  -- Paying online is only real where the shop takes UPI; anything else the
  -- form might send becomes cash, and where the question was never asked at
  -- all the order simply carries nothing.
  v_pay := case
             when lower(coalesce(p_payment_method, '')) = 'online'
                  and s.khata_upi_enabled and s.upi_id is not null then 'online'
             when lower(coalesce(p_payment_method, '')) in ('cash', 'online') then 'cash'
             else null
           end;

  -- Only this supplier's own materials, positive quantities, and the name and
  -- unit as the supplier has them. Anything else sent — a price, another
  -- supplier's material — is simply not read.
  with raw as (
    select e->>'material_id' as mid_text, e->>'qty' as qty_text, ord
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(e, ord)
  ), clean as (
    select mid_text::uuid as mid, round(qty_text::numeric, 2) as qty, ord
      from raw
     where mid_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and qty_text ~ '^[0-9]{1,6}(\.[0-9]{1,2})?$'
  ), grouped as (
    select mid, sum(qty) as qty, min(ord) as ord
      from clean where qty > 0 group by mid
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'material_id', m.id,
           'name', m.name,
           'unit', coalesce(nullif(btrim(m.unit_label), ''), nullif(btrim(m.per_label), ''), nullif(btrim(m.stock_unit), ''), ''),
           'qty', g.qty) order by g.ord), '[]'::jsonb),
         count(*)
    into v_items, v_count
    from grouped g
    join public.materials m on m.id = g.mid and m.supplier_id = s.id
   where g.qty <= 100000;
  if v_count = 0 then
    raise exception 'Please add at least one material.';
  end if;

  -- Plain spam limits. A genuine customer never meets them.
  if (select count(*) from public.order_requests
       where supplier_id = s.id and phone = v_phone and status = 'pending'
         and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'You already have orders waiting with this supplier. Please call them instead.';
  end if;
  select * into c from public._order_client(s.id);
  if c.client_hash is not null and (select count(*) from public.order_request_clients
       where supplier_id = s.id and client_hash = c.client_hash
         and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many orders from this phone just now. Please try again later, or call the shop.';
  end if;
  if (select count(*) from public.order_requests
       where supplier_id = s.id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many orders right now. Please try again in a while.';
  end if;

  -- The same order sent again after a reload (a new form, the same phone and
  -- the same items, within ten minutes): the first order.
  select public_token into v_token
    from public.order_requests
   where supplier_id = s.id and phone = v_phone and items = v_items
     and created_at > now() - interval '10 minutes'
   order by created_at desc
   limit 1;
  if found then
    return jsonb_build_object('ok', true, 'token', v_token, 'duplicate', true);
  end if;

  insert into public.order_requests (supplier_id, request_id, customer_name, phone, site, delivery_date, note, items, payment_method)
  values (s.id, p_request_id, v_name, v_phone, v_site, p_delivery_date, v_note, v_items, v_pay)
  on conflict (supplier_id, request_id) do nothing
  returning id, public_token into v_id, v_token;
  if v_token is null then
    -- Two taps arriving at the same instant: the other one got in first.
    select public_token into v_token
      from public.order_requests where supplier_id = s.id and request_id = p_request_id;
    return jsonb_build_object('ok', true, 'token', v_token, 'duplicate', true);
  end if;

  if c.client_hash is not null then
    insert into public.order_request_clients (order_id, supplier_id, client_hash, source)
    values (v_id, s.id, c.client_hash, c.source);
  end if;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

revoke all on function public.place_order(text, uuid, text, text, text, date, text, jsonb, text, text) from public;
grant execute on function public.place_order(text, uuid, text, text, text, date, text, jsonb, text, text)
  to anon, authenticated, service_role;

-- ── 4. Saying yes without writing the estimate ──────────────────────────

create or replace function public.accept_order(p_order_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_order public.order_requests%rowtype;
begin
  -- RLS decides whose order this is: the function runs as the caller, so
  -- another supplier's order is simply not found.
  select * into v_order from public.order_requests where id = p_order_id for no key update;
  if not found then
    raise exception 'Order not found.';
  end if;
  if v_order.status = 'approved' then
    return jsonb_build_object('already', true, 'quotation_id', v_order.quotation_id);
  end if;
  if v_order.status <> 'pending' then
    raise exception 'This order was rejected, so it can''t be approved.';
  end if;

  -- Only the answer. No customer is created, no estimate written, no money
  -- and no stock touched — the supplier prices it when they are ready.
  update public.order_requests
     set status = 'approved', decided_at = now()
   where id = p_order_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.accept_order(uuid) from public, anon;
grant execute on function public.accept_order(uuid) to authenticated, service_role;

-- ── 5. Pricing an order that was already said yes to ────────────────────
-- 026's function, with one change: an order already approved but carrying no
-- estimate can still have one written for it.

create or replace function public.approve_order(
  p_request_id uuid,
  p_order_id uuid,
  p_customer_id uuid,
  p_new_customer jsonb,
  p_site text,
  p_items jsonb,
  p_gst boolean default false,
  p_transport numeric default 0
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_order public.order_requests%rowtype;
  v_customer uuid := p_customer_id;
  v_phone text;
  v_quote jsonb;
begin
  select * into v_order from public.order_requests where id = p_order_id for no key update;
  if not found then
    raise exception 'Order not found.';
  end if;
  -- Already priced: the estimate that was made, not a second one.
  if v_order.status = 'approved' and v_order.quotation_id is not null then
    return jsonb_build_object('already', true, 'quotation_id', v_order.quotation_id);
  end if;
  if v_order.status not in ('pending', 'approved') then
    raise exception 'This order was rejected, so it can''t become an estimate.';
  end if;

  if v_customer is null then
    if p_new_customer is null or char_length(btrim(coalesce(p_new_customer->>'name', ''))) < 2 then
      raise exception 'Choose the customer for this estimate.';
    end if;
    v_phone := nullif(public._normalize_phone(p_new_customer->>'phone'), '');
    if v_phone is not null and v_phone !~ '^[0-9]{10}$' then
      v_phone := null;
    end if;
    begin
      insert into public.customers (supplier_id, name, phone, site)
      values (v_supplier, btrim(p_new_customer->>'name'), v_phone, nullif(btrim(coalesce(p_new_customer->>'site', '')), ''))
      returning id into v_customer;
    exception when unique_violation then
      raise exception 'A customer with this phone number already exists. Choose them from the list instead.';
    end;
  end if;

  v_quote := public.create_quotation(p_request_id, v_customer, p_site, p_items, p_gst, p_transport);

  update public.order_requests
     set status = 'approved',
         customer_id = v_customer,
         quotation_id = (v_quote->>'id')::uuid,
         -- An order approved on the spot keeps the moment it was answered.
         decided_at = coalesce(decided_at, now())
   where id = p_order_id;

  return jsonb_build_object('quotation', v_quote, 'customer_id', v_customer);
end;
$$;

-- ── 6. The customer's own status link ───────────────────────────────────
-- 034's function, plus what the customer chose, the bill's figures so the
-- amount asked for is the amount still owed, and the supplier's UPI ID —
-- only when this customer said they would pay online and there is something
-- to pay. A customer who chose cash is never shown a QR.

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
      v_due := coalesce(q.total, 0);
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

-- `create or replace` keeps the grants order_page, order_status and
-- approve_order already had.

commit;
