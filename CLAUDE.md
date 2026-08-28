# BuildSupply — Project Context for Claude

Read this fully before doing anything in this repo. It captures everything from prior sessions so work can continue without re-deriving context.

## What this is
A multi-tenant SaaS billing/khata (ledger) app for building-material suppliers in India — customers, invoices, quotations, stock, payments, delivery challans, WhatsApp bill sharing, PDF/Excel reports. Originally built from a Claude Design mockup (`BuildKhata.html`), then given a real Supabase backend, then a full Admin platform, and is now getting a proper structured Master Material Catalog.

## Locations
- **Project root**: `C:\New folder\BUILDSUPPLY`
- **Frontend**: `frontend/` (React + Vite + TypeScript + Tailwind CSS v4)
- **Schema migrations**: `supabase/migrations/` (001 through 004, run in order — 004 is the latest, applied)
- **Seed data**: `supabase/seed/002_master_catalog_seed.sql`
- **Edge Function**: `supabase/functions/admin-manage-supplier/index.ts`

## Live Supabase project
- Project ref: `pefarymejlfdsmwusbbq`
- URL: `https://pefarymejlfdsmwusbbq.supabase.co`
- Dashboard: `https://supabase.com/dashboard/project/pefarymejlfdsmwusbbq`
- `frontend/.env` already has the real `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` wired up.
- Dev server: `cd frontend && npm run dev` → `http://localhost:5173`

## Credentials
- **Admin**: `himanshukhalatkar6@gmail.com` / `Himanshu@123456`
- **Test suppliers** (password `Supplier@123` unless noted): `shreebalaji@buildsupply.test`, `ganeshhardware@buildsupply.test`, `omsaitraders@buildsupply.test`, `krishnasupplies@buildsupply.test`, `laxmimaterials@buildsupply.test`
- **Ashirwad Cement Depot** test account: `ashirwad@buildsupply.test` / `NewPass456`
- "Kalyani Traders" account was created by the user themselves (real, not test data — don't touch).

## What's built and verified working
**Phase 1** — full supplier-facing app: auth, Dashboard, Customers (+ khata), Materials, New Invoice (GST), Invoices (WhatsApp share), Quotations, Stock, Payments (split), Deliveries, Reminders, Reports (PDF/Excel), Settings, logo upload.

**Phase 2** — Admin platform: Admin Dashboard (live stats), Supplier Management (search/filter/sort/add-supplier-via-Edge-Function), Supplier Profile (Suspend/Reactivate/Deactivate = real Supabase Auth ban, Reset Password, editable Subscription incl. status, Activity Log), Material Catalog admin screens, Platform Settings (+ admin self-service password change), full Admin + Supplier activity logging, multi-tenant RLS security.

**In progress** — Master Material Catalog restructure. Replaced the old flat `master_materials` table with a proper two-tier model: `material_types` (e.g. "River Sand", "TMT Rod", "Cement") → `master_material_variants` (the actual sellable combo, e.g. River Sand + Truck 400 CFT, or Tata Tiscon + 12mm + Fe500D + 12m), using an `attributes jsonb` column so each category's different attribute shape doesn't need a schema change per category.

- Migration `supabase/migrations/004_master_catalog.sql` — **confirmed applied** to the live DB (verified via direct SQL: `material_types` and `master_material_variants` tables exist, old `master_materials` table is gone, `materials.low_stock_threshold` and `materials.master_material_id` columns confirmed present).
- Trigger-maintained `search_text` column + `pg_trgm` GIN index for fast, case-insensitive, partial-match search across name/category/type/brand/attributes/aliases.
- `unique nulls not distinct (material_type_id, brand_id, attributes)` constraint for duplicate prevention — had to use `nulls not distinct` specifically because Sand/Gitti variants have `brand_id = null` and plain UNIQUE treats every null as distinct from every other null.
- Frontend fully rewritten, **type-checks clean, builds clean**: `frontend/src/lib/catalogAttributes.ts` (category→attribute-field config shared by admin form and supplier labels), `frontend/src/services/materialCatalog.ts` (rewritten around new tables), `frontend/src/routes/admin/MaterialCatalog.tsx` (Categories/Brands/Material Types management + smart category-aware Add/Edit variant form + filters/search table), `frontend/src/routes/Materials.tsx` (supplier-facing — Browse Catalog tab uses server-side `searchCatalog()`, has "Can't find your material? + Add Custom" link, low-stock-threshold field).

### Immediate next step (not yet done)
**Run the seed script**: `supabase/seed/002_master_catalog_seed.sql` in the Supabase SQL editor — seeds 4 categories (Sand, Metal/Gitti, Steel/TMT Rods, Cement), material types under each, the full Steel and Cement brand lists, and fully-enumerated Sand/Metal-Gitti variants (type × Tractor/Truck-400/Truck-600 ≈ 21 variants). Steel/Cement deliberately get zero pre-seeded variants (admin adds specific products on demand). Idempotent (`on conflict do nothing` throughout) — safe to re-run. **Has not been run yet.**

### After seeding, still to do
Run the 13 acceptance tests from the original spec (search "cement"/"ultratech"/"12mm"/"river"/"400 cft", add-to-supplier data isolation, disable-doesn't-break-invoices, custom material stays private, case-insensitivity, re-running seed doesn't duplicate) — verify live in the browser (real Supabase project, real browser testing, screenshots/DB queries as proof — this project's established standard is to never just claim something works without checking).

## Known quirks worth knowing
- **Browser automation click flakiness**: clicks sometimes don't register on the first try in the dev browser tooling (not an app bug — confirmed by retrying via direct JS `.click()`, which always works).
- **Session staleness**: after any password reset via the Edge Function or Supabase Admin API, do a full `localStorage.clear()` + fresh sign-in before testing — stale sessions produce `Invalid session` / `session_not_found` errors that look like bugs but aren't.
- Console/network log inspection tools in this dev environment sometimes show a stale cached buffer — trust actual rendered page content and direct DB queries over these when they disagree.
- The `xlsx` npm package has known vulnerabilities — this project uses the patched build installed directly from `https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`, not the npm registry version. Don't `npm install xlsx` from the registry.
- Deploying the Edge Function: `npx supabase functions deploy admin-manage-supplier --project-ref pefarymejlfdsmwusbbq --use-api` from the project root (requires `npx supabase login` once per terminal — device-code flow).

## Working conventions established in this project
- Always type-check (`npx tsc -b` in `frontend/`) and run a full `npm run build` after changes, before calling something done.
- Don't claim a feature "works" without actually testing it live (sign in, click through, check the database) — this project has caught multiple real bugs (silent error-swallowing, session races, RLS gaps) that only surfaced through live testing, not code review.
- Large/complex SQL (anything with `$$` PL/pgSQL blocks) should be pasted manually into the Supabase SQL editor by the user rather than typed via automation, to avoid editor auto-bracket-closing corruption. Short single-statement SQL is fine to type directly.
- Match existing code conventions exactly (Tailwind + the `Card`/`Button`/`Badge`/`Modal`/`Input`/`Label` primitives in `frontend/src/components/ui/`) — don't introduce new UI patterns without being asked.
