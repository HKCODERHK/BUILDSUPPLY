-- 032: fewer ways to spam a supplier's order link.
--
-- Asked for 2026-09-16 ("what if a spammer places orders again and again").
-- 026 already keeps three pending orders per phone in 24 hours, the same
-- order sent twice once, and a hidden field bots fill in. A spammer who types
-- a new made-up number each time got past the per-phone limit, so:
--   1. Per device: at most 5 orders an hour from the same phone or computer,
--      whatever numbers it types. The device is told apart by its internet
--      address, stored only as a keyed hash (HMAC, with a secret no app user
--      can read, mixed with the supplier's id) — never the address itself,
--      and not linkable across suppliers. Cloudflare's cf-connecting-ip is
--      preferred when present (a phone cannot set it); otherwise the first
--      X-Forwarded-For entry, as Supabase's own docs read it. Which one was
--      used is kept too, so it can be checked on live.
--   2. Block this number: the supplier's list of blocked phones. An order from
--      one is told it worked (like the bot trap) and nothing is kept.
--      Blocking also rejects that number's orders still waiting.
--   3. The whole shop: at most 20 orders an hour (was 60). This one holds
--      whatever the headers say.
--
-- Nothing about bills, payments, stock, estimates or balances changes.
-- Safe to paste twice. Needs 031.

begin;

-- ── 1. The secret the device hashes are keyed with ─────────────────────
-- One row, RLS on with no policies: no signed-in or signed-out user reads it.

create table if not exists public.order_guard_secret (
  id boolean primary key default true check (id),
  secret text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
insert into public.order_guard_secret (id) values (true) on conflict (id) do nothing;
alter table public.order_guard_secret enable row level security;
revoke all on public.order_guard_secret from anon, authenticated;

-- ── 2. Which device each order came from, hashed ───────────────────────
-- RLS on with no policies: only place_order (below) reads and writes it.

create table if not exists public.order_request_clients (
  order_id uuid primary key references public.order_requests (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  client_hash text not null,
  source text not null check (source in ('cf', 'xff', 'real')),
  created_at timestamptz not null default now()
);
create index if not exists order_request_clients_recent
  on public.order_request_clients (supplier_id, client_hash, created_at desc);
alter table public.order_request_clients enable row level security;
revoke all on public.order_request_clients from anon, authenticated;

-- ── 3. The supplier's blocked numbers ──────────────────────────────────

create table if not exists public.order_blocked_phones (
  supplier_id uuid not null default auth.uid() references public.suppliers (id) on delete cascade,
  phone text not null check (phone ~ '^[0-9]{10}$'),
  created_at timestamptz not null default now(),
  primary key (supplier_id, phone)
);
alter table public.order_blocked_phones enable row level security;
drop policy if exists order_blocked_phones_select_own on public.order_blocked_phones;
create policy order_blocked_phones_select_own on public.order_blocked_phones
  for select using (supplier_id = auth.uid());
drop policy if exists order_blocked_phones_insert_own on public.order_blocked_phones;
create policy order_blocked_phones_insert_own on public.order_blocked_phones
  for insert with check (supplier_id = auth.uid());
drop policy if exists order_blocked_phones_delete_own on public.order_blocked_phones;
create policy order_blocked_phones_delete_own on public.order_blocked_phones
  for delete using (supplier_id = auth.uid());
revoke all on public.order_blocked_phones from anon;
grant select, insert, delete on public.order_blocked_phones to authenticated;

-- ── 4. The calling device, hashed (or nothing if there is no address) ──

create or replace function public._order_client(p_supplier uuid)
returns table (client_hash text, source text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  h json;
  v_ip text;
  v_source text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return;
  end;
  if h is null then
    return;
  end if;
  v_ip := nullif(btrim(h->>'cf-connecting-ip'), '');
  v_source := 'cf';
  if v_ip is null then
    v_ip := nullif(btrim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), '');
    v_source := 'xff';
  end if;
  if v_ip is null then
    v_ip := nullif(btrim(h->>'x-real-ip'), '');
    v_source := 'real';
  end if;
  if v_ip is null then
    return;
  end if;
  return query
    select encode(extensions.hmac(v_ip || '|' || p_supplier::text, g.secret, 'sha256'), 'hex'), v_source
      from public.order_guard_secret g
     where g.id;
end;
$$;

revoke all on function public._order_client(uuid) from public, anon, authenticated;

-- ── 5. place_order: as in 026, plus blocked numbers and the two limits ─

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

  insert into public.order_requests (supplier_id, request_id, customer_name, phone, site, delivery_date, note, items)
  values (s.id, p_request_id, v_name, v_phone, v_site, p_delivery_date, v_note, v_items)
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

-- ── 6. The supplier blocks or unblocks a number ────────────────────────
-- Runs as the caller, so RLS keeps each supplier to their own list and their
-- own orders. Blocking also rejects that number's orders still waiting (no
-- reason is shown to the sender).

create or replace function public.block_order_phone(p_phone text, p_block boolean default true)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_phone text := public._normalize_phone(p_phone);
  v_rejected int := 0;
begin
  if v_phone !~ '^[0-9]{10}$' then
    raise exception 'Please enter a 10-digit mobile number.';
  end if;
  if p_block then
    insert into public.order_blocked_phones (supplier_id, phone) values (v_supplier, v_phone)
    on conflict (supplier_id, phone) do nothing;
    with r as (
      update public.order_requests
         set status = 'rejected', reject_code = 'other', reject_reason = null, decided_at = now()
       where supplier_id = v_supplier and phone = v_phone and status = 'pending'
      returning 1)
    select count(*) into v_rejected from r;
  else
    delete from public.order_blocked_phones where supplier_id = v_supplier and phone = v_phone;
  end if;
  return jsonb_build_object('ok', true, 'blocked', p_block, 'phone', v_phone, 'rejected', v_rejected);
end;
$$;

-- ── 7. Who may call what ───────────────────────────────────────────────

revoke all on function public.place_order(text, uuid, text, text, text, date, text, jsonb, text) from public;
grant execute on function public.place_order(text, uuid, text, text, text, date, text, jsonb, text) to anon, authenticated, service_role;
revoke all on function public.block_order_phone(text, boolean) from public, anon;
grant execute on function public.block_order_phone(text, boolean) to authenticated, service_role;

commit;
