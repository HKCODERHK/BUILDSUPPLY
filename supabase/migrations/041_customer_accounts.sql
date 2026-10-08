-- 041 — customer accounts: a one-time connection instead of a link every time.
--
-- Until now a customer had no login at all. Their supplier sends them a
-- personal khata link on WhatsApp (028), and whoever holds that code sees that
-- one customer's account. This adds a real customer login — Supabase Auth,
-- anonymous for now — and connects it to the customer's record at each shop,
-- once, by proving the khata code. After that the customer opens /me and the
-- server answers by who is signed in, not by which link they kept.
--
-- What proves who the customer is:
--   * today, the personal khata link (`method = 'khata_link'`): the shop sent
--     it to the customer's own WhatsApp number;
--   * later, an SMS one-time code (`method = 'sms_otp'`), added to the same
--     account — `customer_accounts.phone` / `phone_verified_at` are its slots.
-- The shop's QR / order link identifies the SHOP only and never connects.
--
-- Nothing on the supplier or admin side changes. Everything the account reads
-- goes through the very functions the khata link already uses
-- (customer_khata, khata_document, confirm_received), so the two can't show
-- different figures, and a supplier who stops a khata link cuts the account's
-- access too.
--
-- Also closes two gaps that only matter once non-supplier logins exist: any
-- signed-in login could add rows to a supplier's activity log, and upload
-- files into its own folder of the public logos bucket. Both now need a
-- supplier (or the admin), which is everyone who can sign in today.
--
-- Safe to run twice. Needs 037 first.

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'accept_order' and pronamespace = 'public'::regnamespace) then
    raise exception '041 needs migration 037 first. Nothing was changed.';
  end if;
end $$;

-- ── The account and its connections ─────────────────────────────────────

create table if not exists public.customer_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Filled in only once SMS sign-in exists: the number the code went to, and when.
  phone text check (phone is null or phone ~ '^[0-9]{10}$'),
  phone_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.customer_accounts (user_id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  method text not null check (method in ('khata_link', 'sms_otp')),
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason in ('link_stopped', 'customer_removed')),
  unique (user_id, customer_id)
);
create index if not exists customer_connections_customer on public.customer_connections (customer_id) where revoked_at is null;

alter table public.customer_accounts enable row level security;
alter table public.customer_connections enable row level security;

-- A customer may read their own rows; every write goes through the functions
-- below. No supplier, no admin, nobody signed out.
drop policy if exists customer_accounts_own on public.customer_accounts;
create policy customer_accounts_own on public.customer_accounts for select using (user_id = auth.uid());
drop policy if exists customer_connections_own on public.customer_connections;
create policy customer_connections_own on public.customer_connections for select using (user_id = auth.uid());

revoke all on public.customer_accounts, public.customer_connections from anon, authenticated;
grant select on public.customer_accounts, public.customer_connections to authenticated;

-- ── A supplier stopping the link cuts the account too ───────────────────

create or replace function public._customer_link_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.khata_token is not null and new.khata_token is distinct from old.khata_token then
    update public.customer_connections
       set revoked_at = now(), revoked_reason = 'link_stopped'
     where customer_id = new.id and revoked_at is null;
  end if;
  return new;
end;
$$;
revoke all on function public._customer_link_changed() from public, anon, authenticated;

drop trigger if exists customers_khata_link_changed on public.customers;
create trigger customers_khata_link_changed
  after update of khata_token on public.customers
  for each row execute function public._customer_link_changed();

-- ── Who is calling ──────────────────────────────────────────────────────

-- The signed-in customer. A supplier's or the admin's login is refused: the
-- two kinds of account never mix.
create or replace function public._customer_caller()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if exists (select 1 from public.suppliers where id = v) then
    raise exception 'This is a shop account, not a customer account.' using errcode = '42501';
  end if;
  return v;
end;
$$;
revoke all on function public._customer_caller() from public, anon, authenticated;

