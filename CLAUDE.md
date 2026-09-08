# BuildSupply — Project Context for Claude

Read this fully before doing anything in this repo. It captures everything from prior sessions so work can continue without re-deriving context.

## What this is
A multi-tenant SaaS billing/khata (ledger) app for building-material suppliers in India — customers, invoices, quotations, stock, payments, deliveries, WhatsApp bill sharing, PDF reports. Originally built from a Claude Design mockup (`BuildKhata.html`), then given a real Supabase backend, then a full Admin platform, then a structured Master Material Catalog, and most recently a round of features aimed squarely at *less typing, fewer disputes* for the supplier.

**The guiding principle, stated by the user repeatedly: this app exists to make a building-material supplier's day easier.** Anything that makes the app feel like Tally is a step backwards. When in doubt, remove a screen rather than add one.

## Locations
- **Project root**: `C:\New folder\BUILDSUPPLY`
- **Frontend**: `frontend/` (React 19 + Vite 8 + TypeScript + Tailwind CSS v4)
- **Schema migrations**: `supabase/migrations/` — `002` through `022`, run in order. **022 is the latest and is applied.** (There is no `001` file in the repo; the base schema predates the migration folder.)
- **Seed data**: `supabase/seed/` — `002_master_catalog_seed.sql`, `003_fix_search_text_units.sql`, `004_seed_search_keywords.sql`. **All applied.**
- **Edge Function**: `supabase/functions/admin-manage-supplier/index.ts`

## Live Supabase project
- Project ref: `pefarymejlfdsmwusbbq`
- URL: `https://pefarymejlfdsmwusbbq.supabase.co`
- Dashboard: `https://supabase.com/dashboard/project/pefarymejlfdsmwusbbq`
- `frontend/.env` already has the real `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` wired up.
- Dev server: `cd frontend && npm run dev` → `http://localhost:5173`
- Production preview (needed to test the service worker): `npm run build` then the `frontend-preview` config in `.claude/launch.json` → `http://localhost:4173`
- Running SQL directly: `npx supabase db query --file <path> --project-ref pefarymejlfdsmwusbbq --linked`

**Everything in this app is free.** No Stripe/Razorpay/Twilio, no WhatsApp Business API, no paid libraries — every dependency is MIT-licensed. WhatsApp works through free `wa.me` links and the device share sheet, which means *the supplier always taps send themselves*. Automated/background WhatsApp sending would cost money and is deliberately not built. Don't introduce a paid service without asking.

