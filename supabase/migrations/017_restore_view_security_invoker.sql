-- CRITICAL: migration 016 recreated these two views with `create or replace
-- view` and, in doing so, dropped their `security_invoker` setting. Without
-- it a view runs as its owner and ignores row-level security, so every
-- supplier's dashboard_totals / customer_balances rows became readable by
-- every other supplier.
--
-- security_invoker makes the view run as the querying user, which is what
-- lets the RLS policies on `invoices` and `customers` scope it per tenant.
-- Any future `create or replace view` here MUST keep this option.
alter view public.dashboard_totals set (security_invoker = true);
alter view public.customer_balances set (security_invoker = true);
