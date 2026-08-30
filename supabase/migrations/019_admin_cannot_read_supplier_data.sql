-- BuildSupply — the admin is a platform operator, not a super-user over
-- supplier businesses.
--
-- Every business table was created with `(supplier_id = auth.uid()) OR
-- is_admin()`, which let the admin account read *and write* every
-- supplier's customers, bills, payments, materials and estimates. A supplier's
-- customer list and khata are their own commercial data; the platform owner
-- has no business reading them.
--
-- What the admin legitimately needs, and still keeps after this migration:
--   * suppliers            — subscription, plan, status, contact details
--   * material_categories / material_types / brands /
--     master_material_variants — the shared catalog they curate
--   * platform_settings    — platform-wide defaults
--   * admin_list_suppliers / admin_dashboard_stats — SECURITY DEFINER RPCs
--     that read only `suppliers` + `auth.users`
--
-- After this, a supplier's data is visible to exactly one account: theirs.

-- ── Business tables: tenant isolation only, no admin escape hatch ─────────
alter policy customers_tenant_isolation on public.customers
  using (supplier_id = auth.uid())
  with check (supplier_id = auth.uid());

alter policy invoices_tenant_isolation on public.invoices
  using (supplier_id = auth.uid())
  with check (supplier_id = auth.uid());

alter policy invoice_items_tenant_isolation on public.invoice_items
  using (supplier_id = auth.uid())
  with check (supplier_id = auth.uid());

alter policy payments_tenant_isolation on public.payments
  using (supplier_id = auth.uid())
  with check (supplier_id = auth.uid());

alter policy materials_tenant_isolation on public.materials
  using (supplier_id = auth.uid())
  with check (supplier_id = auth.uid());

alter policy quotations_tenant_isolation on public.quotations
  using (supplier_id = auth.uid())
  with check (supplier_id = auth.uid());

alter policy quotation_items_tenant_isolation on public.quotation_items
  using (supplier_id = auth.uid())
  with check (supplier_id = auth.uid());

-- ── Activity log ─────────────────────────────────────────────────────────
-- The admin screen only ever displayed the action name and its timestamp,
-- but `select *` still shipped the `details` column — which carries customer
-- names, invoice numbers and amounts — into the admin's browser.
--
-- Suppliers now read only their own rows. The admin reads a deliberately
-- narrowed view through the RPC below: enough to see whether an account is
-- being used and to support it, with none of the trade detail.
alter policy activity_log_select on public.activity_log
  using (supplier_id = auth.uid());

create or replace function public.admin_supplier_activity(p_supplier_id uuid)
returns table (
  id uuid,
  action text,
  actor_role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.id, a.action, a.actor_role::text, a.created_at
  from public.activity_log a
  where a.supplier_id = p_supplier_id
    and public.is_admin()
  order by a.created_at desc
  limit 200;
$$;

comment on function public.admin_supplier_activity(uuid) is
  'Admin-only activity feed for one supplier. Deliberately omits activity_log.details, which contains that supplier''s customer names and invoice amounts.';

revoke all on function public.admin_supplier_activity(uuid) from public, anon;
grant execute on function public.admin_supplier_activity(uuid) to authenticated;
