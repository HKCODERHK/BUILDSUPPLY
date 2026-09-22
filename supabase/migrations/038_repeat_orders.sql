-- 038: a repeat order is an order.
--
-- Reported 2026-09-22: "when a customer made an order, when he made another
-- order with same details I couldn't see as a supplier".
--
-- 026 kept one rule too many. Alongside the request id — which is the real
-- protection, one id per form, so a double tap or a retry on a weak signal
-- records the order once — it also swallowed any order from the same phone
-- with the same items inside ten minutes, answering the customer "sent" and
-- keeping nothing. A customer who genuinely needs two loads of the same thing,
-- or who rings the shop and orders again, simply vanished.
--
-- That rule is removed. The request id stays, and so does every spam limit:
-- 3 pending per phone per day, 5 an hour per device, 20 an hour per shop, the
-- bot trap and blocked numbers. Nothing else in the function moved — it is
-- 037's version with those nine lines gone, same signature, so `create or
-- replace` keeps its grants.
--
-- No money, stock, balance or existing row changes. Safe to run twice.

begin;

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


commit;
