-- 026: customer online orders (order requests).
--
-- A supplier shares a link — buildsupplyin.vercel.app/order/<order_link> —
-- where a customer, with no account, picks materials and quantities and sends
-- an ORDER REQUEST. It touches nothing else: no bill, payment, stock, balance
-- or ledger changes, and no stock is reserved. The supplier reviews it;
-- approving turns it into an ESTIMATE through the existing create_quotation
-- (unchanged), at the supplier's current rates and the quantities the
-- supplier settles on. Rejecting just marks it rejected.
--
-- Signed-out access is exactly three functions, each returning a fixed short
-- list of fields:
--   order_page(link)    business name, logo, and every material's name and
--                       unit, with its price only if the supplier shows
--                       prices. Never stock, customers, bills or anything else.
--   place_order(...)    saves a pending request. Everything is checked here;
--                       names and units come from the database; there is no
--                       price parameter at all.
--   order_status(code)  status, items and dates, for the random code handed
--                       back when the order was placed. Never a sequence number.
-- The order_requests table is readable and changeable only by its own supplier
-- (no admin access, as for every business table since migration 019).
--
-- Nothing in 024 or 025 changes. The supplier's new settings are ordinary
-- supplier-editable columns under 025's guard.

begin;

-- ── 1. The supplier's settings ─────────────────────────────────────────

alter table public.suppliers add column if not exists order_link text;
alter table public.suppliers add column if not exists ordering_enabled boolean not null default false;
alter table public.suppliers add column if not exists order_show_prices boolean not null default false;
alter table public.suppliers drop constraint if exists suppliers_order_link_format;
alter table public.suppliers add constraint suppliers_order_link_format
  check (order_link is null or order_link ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');
create unique index if not exists suppliers_order_link_unique on public.suppliers (order_link) where order_link is not null;

-- ── 2. The requests ────────────────────────────────────────────────────

create table if not exists public.order_requests (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- The customer's status link: random, never a sequence number.
  public_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  -- One per order form, so a second tap returns the first order.
  request_id uuid not null,
  customer_name text not null check (char_length(customer_name) between 2 and 60),
  phone text not null check (phone ~ '^[0-9]{10}$'),
  site text check (site is null or char_length(site) <= 120),
  delivery_date date,
  note text check (note is null or char_length(note) <= 300),
  -- [{material_id, name, unit, qty}]: copied from the supplier's materials
  -- when the order was placed. Never a price.
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  customer_id uuid references public.customers (id) on delete set null,
  quotation_id uuid references public.quotations (id) on delete set null,
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 200),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (supplier_id, request_id)
);
create index if not exists order_requests_list_idx on public.order_requests (supplier_id, status, created_at desc);
create index if not exists order_requests_phone_idx on public.order_requests (supplier_id, phone, created_at desc);

alter table public.order_requests enable row level security;
drop policy if exists order_requests_select_own on public.order_requests;
create policy order_requests_select_own on public.order_requests
  for select using (supplier_id = auth.uid());
drop policy if exists order_requests_update_own on public.order_requests;
create policy order_requests_update_own on public.order_requests
  for update using (supplier_id = auth.uid()) with check (supplier_id = auth.uid());
-- No insert or delete policy: requests arrive only through place_order, and
-- are kept (rejected, never deleted).
revoke all on public.order_requests from anon;

-- ── 3. The phone rule, server-side ─────────────────────────────────────
-- The same rule as the app's sanitizePhone (lib/numberInput.ts): drop
-- spaces, dashes and "+", a "+91" country code, India's leading "0", and a
-- "91" in front of a full 12-digit number. Callers then require 10 digits.

create or replace function public._normalize_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text := btrim(coalesce(p_phone, ''));
  v_digits text := regexp_replace(btrim(coalesce(p_phone, '')), '\D', '', 'g');
begin
  if v_text ~ '^\+\s*9\s*1' then
    v_digits := substr(v_digits, 3);
  end if;
  v_digits := regexp_replace(v_digits, '^0+', '');
  if length(v_digits) = 12 and left(v_digits, 2) = '91' then
    v_digits := substr(v_digits, 3);
  end if;
  return left(v_digits, 10);
end;
$$;

