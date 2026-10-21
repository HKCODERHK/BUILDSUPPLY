-- 050: how a material is sold — by vehicle load, or by its own unit.
--
-- Sand, gitti and other loose materials are sold by the vehicle: a tractor,
-- a 400 CFT truck, an 800 CFT truck, each at its own price per load. Cement,
-- steel and bricks are sold by their own unit: a bag, a piece, a kilo.
--
-- The app already had the shape for the first, just not the words: a shop's
-- "10mm Gitti — Tractor" and "10mm Gitti — Truck • 400 CFT" are two separate
-- materials today, each with its own price and stock. That is kept — every
-- vehicle option stays its own `materials` row, so every bill, estimate, GST
-- rate, stock move on delivery and stock log keeps working exactly as it does —
-- and what this adds is what those rows never said:
--
--   * `sold_by`        'vehicle' or 'unit'. Null on every material made before
--                      this, which behaves exactly as it always has (by its unit).
--   * `listing_name`   the material the options belong to ("River Sand"). The
--                      options of one listing share it; the order page shows
--                      them as one material with a choice of vehicle.
--   * `vehicle`, `capacity`, `capacity_unit`
--                      what one load is: "Truck", 800, "CFT". Required for a
--                      vehicle option. CFT and a tonne are never converted
--                      into each other: the unit is stored as the shop wrote it.
--   * `min_qty`, `qty_step`
--                      the least a customer may order and the steps it comes
--                      in (bricks by the 500, say). Optional. A vehicle option
--                      is always ordered in whole loads.
--   * `delivery_charge` optional; per load for a vehicle option, per order for
--                      anything else. Shown to the customer apart from the
--                      material's price, and offered as the estimate's
--                      transport charge when the order is approved.
--   * `available`      false: still listed, but not orderable — the shop's
--                      way of saying "no 1,600 CFT truck this week".
--
-- The customer's order page reads these (order_page), and placing an order
-- refuses a material switched off, a part load, or a quantity off the shop's
-- minimum or steps (place_order). An order still never carries a price: the
-- estimate is priced from the shop's own rates, as before. Each order line
-- now keeps the vehicle and capacity it was ordered with, so an order stays
-- readable after the shop changes a capacity.
--
-- Bills and estimates are unchanged: each line already keeps its own name
-- and rate, and a vehicle option's name carries its vehicle and capacity.
--
-- No row is changed and nothing is removed. Both functions keep their
-- signatures, so `create or replace` keeps their grants. Safe to run twice.

begin;

-- ── 1. The columns ──────────────────────────────────────────────────────
alter table public.materials add column if not exists sold_by text;
alter table public.materials add column if not exists listing_name text;
alter table public.materials add column if not exists vehicle text;
alter table public.materials add column if not exists capacity numeric;
alter table public.materials add column if not exists capacity_unit text;
alter table public.materials add column if not exists min_qty numeric;
alter table public.materials add column if not exists qty_step numeric;
alter table public.materials add column if not exists delivery_charge numeric;
alter table public.materials add column if not exists available boolean not null default true;

alter table public.materials drop constraint if exists materials_sold_by_check;
alter table public.materials add constraint materials_sold_by_check
  check (sold_by is null or sold_by in ('vehicle', 'unit'));

alter table public.materials drop constraint if exists materials_vehicle_option_check;
alter table public.materials add constraint materials_vehicle_option_check
  check (
    sold_by is distinct from 'vehicle'
    or (
      btrim(coalesce(listing_name, '')) <> ''
      and btrim(coalesce(vehicle, '')) <> ''
      and capacity is not null
      and btrim(coalesce(capacity_unit, '')) <> ''
    )
  );

alter table public.materials drop constraint if exists materials_selling_values_check;
alter table public.materials add constraint materials_selling_values_check
  check (
    char_length(coalesce(listing_name, '')) <= 80
    and char_length(coalesce(vehicle, '')) <= 40
    and char_length(coalesce(capacity_unit, '')) <= 20
    and (capacity is null or (capacity > 0 and capacity <= 1000000))
    and (min_qty is null or (min_qty > 0 and min_qty <= 100000))
    and (qty_step is null or (qty_step > 0 and qty_step <= 100000))
    and (delivery_charge is null or (delivery_charge >= 0 and delivery_charge <= 10000000))
  );