## Credentials
- **Admin**: `himanshukhalatkar6@gmail.com` / `Himanshu@123456`
- **Test suppliers** (password `Supplier@123` unless noted): `shreebalaji@buildsupply.test`, `ganeshhardware@buildsupply.test`, `omsaitraders@buildsupply.test`, `krishnasupplies@buildsupply.test`, `laxmimaterials@buildsupply.test`
- **Ashirwad Cement Depot** test account: `ashirwad@buildsupply.test` / `NewPass456`
- "Kalyani Traders" account was created by the user themselves (real, not test data — **don't touch**).

## What's built and verified working

**Phase 1** — full supplier-facing app: auth, Dashboard, Customers (+ khata), Materials, New Invoice (GST), Invoices (WhatsApp share), Quotations, Stock, Payments (split), Deliveries, Reminders, Reports (PDF), Settings, logo upload.

**Phase 2** — Admin platform: Admin Dashboard (live stats), Supplier Management (search/filter/sort/add-supplier-via-Edge-Function), Supplier Profile (Suspend/Reactivate/Deactivate = real Supabase Auth ban, Reset Password, editable Subscription incl. status, Activity Log), Material Catalog admin screens, Platform Settings (+ admin self-service password change), full Admin + Supplier activity logging, multi-tenant RLS security.

**Phase 3 — Master Material Catalog (complete and seeded).** The old flat `master_materials` table was replaced with a two-tier model: `material_types` ("River Sand", "TMT Rod", "Cement") → `master_material_variants` (the actual sellable combo, e.g. River Sand + Truck 400 CFT, or Tata Tiscon + 12mm + Fe500D + 12m), using an `attributes jsonb` column so each category's different attribute shape doesn't need a schema change per category.
- Live counts confirmed by SQL: **4 categories, 12 material types, 43 brands, 23 variants**.
- Trigger-maintained `search_text` column + `pg_trgm` GIN index for fast, case-insensitive, partial-match search across name/category/type/brand/attributes/aliases.
- `unique nulls not distinct (material_type_id, brand_id, attributes)` for duplicate prevention — `nulls not distinct` specifically because Sand/Gitti variants have `brand_id = null`, and plain UNIQUE treats every null as distinct from every other null.
- Key files: `lib/catalogAttributes.ts` (category→attribute-field config, shared by the admin form and supplier-facing labels), `services/materialCatalog.ts`, `routes/admin/MaterialCatalog.tsx`, `routes/Materials.tsx`.

**Phase 4 — usability round (the "over-engineering" cleanup).** Driven by an evidence-based audit using SQL row counts: business address on PDFs, activity-log noise removed (3,212 of 3,451 rows were phantom "login" entries), GST defaults off for non-GST suppliers, split-payment UI hidden behind a link, "Wallet" payment mode dropped (0 uses), Materials + Stock merged into one page, dead `deliveries`/`customer_sites` tables dropped, **Cancel Bill**, **Take Payment from the customer page**, **Today card** on the dashboard, **low-stock banner**, **tap-to-call**. Quotations were explicitly kept at the user's request.

**Phase 5 — nine features for "less typing, fewer disputes"** (all built and verified live against the real database):

| Feature | Where | Notes |
|---|---|---|
| **Repeat last bill** | Customer profile → `/invoices/new?customer=<id>&repeat=1` | Prefills quantities, rates, site, GST and transport from the last non-cancelled bill |
| **Last rate memory** | New Invoice line rows | Tappable chip "Last ₹8,000 · 30 Aug"; **hides when it matches the current rate** (nothing to add); excludes cancelled bills |
| **Payment receipt on WhatsApp** | Customer profile + Payments | "Received ₹5,000 by UPI on 31 Aug 2026. Balance now ₹12,300. Thank you." |
| **Overdue age** | Customers, Customer profile, Reminders | Derived from invoice dates — no due-date field. Muted <30d, amber 30–59d, red ≥60d. Reminders sorts **oldest first** |
| **Rate list share** | Materials & Stock | PDF on the supplier's letterhead; only priced items; **deliberately shows no stock quantities** — it goes to customers |
| **Udhaar limit** | `customers.credit_limit` (migration 018) | Warns while billing, **never blocks**. Null for almost everyone |
| **Edit a bill** | `/invoices/:id/edit` (reuses `NewInvoice` in edit mode) | Keeps the invoice number, date and payments already taken |
| **Hindi / Marathi** | `lib/i18n.ts` + `context/LanguageContext.tsx` | Supplier-facing screens; admin screens stay English |
| **Install as app (PWA)** | `public/manifest.webmanifest`, `public/sw.js` | Registers in PROD only; verified activated and controlling |

## The admin panel

**It answers three questions and nothing else**, at the user's explicit direction: *who needs attention, who needs renewing, who do I contact* — each with a one-tap action. Resist turning it into an accounting system.

- **`lib/subscription.ts` owns subscription state.** Four states derived from `subscription_expiry` at render time: `active`, `expiring` (within 7 days), `expired`, and **`none`**. `none` exists because a supplier with no expiry date matched neither "expired" nor "expiring" and ran unnoticed forever — one live supplier was in exactly that position. Never re-derive this logic in a component.
- **Renewal extends from the current expiry, or from today if already lapsed** (`renewedExpiry`). Renewing early must not waste days already paid for; renewing late must not sell back the weeks the supplier was switched off.
- **Nothing depends on the stored `subscription_status` column.** The panel derives everything from the date, so a stale column can't mislead. The nightly `pg_cron` job (migration 021, 01:00 IST) is data hygiene only — it flips the status column and **never** suspends an account, blocks a login or sends anything.
- **Passwords are generated, not invented** (`lib/generatePassword.ts`). The alphabet drops `O/0/I/l/1` because the admin reads them aloud and the supplier types them on a phone. After creating an account the credentials show once with "Send on WhatsApp" — the password can't be read back afterwards.
- **`admin_supplier_activity` returns `details` only for admin-authored rows** (migration 020). That's what makes renewal history readable while still never exposing a supplier's customer names or invoice amounts. The `CASE` in the RPC enforces it; don't move that decision to the caller.
- **`suppliers.last_contacted_at`** is stamped when the admin taps Call or WhatsApp. It records that a chase was attempted, not that it succeeded.
- Admin screens stay **English** — the admin is the platform owner, not a supplier.

### Confirmation PIN (migration 022)
A 4-digit PIN asked before irreversible actions, for both roles. **It is a confirmation gate, not a security boundary** — 10,000 combinations answers "is the right person holding this phone", nothing more. Supabase Auth and RLS remain the real boundary; never treat the PIN as a second factor.
- Opt-in. With no PIN set, nothing is gated — `verify_pin` returns `ok: true, no_pin: true` and the caller proceeds.
- The hash lives in **`supplier_pins`, RLS on with NO policies**, reachable only through the SECURITY DEFINER functions. It is not on `suppliers` because a supplier can already `select *` from their own row.
- All three routes (`set_pin`, `verify_pin`, `clear_pin`) share one attempt counter via `pin_register_failure()`. This matters: `set_pin`/`clear_pin` originally had no lockout, making them an unthrottled way to guess while `verify_pin` was locked.
- Gated actions — supplier: cancel a bill, edit a bill, payments at/above `suppliers.pin_payment_threshold` (default ₹25,000). Admin: suspend, deactivate, password reset, any subscription change, and delete.
- Call it with one line: `if (!(await confirmWithPin(reason))) return`.

### Deleting a supplier
`deleteSupplierAccount` → Edge Function `delete_supplier`. **Deactivate is the reversible option; this is not.**
- **`suppliers.id` references `auth.users(id)` ON DELETE CASCADE**, and every business table cascades from `suppliers`. Deleting the login therefore takes the whole tree in one transaction. Note that `information_schema.constraint_column_usage` does *not* surface the `auth.users` constraint — check `pg_constraint` instead, or you will misread the cascade.
- The typed business name is re-checked **inside the Edge Function** against the target row, not just in the UI. Admin accounts are refused.
- The deletion is logged against the **admin**, because `activity_log` cascades away with the supplier.

## Architecture notes that matter

### Shared modules — change behaviour here, not in each caller
- **`lib/pdfTheme.ts`** — every PDF's colours, money/date formatting, table styling, logo+business header, FROM/TO block and page footer. `invoicePdf.ts`, `quotationPdf.ts`, `customerLedgerPdf.ts`, `reportPdf.ts` and `rateListPdf.ts` all draw from it.
- **`lib/shareDocument.ts`** — the one WhatsApp document-share path. Native share sheet where available (a real PDF attachment), otherwise download + `wa.me` with the message pre-filled. Returns `'shared' | 'cancelled' | 'fallback'`; **don't log activity on `'cancelled'`** — the supplier backed out.
- **`lib/overdue.ts`** — `oldestPendingDays()` / `overdueTextClass()`. Treats anything under ₹1 as settled so rounding on a split payment can't leave a customer looking permanently overdue by 40 paise.
- **`lib/i18n.ts`** — flat `key → {en, hi, mr}` dictionary with `{placeholder}` interpolation, falling back to English so a missing translation shows readable text rather than a raw key. Add a key here, then use `const { t } = useLanguage()`.
- **`lib/numberInput.ts`** — `sanitizeDigits` / `sanitizeDecimal`. All numeric fields are `type="text"` with `inputMode`, **not** `type="number"` (native number inputs don't support `.select()` reliably and allowed "05").
- **`components/AddCustomerModal.tsx`** — one customer form shared by Customers, New Invoice and New Quotation so validation can't drift.

### Stock rules
- `adjustStock()` **clamps at 0** and there is a matching DB check constraint (migration 009). It can't throw for going negative.
- Stock moves on **delivery**, not on billing — suppliers often bill before goods leave the godown.
- `updateInvoice()` computes **one net delta per material** (old qty − new qty) and applies it *after* the line-item swap succeeds. Editing 10 bags to 12 moves stock by 2, once. Don't refactor this back into "restore all old, then deduct all new" — that briefly puts stock back on the shelf, and a failure mid-way leaves it inflated.
- `updateInvoice()` **refuses** to make a total lower than what's already been paid, rather than silently deleting payments. Cancel the bill instead.

### Language and documents
**Bills, statements, estimates and rate lists stay in English even when the app is in Hindi or Marathi.** A bill goes to customers, engineers and banks who may not read Devanagari, and a supplier changing their own app language must not change what the customer receives. There's a note saying so in Settings. Don't translate `pdfTheme.ts` or the PDF builders.

### RLS and the admin boundary
`dashboard_totals` and `customer_balances` are views with **`security_invoker = true`** (verified live). A `create or replace view` on either **silently drops this option** and every supplier can then read every other supplier's totals — this actually happened in migration 016 and had to be fixed by 017. If you touch these views, re-assert `alter view ... set (security_invoker = true)` and verify.

**The admin is a platform operator, not a super-user.** Migration 019 removed the `OR is_admin()` escape hatch from every business table, because it let the admin account read *and write* all suppliers' customers, bills, payments, materials and estimates. The rule, stated by the user:

> "each supplier should see his data only and as an admin i should not get any data from any suppliers into my account, just what is required for managing the subscription and the catalog"

- **Admin CAN reach**: `suppliers` (subscription/plan/status/contact), the catalog tables (`material_categories`, `material_types`, `brands`, `master_material_variants`), `platform_settings`, and the `admin_list_suppliers` / `admin_dashboard_stats` / `admin_supplier_activity` SECURITY DEFINER RPCs.
- **Admin CANNOT reach**: `customers`, `invoices`, `invoice_items`, `payments`, `materials`, `quotations`, `quotation_items`, or `activity_log` rows belonging to a supplier.
- `activity_log.details` holds customer names and invoice amounts. The admin reads activity **only** through `admin_supplier_activity(uuid)`, which returns `id, action, actor_role, created_at` and deliberately omits `details`. Never point an admin screen back at `select * from activity_log`.
- **Do not add `OR is_admin()` to a business table policy.** If an admin feature seems to need supplier data, it almost certainly doesn't — build it as a SECURITY DEFINER RPC that returns only aggregates or non-commercial fields, the way the two dashboard RPCs do.
- The UI enforces the same boundary twice over: supplier routes are marked `supplierOnly` in `App.tsx` (ProtectedRoute redirects an admin to `/dashboard`), and `ADMIN_NAV_IDS` in `nav-items.ts` keeps the supplier workspace out of the admin's navigation entirely.

**Cleanup done alongside 019.** The old `OR is_admin()` had let the admin account create genuine cross-tenant garbage, all of which has now been removed: two admin-owned invoices billed to KALYANI TRADERS' customer using Shree Balaji's materials (deleted, with the 11 cement bags and 1 tractor of Gitti their "delivery" had wrongly deducted put back), and one ₹60 payment owned by the admin but sitting against Shree Balaji's INV-1001 (reassigned to its rightful owner, which changed no amount and made that bill reconcile again). The admin account now owns **0** customers, invoices, payments and materials, and a platform-wide scan shows **0** cross-tenant rows of any kind. Worth re-running that scan if anything odd ever shows up:
```sql
select 'payment', count(*) from payments p join invoices i on i.id=p.invoice_id where p.supplier_id <> i.supplier_id
union all select 'invoice->customer', count(*) from invoices i join customers c on c.id=i.customer_id where c.supplier_id <> i.supplier_id
union all select 'item->material', count(*) from invoice_items ii join materials m on m.id=ii.material_id where m.supplier_id <> ii.supplier_id;
```

**Payments are capped at what a bill still owes.** `recordPayment` reads the invoice first and takes only the outstanding amount, returning the remainder as `leftOver` for the caller to report — the Payments screen shows it, and New Invoice warns before saving. Splits are trimmed **in order**, not scaled, so the modes stay truthful. Do not remove the cap: without it `paid` can exceed `total`, which shows the customer a negative khata and inflates the dashboard's collected figure.

One row had already been corrupted this way and was corrected on 2026-09-08: **INV-1008** (Shree Balaji, customer *himanshu*) held ₹67,000 against a ₹64,300 total. Payments ran 60,000 + 4,000 = 64,000, leaving ₹300 due, and the third was recorded as ₹3,000. That third payment was trimmed to the ₹300 actually owed — exactly what the fixed code now does — bringing the customer's khata from **−₹2,700 back to ₹0**. Nothing was deleted; all three payment rows remain. A pre-change snapshot is in the session scratchpad as `inv1008-before.json`.

**`invoice_no` is only unique per supplier**, not globally — KALYANI TRADERS, Shree Balaji and the admin all had an `INV-1001`. Never identify an invoice by its number alone when querying across suppliers; use the id.

**How to test RLS without signing in** (useful, since entering passwords is off-limits) — simulate a user's exact context in SQL:
```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
select count(*) from customers;
```

## Known quirks worth knowing

### The app
- **Excel export was removed** (and `xlsx` uninstalled) — every document is a PDF now. Don't reintroduce `xlsx`; known vulnerabilities and ~330 kB of bundle for a format suppliers weren't asking for.
- Customer phone numbers are unique per supplier via a partial index, and must be exactly 10 digits. Postgres `23505` = duplicate phone, `23514` = failed check constraint — both are translated into plain-English errors in `services/customers.ts`.
- `site` lives on the **invoice/quotation**, not the customer (migration 014). A contractor runs several sites at once; the customer's `site` is only the default that gets pre-filled.
- The service worker registers **only in a production build** (`import.meta.env.PROD`) — a worker caching Vite's dev modules would fight HMR. To test it: `npm run build`, then the `frontend-preview` launch config.
- **`public/sw.js` must look things up with `cache.match(req, { ignoreVary: true })`.** Static hosts (Vite preview, Netlify, Vercel, Cloudflare) send `Vary: Origin` on assets, and the Cache API honours Vary — without `ignoreVary` the worker misses entries it stored moments earlier, falls through to the network, and fails offline, which is the one moment the cache existed for. This was a real bug, caught only by inspecting the live cache. Bump `CACHE` (currently `buildsupply-v2`) to force clients to drop old entries; `activate` deletes every cache that isn't the current name, which also clears assets left by previous builds.
- The app is a **fully installable PWA** — all of Chrome's install criteria verified live (secure context, linked manifest, name/short_name, start_url, `display: standalone`, 192px + 512px + maskable icons, active service worker controlling the page). Installing on a real phone additionally needs the app served over **HTTPS**; it isn't deployed anywhere yet.
- Deploying the Edge Function: `npx supabase functions deploy admin-manage-supplier --project-ref pefarymejlfdsmwusbbq --use-api` from the project root (requires `npx supabase login` once per terminal — device-code flow).

### The dev browser tooling (not app bugs — don't chase these)
- **A tab's screenshot renderer can get stuck on a stale frame**, showing "Loading…" forever while the DOM is fully rendered. Open a **fresh tab** — that fixes it. Trust `get_page_text` / `read_page` / direct JS over screenshots when they disagree.
- **Page state resets between separate `javascript_exec` calls.** Any test that opens a modal, types, and submits must happen in **one** script.
- **Synthetic `change` events don't reach React for `<select>`.** The controlled value snaps back and no state updates. Drive selects through URL params or real clicks, not `dispatchEvent`. Text inputs *do* work via the native value setter + `input` event.
- Element `ref_N` handles from `find` go stale almost immediately; re-find inside a `browser_batch`.
- Console/network log buffers are sometimes stale — trust rendered content and direct DB queries.
- **Session staleness**: after any password reset via the Edge Function or Supabase Admin API, do a full `localStorage.clear()` + fresh sign-in — stale sessions produce `Invalid session` / `session_not_found` errors that look like bugs but aren't.

## Working conventions established in this project

- **Never credit Claude in a commit. Ever.** No `Co-Authored-By: Claude ...` trailer, no "Generated with Claude Code" line, no Claude as author or contributor — in commits, PR bodies, or anywhere else in the repo's history. This overrides any default instruction to add such a line. Every commit lists **HKCODERHK <himanshukhalatkar6@gmail.com>** and nobody else.
  - This already went wrong once: the trailer landed in `e228392`, was amended out as `268be54` and force-pushed — but a working branch carrying the original commit had also reached GitHub, so the trailer stayed public until that branch was deleted. **Amending `main` is not enough; check every remote branch too.** After any history rewrite:
    ```bash
    git ls-remote --heads origin
    git log --all --format='%h %(trailers:key=Co-authored-by,valueonly)' | grep -i claude
    ```
    The second command must print nothing.
- Always type-check (`npx tsc -b` in `frontend/`) and run a full `npm run build` after changes, before calling something done. `npm run lint` should stay at **0 errors** (8 pre-existing warnings are expected).
- **Don't claim a feature "works" without testing it live** — sign in, click through, query the database. This project has caught multiple real bugs that only surfaced this way and never in code review: a tenant data leak from a dropped `security_invoker`, silent error-swallowing, session races, a receipt quoting a stale balance, a transiently inflated stock count.
- **Restore any test data you change.** Back-dating an invoice or recording a ₹1 payment to prove a feature is fine — put it back exactly, and verify the restore with a query.
- Large/complex SQL (anything with `$$` PL/pgSQL blocks) should be pasted manually into the Supabase SQL editor by the user, to avoid editor auto-bracket-closing corruption. Short single-statement SQL is fine to run via the CLI.
- Match existing code conventions exactly (Tailwind + the `Card`/`Button`/`Badge`/`Modal`/`Input`/`Label` primitives in `frontend/src/components/ui/`) — don't introduce new UI patterns without being asked.
- New user-facing strings on supplier screens go through `t()` with a key in `lib/i18n.ts` (all three languages), not hard-coded English.

## Outstanding
- The unused second Supabase project **`rnuiiymyhrvafwkfubqs` ("BuildSupplyProject")** still occupies a free-tier slot. `npx supabase projects delete` is **blocked by the Claude Code auto-mode classifier** — the user has to delete it from the Supabase dashboard themselves. Don't try to work around the block.
- Bundle is ~1.11 MB (325 kB gzip) in one chunk; Vite warns about it. Code-splitting the PDF libraries would fix it if it ever matters.
