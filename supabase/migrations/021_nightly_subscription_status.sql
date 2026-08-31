-- BuildSupply — keep `suppliers.subscription_status` honest without anyone
-- remembering to look.
--
-- Nothing in the app depends on this. The admin panel derives every state it
-- shows from `subscription_expiry` at render time (frontend/src/lib/subscription.ts),
-- precisely so a stale stored status can never mislead anyone. This is data
-- hygiene: it keeps the stored column agreeing with reality for reports and
-- for anything queried directly.
--
-- pg_cron runs inside Postgres on Supabase's free tier. It only flips a
-- status column; it never suspends an account, never blocks a login and
-- never sends anything. Switching a supplier off stays a decision the admin
-- makes deliberately.

create extension if not exists pg_cron;

create or replace function public.expire_lapsed_subscriptions()
returns integer
language sql
security definer
set search_path to 'public'
as $$
  with updated as (
    update public.suppliers
    set subscription_status = 'expired'
    where role = 'supplier'
      and subscription_expiry is not null
      and subscription_expiry < current_date
      and subscription_status <> 'expired'
    returning 1
  )
  select count(*)::integer from updated;
$$;

comment on function public.expire_lapsed_subscriptions() is
  'Marks lapsed subscriptions expired. Status only - never suspends an account or blocks access.';

-- 19:30 UTC = 01:00 IST, comfortably after the working day.
select cron.schedule(
  'buildsupply-expire-subscriptions',
  '30 19 * * *',
  $cron$select public.expire_lapsed_subscriptions();$cron$
);
