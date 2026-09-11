-- 025: a supplier can edit their own business details, and nothing else on
-- their account row.
--
-- Until now the suppliers table let any signed-in account update EVERY column
-- of its own row: policy "suppliers_update" is `id = auth.uid()` with no
-- column limits, and `authenticated` holds UPDATE on every column. That
-- included `role` — and both is_admin() and the admin-manage-supplier Edge
-- Function decide who is admin from that column. So a supplier sending their
-- own request could make themselves admin, then reset any other supplier's
-- password, suspend or delete accounts, and change subscriptions. Found on
-- 2026-09-11 while planning online orders; live showed exactly one admin
-- account (the real one), so it had not been used.
--
-- After this:
--   * A supplier may change, on their own row: business name, owner name,
--     phone, address, GST number, logo and the PIN threshold — everything the
--     app's Settings screen writes. (Columns added later for a supplier's own
--     settings are theirs to change too, unless added to the list below.)
--   * Status, suspension reason, plan, billing cycle, subscription dates and
--     status, last-contacted stamp, email, id and created_at: the admin only.
--   * `role`: nobody through the app, not even the admin. Only the admin Edge
--     Function (service role) or the SQL editor can change it.
--
-- Requests that are not the app's signed-in users — the Edge Function
-- (service_role), the SQL editor and the nightly subscription job (postgres)
-- — are not held to this at all.
--
-- Nothing else changes: no table, column, policy or other function.

begin;

create or replace function public.suppliers_guard_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Account roles can''t be changed from the app.' using errcode = '42501';
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.status is distinct from old.status
     or new.suspension_reason is distinct from old.suspension_reason
     or new.plan is distinct from old.plan
     or new.billing_cycle is distinct from old.billing_cycle
     or new.subscription_start is distinct from old.subscription_start
     or new.subscription_expiry is distinct from old.subscription_expiry
     or new.subscription_status is distinct from old.subscription_status
     or new.last_contacted_at is distinct from old.last_contacted_at
     or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the BuildSupply admin can change this.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists suppliers_guard_update on public.suppliers;
create trigger suppliers_guard_update
  before update on public.suppliers
  for each row execute function public.suppliers_guard_update();

revoke all on function public.suppliers_guard_update() from public, anon;
grant execute on function public.suppliers_guard_update() to authenticated, service_role;

commit;