-- ── 4. The public page ─────────────────────────────────────────────────

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
  select id, business_name, logo_url, ordering_enabled, order_show_prices, status into s
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

create or replace function public.place_order(
  p_link text,
  p_request_id uuid,
  p_name text,
  p_phone text,
  p_site text,
  p_delivery_date date,
  p_note text,
  p_items jsonb,
  p_trap text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  v_token text;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := public._normalize_phone(p_phone);
  v_site text := nullif(btrim(coalesce(p_site, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_items jsonb;
  v_count int;
begin
  -- A hidden field only bots fill in: they are told it worked, and nothing is kept.
  if btrim(coalesce(p_trap, '')) <> '' then
    return jsonb_build_object('ok', true, 'token', null);
  end if;

  select id, ordering_enabled, status into s
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
  if (select count(*) from public.order_requests
       where supplier_id = s.id and created_at > now() - interval '1 hour') >= 60 then
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

  insert into public.order_requests (supplier_id, request_id, customer_name, phone, site, delivery_date, note, items)
  values (s.id, p_request_id, v_name, v_phone, v_site, p_delivery_date, v_note, v_items)
  on conflict (supplier_id, request_id) do nothing
  returning public_token into v_token;
  if v_token is null then
    -- Two taps arriving at the same instant: the other one got in first.
    select public_token into v_token
      from public.order_requests where supplier_id = s.id and request_id = p_request_id;
    return jsonb_build_object('ok', true, 'token', v_token, 'duplicate', true);
  end if;

  return jsonb_build_object('ok', true, 'token', v_token);
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
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('found', false);
  end if;
  select r.status, r.created_at, r.delivery_date, r.items, s.business_name into o
    from public.order_requests r
    join public.suppliers s on s.id = r.supplier_id
   where r.public_token = p_token;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'status', o.status,
    'business_name', o.business_name,
    'created_at', o.created_at,
    'delivery_date', o.delivery_date,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', i->>'name', 'unit', i->>'unit', 'qty', (i->>'qty')::numeric) order by n)
        from jsonb_array_elements(o.items) with ordinality as x(i, n)), '[]'::jsonb));
end;
$$;

-- ── 5. The supplier's decisions ────────────────────────────────────────
-- Run as the signed-in supplier (SECURITY INVOKER), so row-level security
-- still decides what they can reach — a supplier can only act on their own
-- orders and bill their own customers.

-- Turns an order into an estimate. `p_items` are the lines the supplier
-- settled on in the New Estimate screen, at their current rates — never
-- anything the customer sent. The customer is either one the supplier picked
-- (p_customer_id) or, only because the supplier chose to add them, a new one
-- (p_new_customer: {name, phone, site}).
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
  if v_order.status = 'approved' then
    return jsonb_build_object('already', true, 'quotation_id', v_order.quotation_id);
  end if;
  if v_order.status <> 'pending' then
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
     set status = 'approved', customer_id = v_customer, quotation_id = (v_quote->>'id')::uuid, decided_at = now()
   where id = p_order_id;

  return jsonb_build_object('quotation', v_quote, 'customer_id', v_customer);
end;
$$;

create or replace function public.reject_order(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_status text;
begin
  select status into v_status from public.order_requests where id = p_order_id for no key update;
  if not found then
    raise exception 'Order not found.';
  end if;
  if v_status = 'rejected' then
    return jsonb_build_object('already', true);
  end if;
  if v_status = 'approved' then
    raise exception 'This order was already turned into an estimate.';
  end if;
  update public.order_requests
     set status = 'rejected', reject_reason = nullif(left(btrim(coalesce(p_reason, '')), 200), ''), decided_at = now()
   where id = p_order_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── 6. Who may call what ───────────────────────────────────────────────

do $grants$
declare
  fn text;
begin
  foreach fn in array array[
    'public._normalize_phone(text)',
    'public.approve_order(uuid, uuid, uuid, jsonb, text, jsonb, boolean, numeric)',
    'public.reject_order(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
  foreach fn in array array[
    'public.order_page(text)',
    'public.place_order(text, uuid, text, text, text, date, text, jsonb, text)',
    'public.order_status(text)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to anon, authenticated, service_role', fn);
  end loop;
end
$grants$;

commit;
