-- 044 — Three plans: Basic, Pro, Pro Yearly (2026-10-12)
--
-- The website sells Basic (no online orders), Pro and Pro Yearly. Until now
-- `suppliers.plan` gated nothing. This makes exactly one thing depend on it:
--
--   * A shop on Basic cannot take online orders. Its `ordering_enabled` is
--     kept false, so its order link reads as closed — the same as a supplier
--     switching ordering off today. Orders already received are untouched.
--
-- No value is renamed. Basic is the stored value 'starter' (the app shows it
-- as "Basic"), Pro is 'pro', and Pro Yearly is 'pro' with billing_cycle
-- 'yearly' — a column that already existed. So the existing CHECKs stand and
-- every older backup still restores as it is.
--
-- The two shops on 'starter' that use online orders today (Shree Balaji,
-- Rahul Traders) move to Pro first, at the user's decision, so nothing they
-- use stops working. Safe to run twice.

begin;

-- 1. Existing shops on Starter become Pro (the admin account is left alone).
--    Only the first time 044 runs — before its trigger exists. Pasting it
--    again later must not lift a shop the admin has since put on Basic.
do $$
declare
  n int;
begin
  if exists (select 1 from pg_trigger where tgname = 'suppliers_plan_rules'
               and tgrelid = 'public.suppliers'::regclass) then
    raise notice '044: already applied — no plans changed';
    return;
  end if;
  update public.suppliers
     set plan = 'pro'
   where role = 'supplier' and plan = 'starter';
  get diagnostics n = row_count;
  raise notice '044: % shop(s) moved from Starter to Pro', n;
end $$;

-- 2. Basic means no online orders.
--
-- Moving a shop to Basic (or creating one on it) switches ordering off by
-- itself. A Basic shop trying to switch ordering on is refused with a plain
-- sentence, which the app shows as it is.
create or replace function public.suppliers_plan_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role = 'supplier' and new.plan = 'starter' and new.ordering_enabled then
    if tg_op = 'UPDATE' and old.plan = 'starter' and not old.ordering_enabled then
      raise exception 'Online orders are part of the Pro plan. Ask BuildSupply to move you to Pro.'
        using errcode = 'P0001';
    end if;
    new.ordering_enabled := false;
  end if;
  return new;
end;
$$;

revoke all on function public.suppliers_plan_rules() from public, anon, authenticated;

drop trigger if exists suppliers_plan_rules on public.suppliers;
create trigger suppliers_plan_rules
  before insert or update of plan, ordering_enabled on public.suppliers
  for each row execute function public.suppliers_plan_rules();

commit;
