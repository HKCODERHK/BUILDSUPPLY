-- 040: the public does not need these three.
--
-- Found in the pre-launch audit (2026-09-22): three functions carried EXECUTE
-- for `anon`, the role every visitor holds with the publishable key that ships
-- in the bundle. Called anonymously against live they leaked nothing —
-- `admin_list_suppliers` answered `[]`, `admin_dashboard_stats` answered all
-- zeros, and `expire_lapsed_subscriptions` changed no row — because each
-- guards itself. This removes the grant anyway: a function nobody signed out
-- has any reason to call should not be callable signed out, and the guard
-- inside is then the second lock rather than the only one.
--
--   * `expire_lapsed_subscriptions` is the nightly pg_cron job
--     (`buildsupply-expire-subscriptions`, 01:00 IST), which runs as
--     `postgres` and is unaffected. It is the only writer of the three, so it
--     is the one that mattered.
--   * `admin_list_suppliers` and `admin_dashboard_stats` are called by the
--     admin screens as `authenticated`, which keeps its grant.
--
-- **`is_admin()` deliberately keeps its anon grant.** It is not spare surface:
-- RLS policies on material_categories, material_types, brands,
-- master_material_variants and platform_settings call it, and they are
-- ALL-command policies that apply to every role. `anon` holds SELECT on those
-- tables, so an anonymous read evaluates those policies and therefore calls
-- the function; without EXECUTE the read would raise "permission denied for
-- function is_admin" where it answers `[]` today. That is an error in place of
-- an empty list — a change to what the API returns — so the grant stays.
-- Verified on the local copy before deciding: with is_admin taken off
-- PUBLIC, four of those five anonymous reads turn into
-- "42501 permission denied for function is_admin" where they answer `[]`
-- today. Only platform_settings survives, because its read policy does not
-- call it.
--
-- No table, column, policy, function body or row of business data changes.
-- Safe to run twice.

-- Both `public` and `anon`, because the two differ depending on how the
-- database was built and only one of them is visible at a time:
--   * on live these three carry Postgres's default EXECUTE for PUBLIC
--     (`=X/postgres`) and no grant named anon, so revoking from `anon` alone
--     is a no-op — which is exactly what a first attempt did, silently;
--   * built from this migration folder they carry an explicit `anon=X`
--     instead (023 grants it by name), so revoking from `public` alone would
--     be the no-op.
-- Naming both is the only form that is right in either. Each function already
-- carries its own grant to `authenticated` and `service_role`, re-stated below
-- so this holds whichever way round it is, and the owner (`postgres`, which is
-- what pg_cron runs the nightly job as) always may.
revoke execute on function public.expire_lapsed_subscriptions() from public, anon;
revoke execute on function public.admin_list_suppliers() from public, anon;
revoke execute on function public.admin_dashboard_stats() from public, anon;

grant execute on function public.admin_list_suppliers() to authenticated, service_role;
grant execute on function public.admin_dashboard_stats() to authenticated, service_role;
grant execute on function public.expire_lapsed_subscriptions() to service_role;