-- One listing cannot offer the same vehicle and capacity twice.
create unique index if not exists materials_vehicle_option_unique
  on public.materials (supplier_id, lower(btrim(listing_name)), lower(btrim(vehicle)), capacity, lower(btrim(capacity_unit)))
  where sold_by = 'vehicle';

-- ── 2. The order page shows them ────────────────────────────────────────
-- 037's version with the new fields added to each material. The delivery
-- charge is a price, so it is sent only where the shop shows prices.
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
               'price', case when s.order_show_prices and m.rate > 0 then m.rate end,
               'sold_by', m.sold_by,
               'listing_name', case when m.sold_by = 'vehicle' then btrim(m.listing_name) end,
               'vehicle', case when m.sold_by = 'vehicle' then btrim(m.vehicle) end,
               'capacity', case when m.sold_by = 'vehicle' then m.capacity end,
               'capacity_unit', case when m.sold_by = 'vehicle' then btrim(m.capacity_unit) end,
               'min_qty', case when m.sold_by = 'vehicle' then null else m.min_qty end,
               'qty_step', case when m.sold_by = 'vehicle' then null else m.qty_step end,
               'delivery_charge', case when s.order_show_prices and m.delivery_charge > 0 then m.delivery_charge end,
               'available', m.available)
             order by m.category nulls last, m.name)
        from public.materials m
       where m.supplier_id = s.id), '[]'::jsonb));
end;
$$;

-- ── 3. Placing an order checks them ─────────────────────────────────────
-- 038's version. What changed: a material switched off, a part load, or a
-- quantity below the shop's minimum or off its steps is refused, and each
-- line keeps the vehicle and capacity it was ordered with. Nothing else moved.
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

  -- What the customer chose, against what the shop sells today. Checked
  -- before anything is kept, so a refused order leaves nothing behind.
  if exists (
    with raw as (
      select e->>'material_id' as mid_text, e->>'qty' as qty_text
        from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as a(e)
    ), clean as (
      select mid_text::uuid as mid, round(qty_text::numeric, 2) as qty
        from raw
       where mid_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and qty_text ~ '^[0-9]{1,6}(\.[0-9]{1,2})?$'
    ), grouped as (
      select mid, sum(qty) as qty from clean where qty > 0 group by mid
    )
    select 1 from grouped g
      join public.materials m on m.id = g.mid and m.supplier_id = s.id
     where not m.available
  ) then
    raise exception 'Something you chose is not available right now. Please remove it and send again.';
  end if;

  if exists (
    with raw as (
      select e->>'material_id' as mid_text, e->>'qty' as qty_text
        from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as a(e)
    ), clean as (
      select mid_text::uuid as mid, round(qty_text::numeric, 2) as qty
        from raw
       where mid_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and qty_text ~ '^[0-9]{1,6}(\.[0-9]{1,2})?$'
    ), grouped as (
      select mid, sum(qty) as qty from clean where qty > 0 group by mid
    )
    select 1 from grouped g
      join public.materials m on m.id = g.mid and m.supplier_id = s.id
     where (m.sold_by = 'vehicle' and g.qty <> trunc(g.qty))
        or (m.sold_by is distinct from 'vehicle' and m.min_qty is not null and g.qty < m.min_qty)
        or (m.sold_by is distinct from 'vehicle' and m.qty_step is not null and mod(g.qty, m.qty_step) <> 0)
  ) then
    raise exception 'A quantity does not match how the shop sells it. Vehicle loads are whole numbers; check the minimum and steps shown.';
  end if;

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
           'qty', g.qty)
           -- What one load was when it was ordered, kept with the order.
           || case when m.sold_by = 'vehicle' then jsonb_build_object(
                'listing_name', btrim(m.listing_name),
                'vehicle', btrim(m.vehicle),
                'capacity', m.capacity,
                'capacity_unit', btrim(m.capacity_unit))
              else '{}'::jsonb end
           order by g.ord), '[]'::jsonb),
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
