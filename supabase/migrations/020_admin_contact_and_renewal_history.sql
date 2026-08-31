-- BuildSupply — Phase 2 of the admin tooling: last-contact tracking and
-- renewal history.

-- ── Last contacted ───────────────────────────────────────────────────────
-- Stamped when the admin calls or WhatsApps a supplier from the admin panel.
-- Answers "have I already chased this one?" without the admin keeping it in
-- their head or scrolling their own WhatsApp.
alter table public.suppliers
  add column if not exists last_contacted_at timestamptz;

comment on column public.suppliers.last_contacted_at is
  'When the admin last called or messaged this supplier from the admin panel. Set by the panel, not by the supplier.';

-- ── Renewal history ──────────────────────────────────────────────────────
-- Migration 019 stripped `details` out of what the admin can read, because
-- supplier-authored rows carry customer names and invoice amounts.
--
-- Admin-authored rows are different: they are only ever written by
-- services/adminSuppliers.ts and services/materialCatalog.ts, and their
-- details hold platform data — plan, subscription dates, catalog edits.
-- Confirmed against every distinct admin action in the live log: supplier
-- management and catalog curation, nothing commercial.
--
-- So the admin gets details back for their own actions and still never for
-- the supplier's. The CASE is what enforces that, not the caller.
--
-- Return type changes, so the old signature has to go first.
drop function if exists public.admin_supplier_activity(uuid);

create function public.admin_supplier_activity(p_supplier_id uuid)
returns table (
  id uuid,
  action text,
  actor_role text,
  details jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    a.id,
    a.action,
    a.actor_role::text,
    case when a.actor_role = 'admin' then a.details else null end,
    a.created_at
  from public.activity_log a
  where a.supplier_id = p_supplier_id
    and public.is_admin()
  order by a.created_at desc
  limit 200;
$$;

comment on function public.admin_supplier_activity(uuid) is
  'Admin-only activity feed for one supplier. Returns `details` for admin-authored rows (subscription and catalog changes) and never for supplier-authored rows, which contain that supplier''s customer names and invoice amounts.';

revoke all on function public.admin_supplier_activity(uuid) from public, anon;
grant execute on function public.admin_supplier_activity(uuid) to authenticated;