-- The khata code behind one of the caller's own live connections, or nothing.
create or replace function public._connection_token(p_connection uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.khata_token
    from public.customer_connections cc
    join public.customers c on c.id = cc.customer_id
   where cc.id = p_connection
     and cc.user_id = public._customer_caller()
     and cc.revoked_at is null
     and c.khata_token is not null;
$$;
revoke all on function public._connection_token(uuid) from public, anon, authenticated;

-- ── What the customer's app calls ───────────────────────────────────────

-- First time: prove the khata code, and connect this account to that
-- customer's record at that shop. Calling it again is harmless; calling it
-- after the shop stopped and re-sent the link reconnects with the new code.
create or replace function public.connect_khata(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public._customer_caller();
  v_customer record;
  v_conn uuid;
begin
  -- Exactly the khata link's own rule: a real code, a live shop.
  if coalesce((public.customer_khata(p_token) ->> 'found')::boolean, false) is not true then
    return jsonb_build_object('ok', false);
  end if;
  select id, supplier_id into v_customer from public.customers where khata_token = p_token;
  if (select count(*) from public.customer_connections where user_id = v_user and revoked_at is null) >= 50 then
    raise exception 'Too many shops on this account.';
  end if;
  insert into public.customer_accounts (user_id) values (v_user) on conflict do nothing;
  insert into public.customer_connections (user_id, customer_id, supplier_id, method)
  values (v_user, v_customer.id, v_customer.supplier_id, 'khata_link')
  on conflict (user_id, customer_id) do update
     set revoked_at = null, revoked_reason = null, connected_at = now(), method = 'khata_link'
  returning id into v_conn;
  return jsonb_build_object('ok', true, 'connection', v_conn);
end;
$$;

-- Is this khata already on the caller's account? (The khata page asks, to
-- show "Saved" rather than "Save".)
create or replace function public.khata_connected(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object('connected', true, 'connection', cc.id)
      from public.customer_connections cc
      join public.customers c on c.id = cc.customer_id
     where cc.user_id = public._customer_caller()
       and cc.revoked_at is null
       and c.khata_token = p_token
       and coalesce(p_token, '') ~ '^[0-9a-f]{32}$'
  ), jsonb_build_object('connected', false));
$$;

-- Every shop on the account that still answers, oldest first. Built from the
-- khata link's own view, so a stopped link or a switched-off shop drops out.
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
    end if;
  end loop;
  return out;
end;
$$;

-- One shop's khata, exactly as the khata link shows it.
create or replace function public.my_khata(p_connection uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text := public._connection_token(p_connection);
begin
  if v_token is null then
    return jsonb_build_object('found', false);
  end if;
  return public.customer_khata(v_token);
end;
$$;

create or replace function public.my_khata_document(p_connection uuid, p_kind text, p_no text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text := public._connection_token(p_connection);
begin
  if v_token is null then
    return jsonb_build_object('found', false);
  end if;
  return public.khata_document(v_token, p_kind, p_no);
end;
$$;

create or replace function public.my_confirm_received(p_connection uuid, p_invoice_no text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := public._connection_token(p_connection);
begin
  if v_token is null then
    raise exception 'This shop is no longer on your account.';
  end if;
  return public.confirm_received(v_token, p_invoice_no);
end;
$$;

-- The customer takes a shop off their account.
create or replace function public.disconnect_shop(p_connection uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.customer_connections
     set revoked_at = now(), revoked_reason = 'customer_removed'
   where id = p_connection and user_id = public._customer_caller() and revoked_at is null;
end;
$$;

-- Signed-in customers only; signed out, nothing.
revoke all on function public.connect_khata(text), public.khata_connected(text), public.my_shops(),
  public.my_khata(uuid), public.my_khata_document(uuid, text, text), public.my_confirm_received(uuid, text),
  public.disconnect_shop(uuid) from public, anon;
grant execute on function public.connect_khata(text), public.khata_connected(text), public.my_shops(),
  public.my_khata(uuid), public.my_khata_document(uuid, text, text), public.my_confirm_received(uuid, text),
  public.disconnect_shop(uuid) to authenticated;

-- ── Two gaps closed for non-supplier logins ─────────────────────────────

-- The activity log: only a supplier (or the admin) writes it, as before —
-- now said outright rather than assumed from who could sign in.
drop policy if exists "activity_log_insert" on public.activity_log;
create policy "activity_log_insert" on public.activity_log
  for insert with check (
    actor_id = auth.uid()
    and exists (select 1 from public.suppliers s where s.id = auth.uid())
  );

-- The logos bucket: a supplier's own folder, and only a supplier's.
drop policy if exists logo_write_own_folder on storage.objects;
create policy logo_write_own_folder on storage.objects
  for insert with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.suppliers s where s.id = auth.uid())
  );
drop policy if exists logo_update_own_folder on storage.objects;
create policy logo_update_own_folder on storage.objects
  for update using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.suppliers s where s.id = auth.uid())
  );
drop policy if exists logo_delete_own_folder on storage.objects;
create policy logo_delete_own_folder on storage.objects
  for delete using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.suppliers s where s.id = auth.uid())
  );
