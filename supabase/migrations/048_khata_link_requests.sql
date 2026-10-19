-- 048 — A customer asking their shop to resend their khata link (2026-10-19).
--
-- A customer on a phone with no saved shop, who has lost the khata link the
-- shop sent on WhatsApp, types their mobile number and asks for it again.
-- Every shop that has a customer with that number gets a request; the shop
-- sends the link from the customer page as always (Share khata link → Send on
-- WhatsApp), which goes only to the number the shop has on file.
--
-- Nothing is revealed to the person asking: the answer is the same whether
-- or not the number belongs to anyone, so the page cannot be used to find out
-- who buys where. Nothing is sent automatically, and no account is opened —
-- the khata link (with the matching phone number, checked on the sign-in
-- screen) is still the only way in.
--
-- Limits: one open request per customer per 24 hours (a second ask is quietly
-- the same request), and 100 requests an hour across the platform.
--
-- Additive: one table, three functions. Nothing existing is touched. Safe to
-- run twice.

begin;

create table if not exists public.khata_link_requests (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Set when the shop has dealt with it (sent the link, or dismissed it).
  handled_at timestamptz
);
create index if not exists khata_link_requests_open
  on public.khata_link_requests (supplier_id, created_at desc) where handled_at is null;
create index if not exists khata_link_requests_customer
  on public.khata_link_requests (customer_id, created_at desc);

alter table public.khata_link_requests enable row level security;
drop policy if exists khata_link_requests_read on public.khata_link_requests;
-- The shop's own requests only — no admin access, as for every business table (019).
create policy khata_link_requests_read on public.khata_link_requests
  for select to authenticated
  using (supplier_id = auth.uid());
-- Supabase grants everything on a new table by default; take it back.
revoke all on public.khata_link_requests from anon, authenticated;
grant select on public.khata_link_requests to authenticated;

-- ── Asking (anyone, signed out) ─────────────────────────────────────────
create or replace function public.request_khata_link(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := public._normalize_phone(p_phone);
begin
  if v_phone is null or v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a 10-digit mobile number.';
  end if;
  if (select count(*) from public.khata_link_requests where created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Too many requests right now. Please try again in a while.';
  end if;
  -- Two taps, or two phones, at once: one request.
  perform pg_advisory_xact_lock(hashtext('khata-link-request:' || v_phone));
  insert into public.khata_link_requests (supplier_id, customer_id)
  select c.supplier_id, c.id
    from public.customers c
    join public.suppliers s on s.id = c.supplier_id
   where c.phone = v_phone
     and s.status = 'active'
     and s.role = 'supplier'
     and not exists (
       select 1 from public.khata_link_requests r
        where r.customer_id = c.id
          and r.handled_at is null
          and r.created_at > now() - interval '24 hours');
  -- The same answer whoever the number belongs to, or nobody.
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.request_khata_link(text) from public;
grant execute on function public.request_khata_link(text) to anon, authenticated;

-- ── The shop's list (its own, open ones) ───────────────────────────────
-- Read through the table's own RLS; this only joins the customer the shop can
-- already read, so the Dashboard costs one call.
create or replace function public.open_khata_link_requests()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'customer_id', r.customer_id, 'created_at', r.created_at)
         order by r.created_at desc), '[]'::jsonb)
    from public.khata_link_requests r
   where r.supplier_id = auth.uid() and r.handled_at is null;
$$;
revoke all on function public.open_khata_link_requests() from public, anon;
grant execute on function public.open_khata_link_requests() to authenticated;

-- ── Done with one (the shop) ───────────────────────────────────────────
create or replace function public.handle_khata_link_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
begin
  select customer_id into v_customer
    from public.khata_link_requests
   where id = p_id and supplier_id = auth.uid();
  if not found then
    raise exception 'Request not found.';
  end if;
  -- Every open request from this customer goes with it.
  update public.khata_link_requests
     set handled_at = now()
   where supplier_id = auth.uid() and customer_id = v_customer and handled_at is null;
end;
$$;
revoke all on function public.handle_khata_link_request(uuid) from public, anon;
grant execute on function public.handle_khata_link_request(uuid) to authenticated;

commit;
