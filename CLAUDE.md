# BuildSupply — Project Context for Claude

Read this fully before doing anything in this repo. It captures everything from prior sessions so work can continue without re-deriving context.

## What this is
A multi-tenant SaaS billing/khata (ledger) app for building-material suppliers in India — customers, invoices, quotations, stock, payments, deliveries, WhatsApp bill sharing, PDF reports. Originally built from a Claude Design mockup (`BuildKhata.html`), then given a real Supabase backend, then a full Admin platform, then a structured Master Material Catalog, and most recently a round of features aimed squarely at *less typing, fewer disputes* for the supplier.

**The guiding principle, stated by the user repeatedly: this app exists to make a building-material supplier's day easier.** Anything that makes the app feel like Tally is a step backwards. When in doubt, remove a screen rather than add one.

## Locations
- **Project root**: `C:\New folder\BUILDSUPPLY`
- **Frontend**: `frontend/` (React 19 + Vite 8 + TypeScript + Tailwind CSS v4)
- **Schema migrations**: `supabase/migrations/` — `002` through `037`, run in order. **037 is the latest and is applied** (2026-09-22 — a payment method on an order and approving one on the spot, see Phase 28). 034, 035 and 036 were pasted the same day, 034 before 036: **036 refuses to run before 034**, because both re-issue `mark_invoice_delivered` and the other order would silently remove the stock logging from deliveries. 033 is applied too (2026-09-21, Phase 24).
- **Host config**: `frontend/public/_redirects` + `_headers` (Netlify / Cloudflare Pages) and `frontend/vercel.json` (Vercel). Whichever host is used ignores the other's file, so all three can sit in the repo together. On Vercel the project's **Root Directory must be `frontend`** or `vercel.json` is never found.
- **Seed data**: `supabase/seed/` — `002_master_catalog_seed.sql`, `003_fix_search_text_units.sql`, `004_seed_search_keywords.sql`. **All applied.**
- **Edge Function**: `supabase/functions/admin-manage-supplier/index.ts`

## Live Supabase project
- Project ref: `pefarymejlfdsmwusbbq`
- URL: `https://pefarymejlfdsmwusbbq.supabase.co`
- Dashboard: `https://supabase.com/dashboard/project/pefarymejlfdsmwusbbq`
- `frontend/.env` already has the real `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` wired up.
- Dev server: `cd frontend && npm run dev` → `http://localhost:5173`. The `frontend-dev` launch config sets `autoPort` — another chat's server often holds 5173, and `vite.config.ts` reads `PORT` for exactly this.
- Production preview (needed to test the service worker): `npm run build` then the `frontend-preview` config in `.claude/launch.json` → `http://localhost:4173`
- Running SQL directly: `npx supabase db query --file <path> --project-ref pefarymejlfdsmwusbbq --linked`

**Everything in this app is free.** No Stripe/Razorpay/Twilio, no WhatsApp Business API, no paid libraries — every dependency is MIT-licensed. WhatsApp works through free `wa.me` links and the device share sheet, which means *the supplier always taps send themselves* — and documents go as real PDF attachments through the phone's share sheet, where the supplier picks the customer (Phase 8). Automated/background WhatsApp sending would cost money and is deliberately not built. Don't introduce a paid service without asking.

## Accounts

**No live password belongs in this file.** The admin password was rotated on
2026-09-08 precisely because it was sitting here, and this app is going onto
the public internet where that login is the front door to every supplier's
subscription. Ask the user if you need it; it lives in their password manager.

Only three accounts exist — verified against `auth.users`, not assumed:

| Account | Email | Notes |
|---|---|---|
| **Admin** | `himanshukhalatkar6@gmail.com` | Password in the user's password manager |
| **KALYANI TRADERS** | `gajendrakhalatkar6@gmail.com` | The user's own real account and real data — **don't touch** |
| **Shree Balaji Building Materials** | `shreebalaji@buildsupply.test` | The only surviving test supplier; safe to click through |

The other test suppliers named in earlier sessions — `ganeshhardware`,
`omsaitraders`, `krishnasupplies`, `laxmimaterials` and `ashirwad` — no longer
exist. Don't try to sign in as them.

Both passwords were rotated on 2026-09-08, before this app went anywhere
public — the admin's and Shree Balaji's. Verified afterwards by testing each
retired string against the stored hashes with `crypt()`: none of the three
passwords this file used to carry authenticates on any account any more. They
are not repeated here, because a password that is dead in this project may
still be alive somewhere the user reused it.

**Shree Balaji was deliberately kept rather than deleted.** It holds 7
customers, 18 invoices, 25 payments, 5 quotations and ₹236,822 of billing,
and it is the only dataset in this project that is safe to experiment on —
the alternative is KALYANI TRADERS, which is the user's real business. That
data is what caught the INV-1008 overpayment, proved the payment cap trims
splits in order, and exposed the UTC/IST ledger drift. Rotating its password
closed the same hole deleting it would have, and cost nothing. Don't delete
it to tidy up.

Claude cannot type passwords, so it cannot sign in as anyone. That is why the
RLS simulation recipe further down exists, and why UI verification needs the
user to sign in first and leave the tab open.

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
| **Payment receipt on WhatsApp** | Customer profile + Payments | "Received ₹5,000 by UPI on 31 Aug 2026. Balance now ₹12,300. Thank you." Since Phase 8 it carries a receipt PDF (`lib/receiptPdf.ts`) naming the bills the money cleared |
| **Overdue age** | Customers, Customer profile, Reminders | Derived from invoice dates — no due-date field. Muted <30d, amber 30–59d, red ≥60d. Reminders sorts **oldest first** |
| **Rate list share** | Materials & Stock | PDF on the supplier's letterhead; only priced items; **deliberately shows no stock quantities** — it goes to customers |
| **Udhaar limit** | `customers.credit_limit` (migration 018) | Warns while billing, **never blocks**. Null for almost everyone |
| **Edit a bill** | `/invoices/:id/edit` (reuses `NewInvoice` in edit mode) | Keeps the invoice number, date and payments already taken |
| **Hindi / Marathi** | `lib/i18n.ts` + `context/LanguageContext.tsx` | Supplier-facing screens; admin screens stay English |
| **Install as app (PWA)** | `public/manifest.webmanifest`, `public/sw.js` | Registers in PROD only; verified activated and controlling |

**Phase 6 — getting it fit to deploy (2026-09-08).** A full admin-side button
sweep, then the bugs that sweep and a pre-deploy audit turned up. Every one was
confirmed against the live database or a real production build before it was
touched, and again afterwards.

| Fixed | Was |
|---|---|
| **Catalog duplicate names** (`services/materialCatalog.ts`) | The admin screens print `error.message` into a red card, and nothing translated Postgres codes — so adding an existing brand showed ``duplicate key value violates unique constraint "brands_name_key"``. Now 23505 is translated on all four create paths and the three renames, the way `services/customers.ts` already did for phones. |
| **Every WhatsApp button** (`lib/whatsapp.ts`) | Numbers kept India's leading `0` and never got a country code, so wa.me was handed an unreachable number. See the shared-modules entry. |
| **Customer ledger and Reports dates** (`lib/localDate.ts`) | Bucketed by UTC, filtered against IST date pickers. 3 of 20 invoices and 5 of 25 payments in the live database were already on the wrong side of it. See the shared-modules entry. |
| **Service worker + host config** | Cached failed navigations as the offline shell, and nothing told a host to serve `index.html` for browser-only routes — the installed app's `start_url` is `/dashboard`, so the very first launch would have hit a 404. |
| **Safe-area insets** (`index.css`, `AppShell.tsx`) | `viewport-fit=cover` with nothing keeping the system's strips clear. |
| **`admin_list_suppliers` missing `last_contacted_at`** (migration 023) | The "Last contacted" column had always shown an em dash. Applied 2026-09-08. `DROP FUNCTION` takes the grants with it, so `anon`/`authenticated`/`service_role` execute, `security definer` and the pinned `search_path` were all re-verified afterwards — as was the boundary: admin gets 3 rows, a supplier gets 0. No redeploy was needed, since the frontend already read the field. |

Two things noticed and deliberately **not** changed, since they are cosmetic and
were outside what was asked: `components/ui/modal.tsx` has no `role="dialog"`,
`aria-modal` or focus trap, and its close X is `type="submit"` (harmless only
because it sits outside the `<form>`).

**Phase 7 — day one for a new supplier (2026-09-10).** Five real suppliers
start on the app, so this round was about what a new one sees first, not
losing work on a budget Android phone, and the app confirming what it just
did. Everything verified live against Shree Balaji and on a production build.

| Built | Where | Notes |
|---|---|---|
| **Illustrated empty states** | `components/EmptyState.tsx` — Customers, Invoices, Quotations, Payments, Materials, Reminders | Branch on the *unfiltered* length, so a search that matches nothing still says "no match" instead of the welcome. The header action (and Materials' stat cards) hide while a list is empty — the empty state carries the one button. Payments offers **New invoice** when nothing is outstanding, since a payment needs a bill. |
| **Start-here card** | `components/StartHereCard.tsx` on the Dashboard | Until the first bill exists: add materials (opens the catalog, `?view=catalog`) → add a customer (`?new=1`) → make a bill, a scene per step. **Skip for now** lasts one visit (sessionStorage `buildsupply-start-skipped:<supplierId>`) and the card returns next launch until a bill exists — on purpose. |
| **An unfinished bill survives the phone closing the app** | `lib/drafts.ts`, `components/Drafts.tsx` | See the shared-modules entry. |
| **Switching apps no longer wipes a bill** | `context/AuthContext.tsx` | See Known quirks — this was the real cause of "I went to WhatsApp and my bill was gone". |
| **The splash tells the story** | `components/SplashStory.tsx` | Site → Materials → Delivery → Bill → Payment, told by the tipper. Replaced a generated photograph (`public/splash-art.jpg`, deleted). |
| **Success ticks** | `components/SuccessTick.tsx`, `components/DeliveryPrompt.tsx`, `lib/useFlash.ts` | Payment received (Payments and the customer page); bill saved (New Invoice and estimate → bill — a supplier's first bill says "Your first bill is ready"); stock added (the card lights up with "+50 bags"); customer added (the new card lights up). |

**Deliberately not animated**, agreed with the user against a 20-item wish
list — the rule is *fast first, animated second*: "bill shared" (the share
sheet resolves when a target is picked, not when WhatsApp sends, so it would
sometimes be untrue), page transitions (superseded 2026-09-15 at the user's
request: a 0.15s cross-fade on tab switches — Phase 15), counting-up dashboard numbers, report charts (Reports is
PDF-only), and delete animations (bills are cancelled, which is already
confirmed and PIN-gated). Feedback belongs only where it confirms something
that just happened, on a screen that was appearing anyway.

**Phase 8 — every customer WhatsApp button sends a real PDF (2026-09-11).**
The user's requirement, in order of preference: **(1)** open the exact
customer's WhatsApp chat with the real PDF already attached, supplier presses
Send; failing that **(2)** the real PDF through the phone's share sheet, the
supplier picks WhatsApp and then the customer, and presses Send. **Never a
link, never Supabase Storage, never a PDF saved to Downloads, never anything
sent automatically** — each was ruled out explicitly.

- **(1) is not possible in this PWA — checked, not assumed.** There is no
  native layer (no Capacitor, no `android/` or `ios/`). A web page reaches
  WhatsApp only through a URL (`wa.me`: number and text, no file field) or the
  Web Share API (files, but `ShareData` has only `title`, `text`, `url` and
  `files` — no recipient). Chrome's `intent://` links carry only primitive
  extras, not the file stream WhatsApp needs. A native Android app could do it
  (a share intent with `EXTRA_STREAM`, `setPackage("com.whatsapp")` and the
  undocumented `jid` extra) — see Still to do.
- **(2) is what is built.** `lib/shareDocument.ts` hands the PDF, built in
  memory, to `navigator.share` with the message as its text. All nine
  customer-facing buttons use it: bill page, bills list, estimate page,
  estimates list, Reminders, customer page → Remind (the full statement, the
  same one Reminders sends), both payment receipts (`lib/receiptPdf.ts`), and
  the rate list. The list buttons, Remind and receipts used to send text only.
  Reports has a WhatsApp button beside every Download too, built from the
  same description of the report so the two can't differ: the customer ledger
  (a customer-facing message) and the five other reports (a plain "what and
  which dates" line — they usually go to an accountant or partner). Its label
  is just "WhatsApp" ("Send on WhatsApp" beside "Download PDF" measured 339px
  against the 296px a report card has at 360px), and both buttons drop to
  `size="sm"` on phones, full size from `sm` up, like the customer page's
  header. At full size "पीडीएफ डाउनलोड" + "WhatsApp" is 303px, so Hindi and
  Marathi wrapped while English (283px) did not — one place where English is
  not the widest. At phone size: 244px English, 261px Hindi/Marathi, 287px
  while "Preparing…".
  The admin↔supplier WhatsApp buttons (renewal, login details, chasing a
  supplier) stay `wa.me` text: they are messages, not documents.
- **An expired tap gets a prompt, never a download.** A tap only lets a page
  open the share sheet for a few seconds, and building the PDF — plus fetching
  the bill, on the list screens — can outlast that. When
  `navigator.userActivation.isActive` has lapsed, or the share throws
  `NotAllowedError`, `components/ShareDocumentPrompt.tsx` (mounted once in
  AppShell) offers "Your PDF is ready — Send on WhatsApp": a fresh tap. Where
  the browser cannot share files at all (most desktops) it says so and stops.
  Both pass `captureBack={false}`: they usually open over the payment dialog,
  and two stacked dialogs both listening for back close together.
- **A link-based version was built first and removed the same day.** It
  uploaded each PDF to a `documents` bucket and sent a `/d/` link (migration
  024, a `vercel.json` proxy, a service-worker exclusion). The user rejected
  links outright. The code is gone, migration 024 never reached `main`, and in
  the live database the policy was dropped and the bucket emptied and deleted —
  verified: only `catalog` and `logos` remain. Don't bring it back.
- **Saving a new customer as a phone contact — asked for, not possible here.**
  No browser API writes to the phone's contacts (the Contact Picker API is
  read-only), and the user ruled out the web-side substitutes: a VCF file,
  copying the number, manual entry. It needs a native app too.
- **Verified 2026-09-11 without a phone.** This browser pane has no
  `navigator.share`, so it was simulated, and the real `shareDocument.ts` and
  prompt were driven through every path with a real generated PDF: fresh tap →
  one share call carrying one `application/pdf` File and no URL; sheet closed →
  `cancelled`; expired tap → prompt → `shared`; `NotAllowedError` → prompt →
  `shared`; no file sharing → the "can't attach" notice → `unsupported`. Across
  all of it: zero network requests, zero downloads, zero `wa.me` opens, no link
  in any message.
- **Verified on the user's Android phone (2026-09-11)**: the customer page's
  Ledger → WhatsApp share sends the statement PDF as a document. Whether
  WhatsApp keeps the message as the document's caption or drops it is
  WhatsApp's choice, not ours.
- **The Ledger button shows a spinner, not "Preparing…"**, while the PDF is
  built. The wider word pushed the Call button (under ⋯) onto a line of its
  own. Keep that row's widths fixed.

**Phase 9 — money integrity (migration 024, 2026-09-11). Applied to live and
merged to `main` the same day.** The user's order: double payment
→ overpayment/advance → atomic saves → duplicate numbers → the 1,000-row cap →
opening balance. They chose the *simple version*: the complexity lives in the
database, and the supplier sees two buttons and a few lines.

- **Receipts are permanent.** A `payments` row is never edited or deleted.
  Which bills a receipt paid lives in `payment_allocations`; when money moves
  (bill cancelled, opening balance changed) the allocation gets `released_at`
  and is never deleted. Triggers `payments_keep` / `payment_allocations_keep`
  quietly skip any delete that isn't a cascade (the admin deleting a whole
  supplier account still works). This matters because the app on `main`
  deletes a bill's payments when it cancels it. `invoices_release_on_cancel`
  releases the money however a bill is cancelled.
- **Advance** is the unallocated part of receipts. A customer payment clears the
  opening balance first, then the oldest bills, and anything left over is kept.
  The next bill uses it automatically. **Receive advance** (`payments.is_advance`)
  is only used on bills made *after* it, never on old dues.
- **Every money or stock change is one database function**, run as the caller
  (SECURITY INVOKER, so RLS still applies) under a lock on the customer:
  `record_payment`, `record_customer_payment`, `record_advance`,
  `create_invoice` (counter payment splits in `p_payments`), `update_invoice`,
  `mark_invoice_delivered`, `cancel_invoice`, `adjust_stock`,
  `create_quotation`, `set_opening_balance`. Every save carries a request id
  (`client_requests`), so a double tap or two phones record it once — INV-1024
  had two ₹830 payments 31 seconds apart.
- **Row locks are `FOR NO KEY UPDATE`, never `FOR UPDATE`. Keep it that way.**
  `FOR UPDATE` also blocks the key-share lock Postgres takes on a row a new bill
  line merely names, so a delivery and a bill save touching the same materials
  deadlocked (1 in 7,782 in the 20-phone test).
- **Numbers**: an advisory lock plus `max(INV-<digits>) + 1` (first is
  INV-1001); unique partial indexes back it up. Odd old formats are ignored,
  and cancelled bills keep their numbers.
- **Opening balance** is an `invoices` row with `kind = 'opening'` (one live row
  per customer). Changing it cancels the old row and adds a new one, so old
  figures stay on record. It counts in the khata but never in sales: see
  `isBill()`, and the views' `kind = 'bill'` filters.
- **`services/db.ts`**: `fetchAll` pages every "all of X" read past PostgREST's
  silent 1,000-row cap (the order must end in `id`); `callRpc` passes the
  function's plain-English error through; `newRequestId`.
- **UI**: the customer page has Receive payment, with Receive advance below it
  and a Ledger + WhatsApp button beside that. New Invoice has "+ Paid partly by
  another mode?". The Payments list shows "Advance" or "2 bills". Cancel
  says the money is kept.
- **The migration** allocates existing payments to their bills oldest first,
  capped at each total. It then **stops with "Nothing was changed"** if any
  bill disagrees, and is safe to paste twice. The only visible change on live:
  INV-1024's second ₹830 becomes that Shree Balaji customer's advance
  (collected +₹830). KALYANI has no payments, so none of its money moves.
- **Tested 2026-09-11 on a local Supabase in Docker**, not live. Its structure
  was rebuilt from `schema.sql` + 002→023; 317 of 323 objects are identical to
  live, and the other 6 differ only in whitespace. It used Shree Balaji's data
  plus ~7,000 synthetic rows: **186/186 checks** pass, and a 20-phone `pgbench`
  storm of 8,121 operations had 0 failures and 0 deadlocks. The old app keeps
  working against 024 (tested). Setup notes: Docker Desktop is at
  `%LOCALAPPDATA%\Programs\DockerDesktop`. Keep the local project **outside the
  repo** (`supabase start --workdir <dir>`, storage enabled), because started
  from the repo the CLI auto-applies `supabase/migrations` without the base
  schema.
- **Applied 2026-09-11** by the user in the SQL editor. The full backup is
  `backups/2026-09-11_1625-live-after-024-found/`. Checked read-only on live
  afterwards:
  - All 38 bills and 76 payments are identical to the 03:02 backup.
  - There are 75 allocations and 0 bills out of step.
  - The only advance is ₹830, on INV-1024's customer.
  - All 6 triggers and 10 functions are present, none callable signed out.
  - RLS is on both new tables, and both views are still `security_invoker`.

**Phase 10 — online orders (migration 026, 2026-09-11). Applied to live and
merged the same day.** A supplier shares one link; a customer picks materials
and sends a request; the supplier approves it into an estimate or rejects it.
Free, no customer account, no SMS, and **an order never bills, takes money,
moves stock or changes a balance** — approving makes an ordinary estimate.

- **Customer side (public, outside `ProtectedRoute`, no splash):**
  `/order/<link>` (`routes/OrderPage.tsx`) lists the supplier's materials with
  −/+ quantities, then name, phone (`PhoneInput`), site, date (today to +90
  days) and a note. Prices show only if the supplier turns them on, marked
  indicative. The success view gives a status link, `/order-status/<32 hex>`
  (`routes/OrderStatus.tsx`): status, items and dates only. Recent orders are
  remembered on the customer's phone (localStorage `buildsupply-orders:<link>`).
- **Supplier side:** Orders (`routes/Orders.tsx`, New / Approved / Rejected),
  a count on Orders and a dot on the phone's More tab (`AppShell`), and a
  Dashboard banner. Order detail (`routes/OrderDetail.tsx`) says "Possible
  match" when the phone belongs to a customer, with Call and WhatsApp.
  **Approve** opens New Estimate at `/quotations/new?order=<id>`, prefilled at
  the supplier's rates today; saving calls `approve_order`, which uses the
  unchanged `create_quotation` and adds the customer **only then**, if new —
  an order never creates a customer by itself. **Reject**
  (`components/RejectOrderModal.tsx`) asks for a reason from a dropdown — not
  in stock, too many orders, area not served, date not possible, or Other with
  a few words — and **the customer sees it** on their status link (the user's
  decision, 2026-09-12; migration 027). A listed reason is stored as
  `reject_code` and shown in the reader's own language (`rejectReasonText` in
  `lib/orderFormat.ts`, i18n keys `rejectCode.*`); only "Other" keeps typed
  words in `reject_reason`. `order_status` returns the reason only once an
  order is rejected. Nothing is sent to the customer. `reject_order(uuid,
  text, text)` replaced the two-argument version; `p_code` has a default, so
  the older call still works. Checked on live read-only after pasting: one
  version, runs as the caller, refused signed out, bills unchanged.
- **Settings → Online orders** (`components/OrderSettingsCard.tsx`, hidden
  for the admin): ordering on/off (**off by default**), show prices, the link
  (suggested from the business name, editable, `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`,
  unique), then Copy link / Share order link (asks link or QR — see "Order
  link QR" under Phase 14) / Open page.
- **Database (026):** `order_requests` — RLS, a supplier reads and updates
  only their own; `anon` has no table privileges at all. Items are stored as
  material id, name, unit and quantity — **never a price**. The public reaches
  it only through three SECURITY DEFINER functions granted to `anon`:
  `order_page(link)`, `place_order(...)` and `order_status(token)`.
  `approve_order` and `reject_order` are INVOKER, so RLS applies. Phones are
  matched with `_normalize_phone`. Spam: a hidden honeypot field, 3 pending
  per phone per 24h, 60 per supplier per hour (20 since 032, plus a
  per-device limit and blocked numbers — Phase 17), the same phone and items
  within 10 minutes kept once, and a request id per form.
- **Tested** on the local Docker copy (Phase 9 setup): 276/276 checks,
  including 16 for orders, and a browser walk of every screen in English,
  Hindi and Marathi at 360px. **Checked on live** read-only after pasting:
  RLS on, anon limited to the three public functions, the 025 guard and both
  `security_invoker` views intact, bills / payments / allocations unchanged
  (43 / 94 / 86), ordering off for every supplier.
- **Found in review, fixed on its own branch (2026-09-12):** saving an
  ordinary New Estimate, or an edited bill, showed a false "Leave without
  saving?". `UnsavedChangesGuard` reads `when` from the last render, and
  `navigate()` ran before `setSaved(true)` had re-rendered. **Rule: on a
  guarded form, commit `saved` with `flushSync(() => setSaved(true))` before
  navigating away.** New bills never had it: they show the Delivered? prompt
  first. The fix matches the order-approve path, which was checked in the
  browser; the estimate and edited-bill saves were checked by the user on a
  phone after merging, since Docker Desktop would not start that day.
- **Checked on the user's phone (2026-09-12):** the order link and QR,
  approve → the customer accepting, a rejected reason, the khata link and
  Material received, the UPI QR in a UPI app, and the shared files — all fine.

**Phase 11 — the customer khata link (migration 028, 2026-09-12). Applied to
live and merged the same day.** The user's rule for this round: keep every
existing screen and flow exactly as it is, and only add small options.

- **Supplier side:** one new item in the customer page's ⋯ menu, **Share
  khata link** (`components/KhataLinkModal.tsx`) — Send on WhatsApp (a `wa.me`
  link to that customer's own number, with the link in the text; the supplier
  presses Send), Copy link, Open page, and **Stop this link**. Nothing else on
  the customer page moved.
- **Customer side:** `/khata/<32 hex>` (`routes/KhataPage.tsx`, public, no
  splash) — Balance due and Advance with us (the customer page's own figures,
  from `customer_balances`), every live bill and payment newest first with the
  last 3 months open and "Show older", Download PDF (the same
  `customerLedgerPdf` the supplier sends) and Call. The list is built by the
  supplier's own `buildCustomerLedger`, so it and the PDF always agree.
  English, Hindi and Marathi.
- **Database (028):** `customers.khata_token` (random, made on first share,
  unique, format-checked); `khata_link(customer, stop)` runs as the caller, so
  only the supplier's own customers are found — another supplier or the admin
  gets "not found"; stopping clears the code, sharing again makes a new one.
  `customer_khata(code)` is SECURITY DEFINER for `anon` and returns only that
  customer's statement and the business details the PDF prints — no ids,
  notes, rates, stock or codes — and nothing while the supplier's account is
  not active.
- **Known, deliberately left as the existing screens do it:** with a
  "Receive advance" payment taken while old dues were open, the top card says
  Due ₹5,000 and Advance ₹2,000 (the customer page's figures) while the last
  list line says Due ₹3,000 (netted, as the ledger PDF already does).
- **Tested** on the local Docker copy: 305/305 checks, 21 of them for the
  khata link, and a browser walk in three languages at 360px. **Checked on
  live** read-only after pasting: link-making refused signed out, a guessed
  code finds nothing, the customers table stays unreadable, counts unchanged.

**Phase 12 — UPI, only where the supplier chooses (migration 029,
2026-09-12). Applied to live and merged the same day.** The user's rule:
online payment must never become a default — many suppliers don't want
customers paying online routinely (GST, accounting) — so it is a worst-case
option for a customer with no cash, and the supplier stays in control.

- **Settings → UPI payments** (`components/UpiSettingsCard.tsx`, hidden for
  the admin): the supplier's UPI ID, and **Show "Pay by UPI" on khata links**,
  off unless switched on (it can't be switched on without an ID).
- **Customer page → ⋯ → Show UPI QR** (`components/UpiQrModal.tsx`): the
  amount starts at what the customer owes and can be changed; a note appears
  above ₹1,00,000, the usual single-payment UPI limit. The QR fills the
  supplier's screen for the customer to scan in person, and **Send QR on
  WhatsApp** shares it as a PNG through `shareDocumentOnWhatsApp` (the user
  chose "A + C" of the three options offered; a payment request stored on the
  khata link was left for later). With no UPI ID it points to Settings.
- **Khata link:** a **Pay by UPI** card — a QR plus a "Pay ₹… in UPI app"
  button, since a customer on their own phone has nothing to scan — only when
  the switch is on and money is due. `customer_khata` returns `upi_id` only
  then.
- **Never recorded automatically, and bills, orders and estimates get
  nothing.** The money goes straight to the supplier's account; the supplier
  checks the bank and uses Receive payment → UPI.
- **`lib/upi.ts` builds the `upi://pay` link by hand.** Android reads a `+` in
  a query as a literal plus, so `URLSearchParams` would show the payee as
  "Shree+Balaji"; spaces go as `%20`. The note (`tn`) is the customer's name,
  so the supplier can spot the payment in their bank app.
- **QR codes:** `qrcode-generator` 2.0.4 (MIT, no dependencies, added with the
  user's OK) only computes the squares; `components/QrCode.tsx` draws an SVG
  and `lib/qr.ts` a PNG, always black on white so they scan in dark mode. It
  adds at most ~11 KB gzip.
- **Postgres regular expressions allow at most 255 repeats.** The first draft
  of 029's UPI ID check used `{2,256}`: Postgres accepted the constraint, then
  refused every save containing an ID ("invalid regular expression"). The
  local suite caught it before live. The rule is now
  `^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,63}$`, identical in
  `lib/upi.ts`.
- **Test harness gotcha:** `set role anon` keeps whatever
  `request.jwt.claims` an earlier step set, so "signed out" can still read a
  supplier's own row. Clear the claims first; and prove any "signed out"
  result with a real anon REST call, as was done here (local and live: `[]`).
- **Tested** on the local Docker copy: 321/321 checks, 16 for UPI, and a
  browser walk (settings, a bad ID refused, the QR and its shared image, the
  khata card in three languages at 360px). **Checked on live** read-only after
  pasting: the fixed rule is the one in place, nobody has UPI switched on, the
  existing khata link untouched, counts unchanged.

**Phase 13 — four small helpers (2026-09-12). Migration 030 applied; merged
the same day.** The user picked all four from a list of ideas; the rule
still holds — every existing screen and flow stays exactly as it was.

- **A. Driver's list** (Deliveries → Driver's list;
  `components/DriverListModal.tsx`, `lib/deliveryListPdf.ts`,
  `listItemsForInvoices`): one "DELIVERY LIST" PDF — bill, customer, phone,
  site, materials, a box to tick, **no amounts** — through the share sheet or
  Download. Nothing is marked delivered. **It ticks only bills from the last
  two days, at most the 30 newest**: the local copy held 2,722 undelivered
  bills, ticking them all failed, and a supplier who rarely taps "Mark
  delivered" would hit the same. Items are read 100 bills per request.
- **C. Order again** (`routes/OrderPage.tsx`, no database change): the last
  order is kept on the customer's own phone (localStorage
  `buildsupply-last-order:<link>`); name, phone and site fill themselves in,
  and "Fill in my last order" restores the quantities, skipping materials no
  longer listed.
- **B. The customer answers the estimate** (030): once an order is approved,
  `order_status` also returns the estimate (lines, rates, totals, status) and
  `response`. `respond_to_estimate(code, accepted | call_me)` is public, and
  only while the estimate is Draft or Sent. The supplier sees a badge on the
  estimate, a line on the order and its Orders card, and a Dashboard banner
  (`countAcceptedEstimates`) opening `/orders?tab=approved`. **Nothing is
  billed by an answer** — the supplier converts the estimate as always.
- **D. Material received** (030): `customer_khata` returns `delivered` and
  `received_at` per bill; `confirm_received(khata code, bill no)` works only
  on that customer's own live, delivered bills. Two taps on the khata page
  ("Material received?" → "Yes, received"); the bill page then says "Customer
  confirmed received". Never moves stock.
- **Only the customer's own link can set B or D.** Triggers
  `order_answer_guard` and `invoice_received_guard` refuse the app's
  signed-in users writing `customer_response`, `responded_at` or
  `received_at`, so neither is a record the supplier could fill in for them.
- **Tested** on the local Docker copy: 348/348 checks, 27 for 030, and a
  browser walk of all four (the share sheet simulated, the PDF caught, three
  languages at 360px). **Checked on live** read-only after pasting: both
  guards and both functions in place, nothing answered, counts unchanged.
- **Docker Desktop on this machine sometimes won't start from the command
  line** — zero processes, and `docker desktop start` hangs. Ask the user to
  open it from the Start menu; that worked. So did launching the program
  directly (2026-09-12): `Start-Process "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe"`.

**Phase 14 — simplify, round A (2026-09-12). No database change.** From a
UX review taken from the supplier's side. The user's rule: no features for
their own sake — fewer taps, fewer decisions, nothing that feels like an ERP.

- **A1 — one way to send a customer their account.** The WhatsApp icon beside
  Ledger on the customer page. "Remind via WhatsApp" is gone from the ⋯ menu:
  it attached the identical statement PDF. The message asks for the dues when
  there are any, and otherwise gives the advance or says the account is
  settled. The Reminders screen is unchanged.
- **A2 — one way to take money.** Payments → Receive payment (and the
  Dashboard's "+ Payment", `/payments?new=1`) asks "Who paid?" — customers who
  owe, largest first, built from the bills already loaded — then opens that
  customer's own Receive payment (`/customers/<id>?pay=1`, navigated with
  `replace`, so back returns to Payments): oldest bills first, extra kept as
  advance. "For one particular bill →" keeps the old per-bill form. It is
  **one dialog with two steps**, not two dialogs: closing one and opening
  another in the same moment fight over the back-button history entry.
- **A3 — "Estimate ready", not "Accepted".** The customer's approved order
  used to say "Accepted" above an "Accept estimate" button.
- **A4 — the customer page's "Status: Active" tile is gone.** Nothing sets
  `customers.status` and nothing reads it; the column stays in the database.
- Checked in the browser on the local copy, in English, Hindi and Marathi.

**Phase 14 — simplify, round B (2026-09-12). No database change.** Each
removes a real step, retyping or phone call:

- **B1 — "Money received? Record it"** under Show UPI QR hands the amount to
  the customer page's own Receive payment, set to UPI (2 taps instead of
  ~5 plus typing). The QR dialog is closed first and Receive payment opened
  only after its history entry is unwound (`popstate`, or 400ms) — otherwise
  the unwind pops the new dialog's entry and shuts it at once (see
  `modal.tsx`).
- **B2 — the accepted estimate one tap away.** With exactly one waiting, the
  Dashboard banner opens that estimate (`acceptedEstimates()` returns its id);
  with more, the Approved tab. An accepted order's card has "Make the bill →".
- **B3 — the customer's order note and wanted date on the driver's list.** A
  bill made from an estimate carries `quotation_id` (create_invoice sets it),
  and `order_requests.quotation_id` leads to the note and date
  (`listOrderNotesForQuotations`). "Call before coming" now reaches the driver.
- **B4 — Share order link on the Orders screen** (header and empty state), or
  "Set up order link" until ordering is on. The share code is one helper,
  `lib/shareOrderLink.ts`, used by Orders and Settings → Online orders.
- Checked in the browser on the local copy: the prefilled UPI payment stayed
  open, both "Make the bill" routes land on the estimate, the driver's PDF
  carries the note, and the shared message carries the link.

**Order link QR (2026-09-12). No database change.** The user's ask: a
customer who walks into the shop can scan a QR and order. **Share order
link** — on the Orders header and in Settings → Online orders — now opens
`components/OrderLinkShareModal.tsx`, one dialog with two steps (the modal
history rule again): **Send link** (`shareOrderLinkText`, unchanged message)
or **Show QR code** — a large black-on-white QR of the supplier's
`/order/<link>` with the business name and link under it, for the customer to
scan at the counter, and **Share QR image**, a PNG (`qrPngFile`, "Scan to
order" printed on it) through `shareDocumentOnWhatsApp`, to send or print for
the shop. One QR per supplier: it is just the order link, so every order still
waits for Approve / Reject. The second Share button in the Orders empty box
(B4) was removed; the header one is enough. Checked on the local copy in three
languages at 360px, with the share sheet simulated: the PNG and the message
both arrive. The user then scanned it on a phone: fine.

**Floating tab bar (2026-09-12). No database change.** Asked for from a
Telegram screenshot. The phone tab bar (`AppShell.tsx`) now floats: rounded,
12px in from the sides and 8px plus the home indicator above the bottom,
card colour at 70% with `backdrop-blur-lg` and `backdrop-saturate-150` so the
list visibly flows under it as it scrolls (the user's Telegram video: frames
pulled in the browser pane, since there is no ffmpeg here), and `max-w-md` so
a tablet gets a phone-sized bar. **One green bubble slides to the tab you
tap** — a single absolutely placed span moved by `translateX(index × 100%)`,
tabs being equal widths, over 300ms with a slight overshoot
(`cubic-bezier(0.34,1.3,0.64,1)`), none under reduced motion. On a page
reached from More it fades out where it was. Measured in a front tab: 0 → 62
→ 122 → 155 → 183 → 197 → 201 → 196px at 30ms steps, landing exactly on the
tab. **Background browser-pane tabs pause CSS transitions** — measure motion
only in a fronted tab (`tabs_select`), or the computed transform sits at its
start value.
**The top bar followed (same day, from the same video).** Telegram's is
solid at the top of the list, then as it scrolls folds its search field away
and turns frosted while chats pass under it. Ours: solid `bg-shell` at the top
of a page (so it meets the status bar, which Android paints from
`theme_color`, in one colour); past 24px of scroll, `bg-shell/80` with a blur,
and `Brand compact` folds the tagline (a `grid-rows-[0fr]` row, so one line
or two fold alike); back under 4px, both return. Two thresholds
(`useScrolledPast(24, 4)`) so a page resting near the top can't flick between
the two. At 360px the bar stays 60px either way in all three languages (the
tagline is one line, and the two toggles set the height), so nothing below it
moves; only a phone narrow enough to wrap the tagline would shrink it a few
pixels. Still `sticky`, per the note below. Same five tabs; the Orders dot on More and the More sheet are
unchanged. `--tabbar-h` now includes the gap under the bar, so the page's
bottom padding, both Save bars, the loaders and the ⋯ menus still clear it.
Checked on the local copy at 360px: every label fits in English, Hindi and
Marathi (the bar stays 56px), light and dark, and New Invoice's Save bar sits
flush on the bar at the top, middle and bottom of the page.

**Phase 15 — a Telegram-style round (2026-09-15). No database change.** From
the user's Telegram and WhatsApp videos and screenshots (frames pulled in the
browser pane — no ffmpeg here; copy the video into `frontend/node_modules/.review/`,
git-ignored, and load it through `/@fs/`). Built one item at a time on
`telegram-style`, each previewed, merged together.

- **Coloured initials** (`components/CustomerAvatar.tsx`, rules in
  `lib/initials.ts`: colour from the customer's id, first + last letters,
  shaded like a modern icon). On Customers cards, the customer page, and
  Receive payment's "Who paid?", which is now a tappable list (largest owed
  first) — one tap opens `/customers/<id>?pay=1`.
- **The top bar names the screen** (`context/TopBarContext.tsx`). PageHeader
  publishes its title and hides its own h1 below `lg`; Settings calls
  `useTopBar` itself; AppShell falls back to the section's name. ← on inner
  routes goes back (`location.key !== 'default'`), else to the section's list.
  The Dashboard keeps the brand, whose tagline folds on scroll.
- **A customer's page is Telegram's chat bar** (`topFloating`): three frosted
  pills — ←; initials, name and, once the buttons have scrolled away
  (`pinned`), what they owe; Call + `ActionMenu plain` (⋮). The page's own Call
  and ⋮ hide below `lg`; EN/theme step aside there. **Every link to a customer
  passes router state `customerName`** (Customers, Who paid?, Dashboard recent,
  bill and estimate pages), so the pill names them while the page loads;
  otherwise a pulse placeholder — never "Customers".
- **Day and night.** By day the top bar is white with BuildSupply in
  `--color-accent-text` and a `border-b`; at night the dark green, as before.
  AppShell sets `meta[name=theme-color]`: #0a2427 under the splash, the page
  colour under the floating bar, else #ffffff / #0a2427 — hard-coded, because
  the `.dark` class flips in ThemeProvider's effect, after AppShell's. The
  toggle is **Telegram's circle** (`toggleTheme(from)` + `html[data-theme-flip]`
  in index.css): night grows from the button, day is night shrinking into it,
  400ms, with transitions and backdrop blur off for its duration (they made it
  lag on a phone). **Gotcha: view-transition pseudo-elements belong to the
  html element — `html[x]::view-transition-new(root)`, no space.** With a
  space the rule matches nothing and only the browser's default fade runs.
- **Switching screens** from the tab bar or More: NavLink `viewTransition`, a
  0.15s cross-fade. The header and tab bar are their own layers
  (`app-header`, `app-tabbar`) shown without fading, so the bubble slides once —
  named only while a switch runs (Phase 21).
- **Settings, WhatsApp-style**: the doodled band (`lib/qrPattern.ts`), the logo
  large, the name; plain grey outline-icon rows with a line under each title;
  each opens `?s=<section>` (back returns to the list; Orders, the UPI QR and
  the Start-here card link to their section). The More sheet uses plain outline
  icons too. A coloured-tile version was built and removed at the user's
  request — **don't bring boxed icons back**.
- **Order QR**: Show QR code fills the screen — green doodles, a white card, the
  logo (or initials) over its top edge. `orderQrPngFile` (lib/qr.ts) draws the
  same 1080×1350 image for sharing and printing, the logo through `loadLogo`.
  The UPI QR is unchanged.
- **More** shows the new-order count (99+) instead of a dot, and a **floating
  Orders button** sits above the tab bar on the four main tabs (a supplier's,
  phones only), slipping away while a list scrolls down (`useScrollingDown`).
- **Tailwind 4 gotcha**: `translate-*` and `scale-*` use the `translate` and
  `scale` CSS properties — transition those, not `transform`.
- **Testing notes**: background browser-pane tabs pause CSS transitions and
  requestAnimationFrame — front the tab to measure motion. The user sometimes
  uses the pane at the same time, which moves pages and flips themes under a
  test; do logic checks in a background tab (swap rAF for setTimeout) and read
  animations within milliseconds of your own tap.
- **Not yet judged on a real phone**: the theme switch's smoothness, the
  status-bar colours, and scanning the new QR image.

**Phase 16 — Profile tab, and supplier helpers round 2 (2026-09-15/16).
Migration 031 applied; merged together.** Built on `no-header-line`, then
`supplier-helpers` on top of it, one item at a time, each previewed.

The top bar and navigation (no database change):
- The line under the phone top bar is gone, in both themes.
- **A Profile tab** (the supplier's logo, initials if it fails to load)
  replaces More in the tab bar and opens `/settings`. **More** is a white
  floating button (48px) above the Orders button, or in its place, carrying
  the new-order count; hidden on inner routes.
- The day/night switch is a tile in the More sheet (the circle spreads from
  it), and the sheet is a floating `rounded-3xl` card clear of every edge.
- Scrolling Profile brings the logo and business name up into the top bar.
- The Dashboard logo: tap → Profile; hold 500ms → the order QR (Settings →
  Online orders if ordering isn't set up). It buzzes only when
  `navigator.userActivation.hasBeenActive` — Chrome blocks and warns about
  `vibrate` before the page has had a tap.
- **Order QR on Profile** (2026-09-16): a rounded button under the business
  name opens the same full-screen order QR (`OrderLinkShareModal`,
  `initialStep="qr"`), or Settings → Online orders until ordering is on.
  Hidden for the admin.

Supplier helpers — the eight free ideas the user picked from a 17-idea list,
in their order:
1. **Customers from the phone's contacts** (`lib/contacts.ts`,
   `AddCustomerModal`): the Contact Picker API, Android Chrome only — the
   button is hidden elsewhere, and it is read-only. One contact fills the
   form; on Customers several can be picked, checked over (names editable,
   anyone without a 10-digit mobile left out) and added one at a time, with
   any refused (a number already in use) listed with the reason.
2. **Today's rates card** (Dashboard `RatesReminder`): once a day, "Update
   today's rates?". Same as yesterday puts it away until tomorrow
   (localStorage `buildsupply-rates-checked:<supplierId>`, the phone's own
   date). **Update rates opens `components/UpdateRatesModal.tsx` on the
   Dashboard itself** (asked for 2026-09-16; it used to jump to Stock): every
   material's rate in a box, "was ₹…" under the changed ones, and one Save
   that writes only the rates that moved (`updateMaterial(id, { rate })`, as
   Stock's edit form does). Saving puts the card away; closing without saving
   leaves it. Only once a material has a rate. The card itself is a notice
   among the others — the popup opens only when tapped.
3. **Khata link**: each bill's PDF, the customer's estimates (newest 20, each
   with its PDF) and online orders (newest 10: made into this customer, or
   placed from their phone and not yet decided), through `customer_khata` and
   the new `khata_document(code, kind, number)`. The same PDF builders as the
   supplier's. The page shows these only when `estimates` comes back, so it
   kept working before 031 was pasted.
4. **Order status timeline**: Order sent → Estimate ready → Estimate accepted
   → Bill made → Delivered → Material received, from `order_status`'s new
   `decided_at` and `bill`. A bill made straight from the estimate counts as
   accepted; a rejected order shows no timeline, only its reason.
5. **Order page**: the business address, **Get directions** (a Google Maps
   search for name + address) and **Call**. `order_page` returns the address
   and phone only while ordering is open.
6. **Send to driver** (`components/SendToDriverModal.tsx`; the bill page's ⋯
   and a truck button per bill in Deliveries): the supplier's saved drivers
   (`drivers`, `services/drivers.ts`). One tap opens that driver's own chat
   through `openWhatsAppShare` — wa.me, text only — with the bill, customer,
   phone, site, address, materials with their units (no amounts, like the
   driver's list), the customer's order note and wanted date, and a map link.
   "Pick someone else in WhatsApp" opens wa.me with no number. The message is
   in the app's language.
7. **Install app** (a tile in More; `lib/installPrompt.ts`,
   `components/InstallIosModal.tsx`): `beforeinstallprompt` is caught in
   `main.tsx` before React renders, with `preventDefault`, so Chrome's own
   mini-bar never pops up mid-bill; the tile opens Chrome's dialog. An iPhone
   gets the Share → Add to Home Screen steps. Hidden once installed or when
   running as the installed app. Checked only with a simulated event — Chrome
   may not offer installing on preview URLs at all.
8. **The customer's links, remembered on their phone** (`lib/customerLinks.ts`,
   localStorage `buildsupply-khata:<order_link>` and
   `buildsupply-orders:<order_link>`): the khata page keeps its code (and
   forgets a stopped one) and has **Order materials**; a status page adds
   itself to the order page's recent orders and has **Order more materials**;
   the order page shows **My khata**. Only while ordering is on. Nothing is
   stored on the server.

**Migration 031** (`031_links_and_drivers.sql`):
- `drivers`: RLS, each supplier their own rows only — no admin access, and
  `anon` has no privileges; a phone once per supplier.
- `order_page` + address and phone; `order_status` + `decided_at`, `bill`
  and `order_link`; `customer_khata` + `estimates`, `orders` (`code` is the
  order's status code) and `order_link`; `khata_document`, SECURITY DEFINER
  for `anon`, only the link's own customer's live bills and estimates.
- Its lines are ordered by `ctid` — the order they were saved in, which is
  what the bill page's unordered select shows. The ids are random uuids, so
  ordering by id shuffles them.
- Tested on the local Docker copy: 376/376 checks from a clean reset, 28 of
  them new.
- **Test gotcha:** cancelling a bill and un-cancelling it does not undo the
  cancel. `invoices_release_on_cancel` releases its payment allocations, and
  they stay released. A test that borrows a bill to cancel must pick an
  unpaid one.
- Applied by the user on 2026-09-15, after a backup
  (`buildsupply-backup-2026-09-15-2257.zip`, 4,697 rows).
- Checked on live read-only:
  - one version of each function;
  - `drivers` has RLS on, 4 policies and no `anon` access, confirmed by a
    real `anon` REST call as well;
  - counts unchanged (52 bills / 99 payments / 91 allocations / 17
    estimates / 10 orders / 20 customers) and 0 bills out of step;
  - both `security_invoker` views and all three guards intact.

**Testing notes:**
- The user sometimes uses the browser pane during a test, which changes the
  page, the language and the theme underneath it. Run whole flows in a
  background tab (`tabs_create`).
- Find buttons by their icon class, not by translated words. A Marathi label
  was once missed because the test typed ॅ (U+0945) for ॲ (U+0972).

**Phase 17 — the order spam guard (migration 032, 2026-09-16). Applied and
merged the same night.** The user asked what stops someone spamming a
supplier's order QR. 026's per-phone limit didn't hold against a spammer typing
a new made-up number each time. The user picked 1 + 2 + 3 of the offered list;
"only my customers can order" (4) was left as an option if spam continues.

1. **Per device: 5 orders an hour** (`place_order`, `_order_client`). The
   device is its internet address, stored only as an HMAC keyed with
   `order_guard_secret` and mixed with the supplier's id — never the address,
   and not linkable across suppliers. `order_request_clients` (RLS on, no
   policies, no grants) keeps the hash and which header it came from
   (`source`: `cf`, `xff` or `real`). Cloudflare's `cf-connecting-ip` is
   preferred; otherwise the first `X-Forwarded-For` entry, as Supabase's
   "Securing your API" docs read it.
   **Caveat, proven locally:** through the local Kong gateway a client-sent
   `X-Forwarded-For` is taken as-is, so a spammer faking that header gets a
   new "device". On live, whether `cf-connecting-ip` arrives is unconfirmed —
   no order had come in after the paste. Check with
   `select source, count(*) from order_request_clients group by 1` once one
   has; if it says `xff`, the per-device limit is soft, and Block plus the
   shop cap are what hold.
2. **Block this number** (order page, bottom; `block_order_phone(phone,
   block)`, INVOKER; `order_blocked_phones`, RLS own rows). An order from a
   blocked number is answered like the bot trap — `{ok, token: null}`, so the
   customer page says sent — and nothing is kept. Blocking also rejects that
   number's pending orders (`reject_code 'other'`, no reason shown). Settings
   → Online orders lists blocked numbers with Unblock. Both screens hide the
   option if the list can't be read (before 032).
3. **The shop: 20 orders an hour** (was 60). Holds whatever the headers say.

The customer page maps the device refusal to its own message
(`order.deviceBusy`). Tested on the local Docker copy: 396/396 from a clean
reset (20 new, in `97_spam.sql`: the run's own recent orders are aged two
hours during it so the cap can be tested exactly, then restored), the device
limit over the real REST API, and Block / Unblock / the blocked list in the
browser at 360px. Backup before pasting: `buildsupply-backup-2026-09-16-0239.zip`
(4,717 rows; the first attempt hit a Supabase 520 and was retried). The first
paste coincided with Supabase's scheduled Management API maintenance
(21:15–21:45 UTC) — the dashboard said "Failed to fetch permissions" and
nothing ran; pasted again after. Checked on live read-only: one version of each
function, `_order_client` callable by no app role, the cap at 20, both hidden
tables and the blocked list locked (also by real anon REST calls: 42501),
guards and `security_invoker` views intact, counts unchanged
(53 / 99 / 91 / 18 / 11 / 21 / 1 driver), 0 bills out of step.

**Phase 18 — faster opening (2026-09-16). No database change.** The user
picked it from the "what next" list: the app downloaded everything, PDF tools
included, before showing anything — on budget phones, and for a customer
opening an order QR or khata link.

- **Every screen is its own chunk.** `lib/screens.ts` holds each route's
  `import()`; `App.tsx` builds them with `React.lazy`. `Protected` puts a
  `<Suspense fallback={<TruckLoader />}>` inside `AppShell`, so the top bar and
  tab bar stay up while a screen's file arrives; sign-in and the public pages
  use `Page` (a full-height fallback).
- **The PDF tools load when a PDF is made.** `lib/pdfKit.ts` `loadPdfKit()`
  imports jsPDF and jspdf-autotable once and shares them. Every builder takes a
  `kit` and its exported async functions fetch it alongside the logo — so the
  thirteen callers didn't change. **Never add a value `import` of `jspdf` or
  `jspdf-autotable` anywhere else** (type imports are fine): it drags the
  library back into the entry chunk.
- **A signed-in phone fetches the rest in the background:** `prefetchScreens`
  (from AppShell) waits 2.5s and for idle, then fetches that role's screens
  one at a time and, for suppliers, the PDF tools. The service worker caches
  `/assets/*` as fetched, so it all works offline afterwards. The khata page
  warms the PDF tools once its link is found.
- **A deploy while the app is open** can remove a chunk the tab hasn't fetched;
  `vite:preloadError` in `main.tsx` reloads once (30s guard). Drafts keep a
  half-typed bill.
- Verified: on the production preview a customer order page, a khata link and
  sign-in each load only their own files (no jsPDF); signed in (local copy),
  all 17 supplier screens and jsPDF were fetched within ~8s of opening, the
  shell stayed on screen moving to Customers, and a bill's Download PDF and a
  khata link's Bill PDF both produced real PDFs.

**Phase 19 — every phone size, iPhone and Android (2026-09-16). No database
change.** The user asked for the app to be responsive on all iPhones and
Androids. Measured first, not assumed: 22 screens (all supplier screens and the
customer order / status / khata pages) at 320×568, 360×640, 375×667, 390×844,
412×915 and 430×932, plus 768×1024 and Android's larger text (root font at
115% and 130%). **No screen scrolled sideways and nothing crossed the edge at
any size** — the 360px discipline held. The fixes were for what was cramped or
only goes wrong on an iPhone:

- **Tab bar labels** drop to 10px under 360px (`max-[359px]:text-[10px]`) —
  "Dashboard" and "Customers" touched at 320.
- **FROM / TO on a bill and an estimate** stack under 420px
  (`flex-col … min-[420px]:flex-row`, TO `min-[420px]:text-right`); at 360
  the business name wrapped into three lines beside a narrow TO column.
- **iPhone Safari measures `vh` with its address bar hidden**, so `max-h-[90vh]`
  could put a dialog's Save under the bar. Two utilities in `index.css`:
  `vh-cap-<n>` (max-height n dvh, n vh without dvh) — the modal (90), the
  contacts and rates lists (55), Who paid? (50) — and `min-h-app` (100dvh) for
  the centred sign-in, forgot/reset password, account-error and
  ProtectedRoute screens. **Written with `@supports (height: 1dvh)`, not two
  declarations**, so the build's CSS minifier can't merge the fallback away.
  Use them for any new screen-height cap instead of `vh`.
- **A sideways iPhone in Safari**: `--safe-left` / `--safe-right`; `body` pads
  by them, and the tab bar, both floating buttons and the More sheet add them
  to their side offsets. 0px on any phone held upright.
- **Left as designed**: the floating ⋯ and Orders buttons can cover the right
  end of a Dashboard notice until the list scrolls and they slide away.
- **Test-tooling gotcha**: after many `resize_window` changes in one tab,
  `documentElement.scrollWidth` reported ~797px of overflow on some screens
  with no element past the edge; a fresh reload at the same size read 0. Reload
  before trusting an overflow number. A single `javascript_exec` must finish in
  45s — audit about six screens per call.
- Verified: at 320 all 22 screens clean after a reload, tab labels 10px, tab bar
  and floating buttons unmoved; bill and estimate stacked at 360 and side by
  side at 430; Receive payment's dialog capped at 576px on a 640px screen (90%).
  Not verifiable here: a real iPhone's address bar — covered by the code and
  the computed values.

**Phase 20 — Telegram-style scrollbars (2026-09-16). No database change.**
The user asked for a small scrollbar that moves like Telegram's. `index.css`:
4px, rounded, the thumb transparent by default and grey (`--color-muted-2` at
80%) only on an element marked `data-scrolling`, or while hovered; Firefox
gets the same through `scrollbar-color` under
`@supports not selector(::-webkit-scrollbar)`. `lib/scrollbars.ts`
(`showScrollbarsWhileScrolling`, installed in `main.tsx`) is one capture-phase
`scroll` listener for the whole app — the page (`document` → `html`) and every
inner scroller alike — that sets the attribute when a scroll starts and removes
it 900ms after the last scroll event. Scrollbars can't be animated, so it
appears and goes rather than fading. **Phones ignore all of this**: Android and
iOS draw their own overlay bar that already fades — and so does the browser
pane under 768px wide, which emulates a phone — so it only shows on a computer
or tablet. Verified by computed style on `::-webkit-scrollbar-thumb` at 800px
wide: transparent at rest, grey 60ms into a scroll, transparent 1.2s after.

**Phase 21 — no thin line above the top bar (2026-09-16). No database
change.** The installed Android app showed a thin grey line between the status
bar and the top bar, in both themes; the user said it had not been there
before. Checked in the page first: the top bar starts at exactly 0 with no
border or shadow, nothing else sits in the top 3px (`elementsFromPoint` and a
scan for borders / shadows / 1–3px elements, light and dark), and the status
bar's `theme-color` equals the bar's colour in both themes — so the page draws
no line. The change that altered how Chrome paints that edge was **4bb8666
(2026-09-15 19:44)**: permanent inline `viewTransitionName: 'app-header'` /
`'app-tabbar'`, which keep both bars as their own layers at all times. The
earlier fix that evening (d74b936) only removed a `border-b` *under* the bar.
Now the names come only from `html:active-view-transition [data-app-header]`
/ `[data-app-tabbar]` in `index.css`: at rest both bars are ordinary page
content. Verified locally: names `none` at rest and after, `app-header` /
`app-tabbar` during `document.startViewTransition`, with separate
`::view-transition-group(app-header)` and `(app-tabbar)` animations (the
bubble still slides once); dark mode unchanged (`theme-color` #0a2427). **The
line itself can only be judged on the phone** — the browser pane never showed
it. If it survives, undo this commit and look at Chrome's installed-app frame
rather than the page. **Don't put a `view-transition-name` back on the bars
as an inline style.**

**Phase 22 — the customer's order page (2026-09-20). No database change.**
Asked for one piece at a time, merged together (9405d9e…, branch
`order-page-theme`).

- **Day/night beside the language button**, the same `ThemeToggle` the sign-in
  screen carries. The top bar stays `bg-shell` in both themes, so both buttons
  keep the white-outline classes.
- **The shop's name heads its own address card** — the logo stays in the top
  bar, where the user wanted it.
- **The language button is a dropdown** (`components/LanguageToggle.tsx`),
  saying **Language / भाषा** with the three languages each in its own script and
  a tick on the one in use, in place of a button that cycled through "EN". It
  closes on an outside pointerdown or Escape, as `ActionMenu` does. Under
  360px the word steps aside and the globe stands alone. **`compact` keeps the
  old two-letter code** and is what AppShell's phone bar passes: the word is
  115px against the old 37px, which pushes the brand's tagline (215px at
  12px) onto a second line at 360 and makes the bar taller.
- **One order box.** Everything under the "prices are indicative" notice — the
  materials and the customer's details — is one bordered section headed by a
  green strip with a truck badge and the shop's name, ending in a big
  **"Place order at ‹shop›"** button (`order.placeAt`) that wraps rather than
  clips. The materials list stays *outside* the `<form>`, so Enter in a
  quantity box still cannot submit an order.
- **The box folds into one button** (`order.startNow`, "Order materials now"),
  so the page a customer lands on is the shop, its address and one button.
  Nothing typed is lost when it folds — the state lives in the route. "Fill in
  my last order" and "Order more materials" open it themselves.
- **A summary between the materials and the form**: every chosen material with
  `qty × rate` and its amount, under a large **Estimated total** in a green
  panel. Only amounts a supplier shows prices for; otherwise the same list
  without money.
- **"My khata" and "Your recent orders" were removed from the order page**
  (2026-09-20, the user's call): the khata link already lists the account and
  the customer's orders, and it now ends on its own "Order materials now"
  button, so the order page is only for placing one. Orders are still written
  to the phone (`rememberOrder`) and the status page still reads them back.
  A customer who came in by QR, with no khata link, no longer has a list of
  their past orders on this page; their way back is the status link the
  success screen gives them. Putting the list back is re-adding one card.
- **A returning customer is named on the order page** (2026-09-20): a card
  under the shop's, with their initials and name. **The name and the khata
  link must come from the same store.** The first version took the name from
  the last order this phone sent and the code from the last khata it opened,
  and the user's own phone had both — it showed "himanshu khalatkar" over a
  card that opened toshan's khata. `buildsupply-khata:<link>` now holds
  `{ code, name }` (`readKhata`; a bare code left by the old version still
  reads, with no name), the khata page writes the name it is showing, and the
  card is either that customer — name, and it opens their khata — or, with no
  khata on this phone, the last order's own name, phone and site and no link.
  A first-time visitor sees no card.
- **And the form fills itself in as that customer too** (2026-09-20, the same
  report): the khata store keeps `{ code, name, phone, site }` and the order
  form takes its name and phone from there when the phone knows a khata — the
  shop's own record — falling back to the last order otherwise. `samePerson()`
  compares the two names, and when they differ (one phone, two customers) the
  last order's **site** is not carried over and **"Fill in my last order"** is
  not offered: none of it is this customer's. When they agree, nothing changes
  — the last order's site and the repeat offer stay.
- **"My khata" moved to the order status page instead** (2026-09-20). An old
  order link is often the only one a customer still has, and `order_status`
  carries nothing about the khata — checked: it returns bill, business_name,
  created_at, decided_at, delivery_date, estimate, items, responded_at,
  response, status and `order_link`, and nothing else. The card reads the code
  from the customer's own phone (`readKhataCode(found.order_link)`), so the
  status link still says nothing about their account; with no code stored,
  or with ordering off (no `order_link`, so no key to look under), no card.
- Verified at 320/360/375, light and dark, in all three languages; the submit
  path re-checked after the restructure (nothing chosen → "Add at least one
  material", no request). Live bundle grepped for every new string after the
  merge.

**Phase 23 — the khata link, structured (2026-09-20). No database change.**
The user's ask: a customer should understand their own account without facing
a wall of options. Built one item at a time on `khata-structure`.

- **One figure at the top.** `pending − advance`, the same number the
  statement's last line and the ledger PDF already show. With both, the parts
  are spelled out under it (`khata.netNote`). The old page showed due and
  advance at the top and a third, netted figure at the foot of the list.
- **The UPI QR and button ask for that netted figure too** — they used to ask
  for the bills' gross, so a customer holding an advance was shown a QR for
  more than they owed.
- **A menu, and one screen per option** (`?s=pay|bills|payments|estimates|orders|statement`,
  so the phone's back button returns to the menu; an unknown value falls back
  to it). `MenuRow` follows Settings' plain outline-icon rows — **no boxed or
  coloured icons** — with a line saying what is inside ("12 bills · ₹45,000
  still to pay"). A row with nothing behind it is not rendered, and a section
  reached by its own link with nothing in it says so rather than showing a
  blank screen.
- **Bills**: "Still to pay" with its own total first, then "Fully paid".
  Part-paid bills say both halves ("₹2 already paid" / "₹40,725 left"). An
  opening balance is a row here, titled "Old balance". When the shop holds an
  advance, a line says it goes against these bills.
- **Payments**: the total received, then each receipt with its date, mode and
  which bill it was put against; one that covered several opens a "Where it
  went" box with each bill's share and anything kept as advance (which is
  also where money released by a cancelled bill appears).
- **Estimates** split into Open and Billed-or-finished; **orders** into
  Waiting for the shop and Answered.
- **Full statement** keeps the mixed running-balance list and the ledger PDF,
  with a line explaining that the small figure under each amount is the
  balance after that line.
- **Two brands, one bar** (2026-09-20, asked for straight after): the sticky
  bar says **BuildSupply** with the language and day/night buttons while the
  page is at the top, and the shop's logo and name sit under it on the page;
  scrolling brings the shop up into the bar and fades BuildSupply and both
  buttons out, scrolling back brings them home. Two absolutely-placed layers
  in a fixed 44px row, cross-faded on `shopUp`, which a rAF-throttled scroll
  listener sets the moment the shop's band passes under the bar (the
  supplier's own Profile screen does the same with their name). No band —
  loading, or a dead link — means BuildSupply stays. The top card opens with the customer's
  coloured initials (`CustomerAvatar`, seeded from the khata token — the view
  returns no customer id), their name in bold and their phone and site under
  it, with the figure below a divider.
- **Ordering is a green button, not a menu row** (2026-09-20): the khata page
  ends on a full-width **"Order materials now"** (`order.startNow`, the order
  page's own words) to `/order/<link>`, and **Pay now** likewise left the menu
  to sit beside the figure it settles. What is left in the menu is only
  looking things up. Both appear solely when they can act — the button needs
  `order_link`, which `customer_khata` withholds while ordering is off; the
  Pay button needs `upi_id`, withheld while the UPI switch is off.
- Verified on real Shree Balaji khata links: 7 screens × 3 languages at 320px,
  zero overflow and no blank screen, plus the back button. Cases no live row
  covers — an advance alongside dues, a payment split across bills, an order
  still waiting, empty sections — were proved by patching the `customer_khata`
  response in flight (wrap `fetch`, then `pushState` to a *different* token so
  the effect refetches; a `?s=` change alone does not).

**Send rate list, from the Dashboard (2026-09-21). No database change.** The
user asked for a popup after a phone call ends — "was that call for building
materials?" — that then opens the caller's WhatsApp with the rate list.
**Checked before building: not possible, and not only here.** No browser API
reports call state or the call log, and a web page cannot draw over another
app. A native Android app could know a call *ended* (`READ_PHONE_STATE`), but
**not who called**: that needs `READ_CALL_LOG`, which Google Play grants only
to default dialer / assistant, caller ID and spam, backup-restore, enterprise
management and connected-device sync (narrowed again in July 2026). A billing
app does not qualify, so the permission buys the reminder and not the number;
iOS gives neither at any price. Told the user, and built the manual version
they asked for instead:

- **A card on the Dashboard** under the rates reminder — "Send rate list / To
  a customer who just called" — opening `components/SendRatesModal.tsx`: the
  number (`PhoneInput`, or the phone's own contact picker on Android), a
  preview of the exact message, and Send on WhatsApp. Only once a material has
  a rate; the priced list comes out of the Dashboard's own materials read, so
  the card costs no query.
- **`wa.me` can open one number but cannot carry a file**, which is why this
  is a written list and Materials & Stock keeps sending the letterhead PDF
  through the share sheet. The message follows the app's language, as every
  WhatsApp message does; the PDF stays English.
- `rateListMaterials` moved to **`lib/rateList.ts`** (re-exported from
  `lib/rateListPdf` so its callers are unchanged), so the Dashboard does not
  pull `pdfTheme` in behind a card that only writes text. Verified: the built
  Dashboard chunk contains no jsPDF.
- Verified by mounting the real dialog through the dev graph on the sign-in
  page (the recipe under the dev-tooling notes) with `window.open` captured:
  the unpriced material is left out, the list is by name, an empty number is
  refused, a pasted "+91 98200 11122" becomes `9820011122`, and Send opened
  `https://wa.me/919820011122?text=…` carrying the whole message. The card
  itself needs a signed-in session, so the user checked that on the preview.

**Phase 24 — every order on the khata link (migration 033, 2026-09-21).
Applied to live the same day.** "My orders" listed `order_requests` and
nothing else, so a customer who had phoned the shop or walked in saw an empty
list — their order was there, under My bills, wearing a bill number. Three of
Shree Balaji's seven khata customers were in exactly that position.

- **The page could not tell one from the other**, which is why this needed the
  database: nothing in `customer_khata`'s payload said which bill an online
  order became, or which bills came from no order. Two read-only fields, both
  derived from what was already stored: each order gains **`bill`** (its
  estimate's live bill, the link `order_status` already reports), and each
  invoice gains **`from_order`** — false meaning the shop took that order by
  phone or at the counter. Nothing else about the function changed: same
  arguments, same security definer, same grants (`create or replace` keeps
  them), no table touched, no row written, safe to run twice.
- **My orders is two sections**, asked for in that shape: **Ordered online by
  you** (anything still waiting for an answer first, each with its badge, its
  status link and its bill number once billed) and **Taken at the shop or by
  phone** (the bill it became — amount, site, delivered or received — and not
  tappable, since there is no status page behind it). The headings carry the
  origin, so the rows do not repeat it.
- **`from_order` is only trusted when it is exactly `false`.** Before 033 the
  field is absent, and an absent field must not make every bill look like a
  phone order — so the page behaved as it always had until the SQL landed.
- **Tested on the local Docker copy: 407/407 from a clean reset** (the
  previous 396 plus 11 new, in `tests/98_all_orders.sql`), with 033 applied
  as part of the structure so every existing khata, orders, links, spam, UPI
  and tenant-isolation test ran against it. The loaded snapshot predates
  online orders, so the new test builds its own fixture: a customer with a
  khata link, one bill an online order produced, one the shop wrote, and an
  order still waiting. Proved over a real anon REST call as well.
- **Checked on live** after pasting, read-only: one version of the function,
  still security definer; anonymous calls return the right split — toshan 3
  phone orders and no online ones, himanshu 3 phone plus 2 app-ordered bills
  whose orders name them (INV-1045, INV-1052), Dhruv 1 app order and no phone
  ones; counts unchanged (52 bills / 103 payments / 95 allocations / 19
  estimates / 13 orders / 21 customers), 0 bills out of step.

**Phase 25 — GST per material (migration 035, 2026-09-22). Applied to live
the same day.** The long-open question in "Still to do" above: one rate, 18%,
on the whole bill — right for cement and TMT, wrong for sand and gitti at 5%.
Asked for as item 1 of an eight-feature list, built first because it is the
only one that changes what a bill charges.

- **Settings → Material GST** (`components/MaterialGstCard.tsx`, `?s=gst`,
  hidden for the admin): every material with its percentage in a box and the
  five slabs a building-material supplier meets — 0, 5, 12, 18, 28 — as
  one-tap chips. Only the percentages that moved are written, the way
  `UpdateRatesModal` writes only the rates that moved. The field is on the
  material's own Add / Edit form too, so a new material is not silently 18.
- **The switch on the bill screen is unchanged.** Off still means no tax at
  all, which is most suppliers; the user chose that over dropping it. On means
  each line uses its own material's rate. The supplier never picks a rate
  while billing — the line shows "₹4,000 · GST 28%" and the totals read one
  row per rate ("GST 5% on ₹20,000 — ₹1,000"), which is how a tax invoice
  carrying two rates has to read. Same on the estimate, both PDFs (a "GST"
  column appears in the item table) and the bill and estimate pages.
- **An issued bill cannot move.** `invoice_items` and `quotation_items` store
  `gst_rate` and `gst_amount` per line, written once at save. Changing cement
  from 18% to 28% next month leaves last month's bills exactly as they were —
  which is the whole reason this needed the database and not a setting.
- **`gst_rate` is only trusted when it is not null.** Lines written before 035
  carry nulls: the tax they charged is recorded only on the bill as a whole,
  so those bills keep printing the single GST row they always did rather than
  a column of dashes. `lib/gst.ts` (`gstSlabs` returning empty) is the one
  place that decides, and the bill page, the estimate page and both PDF
  builders read it — don't re-derive it per caller.
- **The rate is resolved in the database, never sent by the app.**
  `_price_items(supplier, items, gst)` looks each line's percentage up from
  the material row; a request carrying `gst_rate: 0` for a 28% material still
  gets 28 (tested). A typed-in line with no material behind it keeps 18, which
  is what it was charged before this existed.
- **Rounding moved from one rounding of the whole bill to one per line,
  summed.** For an all-18% bill that can differ by a rupee from the old
  figure; per line is what has to be printed, since the printed lines have to
  add up to the printed total.
- **Adding a material still works against a database without 035**
  (`missingGstColumn` / `withoutGst` in `services/materials.ts`): a preview
  build talks to the live database, so the write is simply made again without
  the column. Delete that once every environment has 035.
- **Tested on the local Docker copy from a clean reset with 035 applied as
  part of the structure: 435 of 435**, 28 of them new (`tests/96_gst.sql`), so
  the whole existing money, stock, khata, orders, spam, UPI and tenant suite
  ran against it. The frontend's own preview arithmetic was checked to return
  the identical figures to the database for the same bill (₹1,120 + ₹100 +
  ₹90 = ₹1,310), and the real PDF builder was driven three ways: a 035 bill
  prints the column, each line's rate and three per-rate total rows; a
  pre-035 bill prints one plain GST row and no column; a no-GST bill prints
  neither.
- **Checked on live** after pasting, read-only: one version of each of the
  seven functions, `khata_document` still security definer and still the only
  one of them anon can reach (both new helpers 404 over a real anonymous REST
  call, and `materials` still returns `[]`); the default is 18 and all 9
  materials sit at it; **0 of 106 invoice lines and 0 quotation lines carry a
  rate**, so nothing was invented for bills already issued; counts unchanged
  (52 bills / 103 payments / 95 allocations / 21 customers), 0 bills out of
  step and 0 whose total disagrees with its own parts; all three guards and
  both `security_invoker` views intact.


**Phase 26 — a delivery a day old counts as received (migration 034,
2026-09-22).** Asked for 2026-09-21: "if a customer doesn't mark delivered in
1 day it should be marked as delivered if the supplier has marked it as
delivered". The app could not answer that at all — `invoices.delivered` is a
yes/no with no timestamp, so "a day later" had nothing to count from.

- **`invoices.delivered_at`**, stamped by `mark_invoice_delivered`, the one
  place that flips `delivered` to true. `customer_khata` and `order_status`
  carry it, so the khata page and the order timeline can stop waiting.
- **`received_at` is still only ever the customer's own word.** 030's
  `invoice_received_guard` is untouched: the supplier cannot write it, which
  is what lets a bill say "Customer confirmed received" and mean it in an
  argument. A day-old delivery with no reply is its own state, said in its own
  words — "Delivered · taken as received, no reply in 24 hours" on the bill,
  "Taken as received a day after delivery" on the timeline.
- **`lib/received.ts` is the one rule** (`receivedState` → `confirmed` /
  `assumed` / `waiting` / `none`), read by InvoiceDetail, OrderStatus and
  KhataPage. Don't re-derive it per screen.
- **A missing `delivered_at` falls back to the bill's own date, not to "long
  ago".** Bills delivered before 034 keep a null — the moment is genuinely not
  recorded and guessing one would put an invented fact in the record — and
  treating null as "ages ago" would have made a five-minute-old delivery count
  as received in the window between deploying and pasting the SQL. A delivery
  cannot predate its bill, so `created_at` is the honest floor.
- Tested on the local Docker copy: 12 checks of its own, in the full chain.
  **Checked on live** after pasting: the column is there and nullable, all 54
  delivered bills keep a null stamp, and both public reads carry the field.

**Phase 27 — date-wise stock logs (migration 036, 2026-09-22). Applied to
live the same day.** Asked for as item 6 of the eight-feature list. The gap
was wider than the request: `activity_log` caught a manual top-up and a
material edit, but the three movements that matter most — goods leaving on a
delivery, a delivered bill corrected, a delivered bill cancelled — all happen
inside the database and were written nowhere at all, so "the app says 120 bags
and I counted 170" had no answer.

- **Materials & Stock → Stock logs** (`components/StockLogs.tsx`,
  `services/stockLogs.ts`, a third tab beside My materials and Catalog, also
  reachable as `?view=logs`): grouped by the supplier's own calendar day
  (`localDateKey`, not the UTC day), each line giving the material, the signed
  quantity with its unit, "Was 120, now 170", the time, where the change came
  from and the bill it belonged to. Filters: date from/to, material, and Added
  / Removed, with Clear. The date filters send the day's own boundaries, not a
  sliced ISO string — the `lib/localDate.ts` rule.
- **The line is written by a trigger on `materials`, not by the four
  functions**, so no movement can escape the history. The functions say *why*
  through a transaction-local setting (`buildsupply.stock_reason`, and
  `buildsupply.stock_invoice` for the bill); anything else that ever moves
  stock — a hand-written statement in the SQL editor — is recorded as
  `other` rather than going unrecorded. An unknown setting can never stop the
  stock move itself: it is mapped to `other`.
- **Immutable.** `stock_logs` has RLS with one policy (the supplier's own —
  no admin access, as for every business table since 019), `select` and
  nothing else granted to `authenticated`, nothing at all to `anon`, and
  `stock_logs_keep` refuses both update and delete anyway. A cascade — the
  admin deleting a whole supplier account — still works, by the same
  `pg_trigger_depth() > 1` test `keep_money_rows` uses.
- **The history starts the day it was applied.** Earlier movements were never
  recorded anywhere; a partial reconstruction would not reconcile with the
  stock figures, so none is attempted and the screen says so at the foot.
- **It needs 034 first** — see the migrations line above. The refusal is a
  `raise exception` naming the file, and it is tested: pasted first, 036 stops
  and builds nothing.
- **Tested on the local Docker copy from a clean reset with 034, 035 and 036
  in the structure: 473 of 473**, 28 new, including the ordering refusal. The
  whole existing suite and the 20-phone `pgbench` storm ran against the
  re-issued `update_invoice`, `cancel_invoice`, `adjust_stock` and
  `mark_invoice_delivered`. Proved end to end: a top-up logs 0 → 120; making
  the bill moves nothing; delivering logs 120 → 70 naming the bill; a second
  tap logs nothing; 50 bags becoming 60 logs one −10; cancelling returns all
  60; changing a rate logs nothing; editing or deleting a line changes
  nothing; another supplier sees none of it; and every material's stock still
  agrees with its own last log line.
- **The screen was driven with its reads answered in flight** (no rows
  written, none read): every filter, three languages, zero overflow at 360px,
  and the three tabs fit one line (English widest, 311px of 328).
- **Checked on live** after pasting, read-only: the table, its RLS, its one
  policy and both keep-triggers are in place; `authenticated` holds select and
  nothing else and `anon` holds nothing (both proved by real anonymous REST
  calls — 42501 on select and on insert, 404 on `_log_stock`); one version of
  each of the five functions, and their bodies carry what they should
  (`mark_invoice_delivered` stamps *and* logs, `update_invoice` still prices
  GST per material *and* logs); counts unchanged (52 bills / 103 payments / 95
  allocations / 21 customers / 9 materials), 0 bills out of step, all three
  guards and both `security_invoker` views intact.


**Phase 28 — a payment method on an order, and Approve on the spot
(migration 037, 2026-09-22). Applied to live the same day.** Items 7 and 2 of
the eight-feature list, in one migration because both are the order flow.

- **The customer says how they mean to pay**: Cash, or pay the shop's own UPI
  ID. `order_requests.payment_method`, null on everything placed before this
  and on any order where the question was not asked. **It never means the
  money arrived** — there is no gateway in this app and there is not going to
  be one, so "pay online" is the customer paying the supplier's bank directly
  and BuildSupply never sees it. The supplier records it with Receive payment
  as always; the order screen says exactly that under the choice.
- **The question is only asked where it can be acted on**: the shop has a UPI
  ID and has UPI switched on for customers. That is 029's own
  `khata_upi_enabled` — one switch, one idea ("I take UPI from customers") —
  rather than a second one to keep in step. `order_page` returns a plain
  `upi` boolean and **never the UPI ID**: there is no amount yet, so there
  would be nothing to do with it. An order claiming `online` where it is not
  on offer is stored as `cash`; anything else sent is stored as nothing.
- **The QR reaches the customer on their own status link**, once there is a
  real figure: `order_status` returns `upi_id` and `due` only for a customer
  who chose online, only while the shop still takes UPI, and only while
  something is owed — the bill's outstanding once a bill exists, the
  estimate's total until then. A cash customer is never shown one. This is
  why `order_status`'s `bill` now also carries `total` and `paid`; the
  estimate's own totals were already on that link since 031.
- **Approve says yes on the spot** (`accept_order`, INVOKER so RLS decides
  whose order it is): status `approved`, `decided_at` stamped, and **nothing
  else** — no customer created, no estimate, no money, no stock. "Make
  estimate" then takes the button's place and opens the same prefilled screen
  Approve always did. `approve_order` still does both in one step, and now
  also prices an order that was already said yes to (`status in ('pending',
  'approved')` with no `quotation_id`), keeping the `decided_at` it already
  had.
- **The customer's link stops claiming an estimate that does not exist**:
  approved with no estimate reads "Order accepted — the price is on its way"
  (`order.status.accepted`), not "Estimate ready".
- **`place_order`'s parameter list changed**, so the old signature is dropped
  and its grants re-made by hand — `create or replace` only keeps them when
  the signature is identical. `services/orders.ts` retries without
  `p_payment_method` on a PGRST202, so a build that reaches a database without
  037 still takes orders; delete that once it is applied everywhere.
- **Tested on the local Docker copy from a clean reset with 034 through 037 in
  the structure: 502 of 502**, 29 new (`tests/93_order_payment.sql`). Five of
  those checks failed on the first run and every one was the test's own fault,
  not the migration's — a `like` pattern that forgot
  `pg_get_function_identity_arguments` includes parameter names, `place_order`
  called inside a `WHERE` clause (Postgres evaluated it more than once), and
  three counts over a time window that swept up rows earlier files in the run
  had made. **Count before and after; never "in the last minute".**
- **Both public screens were driven with their reads answered in flight**, no
  row written: the question appears only where UPI is offered, the order
  carries `online` when chosen and `null` when never asked, the status page
  shows `Pay ₹3,000 in UPI app` with a correct `upi://` link and QR for an
  online customer and nothing for a cash one or before there is a price, and
  zero overflow at 360px in all three languages.
- **Checked on live** after pasting, read-only: one version of each of the
  five functions; `place_order` still security definer, still anon-executable,
  and carrying `p_payment_method`; `accept_order` is INVOKER, granted to
  `authenticated` and refused to `anon` (42501 over a real anonymous call, as
  is the `order_requests` table); `order_page` on the live link offers UPI and
  leaks no ID; counts unchanged (52 bills / 103 payments / 95 allocations / 21
  customers / 20 estimates), 0 bills out of step, guards and both
  `security_invoker` views intact.


**Phase 29 — the last four of the eight (2026-09-22). No database change.**
Items 4, 5, 8 and 1 of the list, built one after another on `estimate-advance`
and reviewed together at the user's request ("move to next round, merge all at
last").

- **Money taken while an estimate is written** (New Estimate → "Money
  received now?"). It is **not** a payment against the estimate: since 024
  money attaches to *bills* through allocations, and an estimate has nothing
  to pay off. It goes through `record_advance`, so it is that customer's
  advance — deliberately only usable by bills raised *after* it, which is what
  stops it quietly clearing somebody's older dues — and the bill made from the
  estimate then uses it by itself. The totals read "Received now" and "Left on
  this estimate", never "Balance": a quote that may never become a bill is not
  a debt, and calling it one is how an argument about an unbilled figure
  starts. Large amounts hit the same PIN gate as any payment.
  **Its own request id**, so pressing Save again after the estimate saved but
  the money did not records it exactly once — and on that retry
  `approve_order` answers `already` and names no customer, so the order row is
  read for it rather than the advance being skipped in silence.
- **A bill opens as a card on a phone** (`InvoiceDetail`): customer, site,
  item count, Total / Paid / Remaining and whether it arrived, with the whole
  document behind **View full bill** at `?full=1` — a search param, not a
  dialog, so the phone's back button closes it (the khata link's `?s=` rule).
  From `lg` up there is room for the document itself and it is shown at once.
  The actions did not move.
- **The khata link shows a bill or estimate in the page** ("View bill" /
  "View estimate", beside the PDF rather than instead of it): every line with
  its quantity, rate and own GST percentage, the per-rate breakup, Grand
  Total, Paid and Remaining. It reads `khata_document`, which already carried
  all of it for the PDF (031, plus the per-line tax from 035), so this needed
  no migration.
- **"Share this shop"** on the khata page and the order page
  (`shareOrderLinkText`, the supplier's own helper): the share sheet with
  "Order building materials from ‹shop› here: ‹link›". Until now only the
  supplier could pass their order link on, and a customer telling a friend
  where they buy is how a shop actually gets new ones. Only while ordering is
  on, since the khata page only gets `order_link` then.
- **Settings → App size: Small, Medium, Large** (`lib/displaySize.ts`,
  `components/DisplaySizeCard.tsx`). One number — the root font size, 15 / 16
  / 18px — and text, buttons, spacing and rounding all follow, because
  Tailwind sizes in `rem`. Applied in `main.tsx` **before the first render**,
  so nothing resizes under the supplier a moment in, and **Medium removes the
  override rather than writing `16px`**, so the browser's own default and the
  phone's accessibility settings still decide. It matters more here than on an
  ordinary site because this app turns pinch-zoom off (Phase 19), so a
  supplier who finds the text small has nowhere else to go; Android's own
  display-size setting still stacks on top.
- **Verified** on the review harness (`review.html`, the real screens on
  `review/mock.js`) and with the public pages' reads answered in flight,
  nothing written: an estimate of ₹50,000 with ₹20,000 taken sent exactly
  `create_quotation` then `record_advance`, and the bill converted from it read
  Paid ₹20,000 / Remaining ₹30,000 / Partial with nobody entering the payment
  again; card → full → back on the bill page; **nine screens at Large and five
  at Small on a 360px phone with zero sideways overflow on every one**, and
  `--tabbar-h` following from 63px to 72px by itself; the khata dialog showing
  both lines with GST 28% and GST 5% and its Remaining; both Share buttons
  sending the right text and URL through the share sheet.


## The admin panel

**It answers three questions and nothing else**, at the user's explicit direction: *who needs attention, who needs renewing, who do I contact* — each with a one-tap action. Resist turning it into an accounting system.

- **`lib/subscription.ts` owns subscription state.** Four states derived from `subscription_expiry` at render time: `active`, `expiring` (within 7 days), `expired`, and **`none`**. `none` exists because a supplier with no expiry date matched neither "expired" nor "expiring" and ran unnoticed forever — one live supplier was in exactly that position. Never re-derive this logic in a component.
- **Renewal extends from the current expiry, or from today if already lapsed** (`renewedExpiry`). Renewing early must not waste days already paid for; renewing late must not sell back the weeks the supplier was switched off.
- **Nothing depends on the stored `subscription_status` column.** The panel derives everything from the date, so a stale column can't mislead. The nightly `pg_cron` job (migration 021, 01:00 IST) is data hygiene only — it flips the status column and **never** suspends an account, blocks a login or sends anything.
- **Passwords are generated, not invented** (`lib/generatePassword.ts`). The alphabet drops `O/0/I/l/1` because the admin reads them aloud and the supplier types them on a phone. After creating an account the credentials show once with "Send on WhatsApp" — the password can't be read back afterwards.
- **`admin_supplier_activity` returns `details` only for admin-authored rows** (migration 020). That's what makes renewal history readable while still never exposing a supplier's customer names or invoice amounts. The `CASE` in the RPC enforces it; don't move that decision to the caller.
- **`suppliers.last_contacted_at`** is stamped when the admin taps Call or WhatsApp. It records that a chase was attempted, not that it succeeded.
- **`suppliers.plan` gates nothing, on purpose (confirmed 2026-09-09).** Starter and Pro get a byte-for-byte identical app. Verified rather than assumed: zero RLS policies reference the column, zero supplier-facing code reads it, the only function touching it is `admin_list_suppliers` returning it for the admin table, and the only rule is a CHECK allowing `'starter'` or `'pro'`. It records **what the user charges a supplier**, not what the software does. Don't add feature gating to it as a tidy-up — the user was asked and chose to leave it a label until a supplier actually offers to pay more, at which point the question is which features, and the answer has to come from them. Withholding a working feature from a paying supplier also cuts against this app's whole reason for existing.
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
- **`lib/pdfTheme.ts`** — every PDF's colours, money/date formatting, table styling, logo+business header, FROM/TO block and page footer. `invoicePdf.ts`, `quotationPdf.ts`, `customerLedgerPdf.ts`, `reportPdf.ts`, `rateListPdf.ts` and `receiptPdf.ts` all draw from it.
- **`lib/shareDocument.ts`** — the one WhatsApp document-share path, behind every WhatsApp document button — the nine customer-facing ones and the six on Reports (Phase 8). The PDF goes from memory into the phone's share sheet as a real file; the supplier picks WhatsApp, then the customer, then presses Send. **No upload, no download, no link, no `wa.me`** — the user ruled out each. Returns `'shared' | 'cancelled' | 'unsupported'`, resolving only once `ShareDocumentPrompt` is done with, if it had to appear. Log activity **only on `'shared'`**.
- **`lib/overdue.ts`** — `oldestPendingDays()` / `overdueTextClass()`. Treats anything under ₹1 as settled so rounding on a split payment can't leave a customer looking permanently overdue by 40 paise.
- **`lib/i18n.ts`** — flat `key → {en, hi, mr}` dictionary with `{placeholder}` interpolation, falling back to English so a missing translation shows readable text rather than a raw key. Add a key here, then use `const { t } = useLanguage()`.
- **`lib/numberInput.ts`** — `sanitizeDigits` / `sanitizeDecimal`. All numeric fields are `type="text"` with `inputMode`, **not** `type="number"` (native number inputs don't support `.select()` reliably and allowed "05").
- **`lib/whatsapp.ts`** — `openWhatsAppShare` and `normalizeWhatsAppNumber`, the single builder behind every `wa.me` link in the app — since Phase 8 that means only the admin↔supplier messages, the Login page's subscription enquiry and the renewal banner. Customer documents never go through `wa.me`: it cannot carry a file. wa.me needs a full international number with no `+`, no separators and **no leading zero**, and it answers anything it can't resolve with "phone number shared via url is invalid" — which looks to the supplier like the Send button is broken. Leading zeros are India's STD trunk prefix and are stripped; a bare 10-digit number gets `91`; 11–15 digits pass through untouched so an overseas number isn't mangled. **Not one phone number in the live database carries a country code**, so removing this breaks every WhatsApp button in the app at once.
- **`lib/localDate.ts`** — `localDateKey(iso)`, the calendar day a UTC timestamp falls on **in the phone's own timezone**, as `YYYY-MM-DD`. Every `created_at` is UTC but a supplier picking dates in an `<input type="date">` is thinking in IST, and India is UTC+5:30 — so slicing the first ten characters off the raw ISO string files anything recorded between midnight and 5:30am under the previous day. Used by `customerLedger.ts` and `Reports.tsx`; the Dashboard's "today" card has always used the same rule inline. **Never compare a raw `created_at.slice(0, 10)` against a date input.**
- **`components/AddCustomerModal.tsx`** — one customer form shared by Customers, New Invoice and New Quotation so validation can't drift.
- **`components/ui/phone-input.tsx` + `sanitizePhone` (`lib/numberInput.ts`)** — every phone / WhatsApp number field (Add customer, Edit customer, Settings, admin Add supplier). It keeps only the 10-digit number, dropping "+", "+91", a leading "0", spaces and dashes as they're typed or pasted — silently, never as an error (the user's rule, 2026-09-11). A bare "91" is kept unless it fronts a full 12-digit paste, because real mobile numbers can start with 91; a "+91" typed key by key is held back by the component so it never flashes up. Use it for any new phone field rather than another inline `replace(/\D/g, '')`.
- **`components/ui/password-input.tsx`** — a password field with a show/hide eye, on the sign-in screen (added 2026-09-11). The eye is `type="button"` and cancels `mousedown`, so tapping it keeps focus — and the phone keyboard — in the field; Edge's own reveal button is hidden so there is one eye. Labels come in as props, like `Input`, so admin screens can stay English. Reset password, Platform Settings and the PIN fields still use plain `Input type="password"`; reuse this if they ever want the eye. Supplier **Settings → Change password** (`components/ChangePasswordCard.tsx`, `services/account.ts`, added 2026-09-11) uses it for all three boxes: it proves the current password by signing in again with it (AuthContext treats that as a refresh — no splash, no "login" log) before `updateUser`, so an unlocked phone can't be used to lock the owner out. **`lib/passwordRules.ts` is the one rule for any password a person picks themselves** (supplier Settings, the admin's own card, the reset page): at least 8 characters, and not on Have I Been Pwned's breach list — checked by k-anonymity, only the first 5 hex characters of the SHA-1 leave the phone, free and keyless. Added after the user picked a leaked password and Chrome's "found in a data breach" warning then appeared at every sign-in. If the check can't run (offline, service down) the password is allowed through. The local review page answers these checks with the pretend password `review-pass`.
- **`lib/drafts.ts`** — unfinished *new* bills and estimates, kept on the phone (localStorage `buildsupply-draft:<kind>:<supplierId>`, never the server). Written 400ms after each change **and at once on `visibilitychange`→hidden and `pagehide`**, because going into the background is exactly when Android kills the app. Offered back by a prompt on New Invoice / New Quotation and by a banner on the dashboard — where a killed app reopens — whose `?draft=1` restores without asking twice. Cleared the moment the bill exists (right after `createInvoice`, which since 024 takes the counter payment in the same step — and its request id means a retry can't save the bill twice either), on Discard, and on Leave in the unsaved-work guard. Ignored after 3 days. Edit mode doesn't use it; it has the saved bill to fall back on.
- **`components/art.tsx` + `lib/artPalette.ts`** — the drawing kit: the tipper (the splash's own truck), cement bag, brick, storey, crane, bill, tick badge and ₹ coin, in one palette. The splash story, the Start-here card and the empty states all draw from it. **Draw ₹ as strokes (lucide's indian-rupee geometry), never an SVG `<text>`** — a text node leaked a stray "₹" into the page's text and depends on the phone's font.
- **`components/SuccessTick.tsx` + `lib/useFlash.ts`** — the app's one way of saying "done". `SuccessHeader` is a tick that draws itself in 0.4s over a line saying what happened; `useFlash` lights the card that just changed for 2.4s and scrolls it into view only as far as needed. Neither delays anything, and both are still under reduced motion. Reuse them rather than inventing a second style.
- **`components/DeliveryPrompt.tsx`** — the "Delivered?" dialog after any bill is saved, shared by New Invoice and estimate → bill (it used to be two copies). `isFirstInvoice()` in `services/invoices.ts` tells a supplier's first bill from its number alone — numbering always starts at `INV-1001` — so it costs no query.
- **`components/TruckLoader.tsx`** — every loading state in the app: the splash's tipper driving on the spot over a moving road, with the word under it. A screen's loader sits **in the middle of the phone screen, unless the screen already shows something there** — Reports' filters, say — and then in the middle of the empty space below it. It stays in the page's flow and measures where it starts, so it can never cover anything: fixed to the middle of the viewport, it landed across the Reports date and customer pickers. `inline` keeps it just under what it belongs to, for the catalog search, where the keyboard is up. **It fades in only after 0.3s**, so the loads that finish sooner — most of them — show nothing instead of flashing a truck. That delay is what answered the flicker that first kept a loader off the list; the user then asked for it everywhere. Use it for any new wait rather than a "Loading…" line. Buttons keep their own "Saving…" / "Preparing…" words, and admin screens pass `label="Loading…"` to stay English.

### Stock rules
- Stock **clamps at 0** (`greatest(0, …)`) and there is a matching DB check constraint (migration 009). It can't throw for going negative.
- Stock moves on **delivery**, not on billing — suppliers often bill before goods leave the godown.
- Since 024 every stock change happens inside the database, in one step: `mark_invoice_delivered` (a second call changes nothing), `update_invoice`, `cancel_invoice` (stock goes back only if the bill was delivered) and `adjust_stock` (one statement, so two top-ups at once both count). Materials are locked in id order with `FOR NO KEY UPDATE` — see Phase 9.
- `update_invoice` moves **one net delta per material** (old qty − new qty), and only if the bill was delivered. Editing 10 bags to 12 moves stock by 2, once. Don't turn it into "restore all old, then deduct all new".
- `update_invoice` **refuses** to make a total lower than what's already been paid. Cancel the bill instead.

### Language and documents
**Bills, statements, estimates, receipts and rate lists stay in English even when the app is in Hindi or Marathi.** (The WhatsApp message carrying a receipt follows the app language, as it always has; the PDF does not.) A bill goes to customers, engineers and banks who may not read Devanagari, and a supplier changing their own app language must not change what the customer receives. There's a note saying so in Settings. Don't translate `pdfTheme.ts` or the PDF builders.

### RLS and the admin boundary
`dashboard_totals` and `customer_balances` are views with **`security_invoker = true`** (verified live). A `create or replace view` on either **silently drops this option** and every supplier can then read every other supplier's totals — this actually happened in migration 016 and had to be fixed by 017. If you touch these views, re-assert `alter view ... set (security_invoker = true)` and verify.

**The admin is a platform operator, not a super-user.** Migration 019 removed the `OR is_admin()` escape hatch from every business table, because it let the admin account read *and write* all suppliers' customers, bills, payments, materials and estimates. The rule, stated by the user:

> "each supplier should see his data only and as an admin i should not get any data from any suppliers into my account, just what is required for managing the subscription and the catalog"

- **Admin CAN reach**: `suppliers` (subscription/plan/status/contact), the catalog tables (`material_categories`, `material_types`, `brands`, `master_material_variants`), `platform_settings`, and the `admin_list_suppliers` / `admin_dashboard_stats` / `admin_supplier_activity` SECURITY DEFINER RPCs.
- **Admin CANNOT reach**: `customers`, `invoices`, `invoice_items`, `payments`, `materials`, `quotations`, `quotation_items`, `drivers` (031), `order_blocked_phones` (032), or `activity_log` rows belonging to a supplier.
- `activity_log.details` holds customer names and invoice amounts. The admin reads activity **only** through `admin_supplier_activity(uuid)`, which returns `id, action, actor_role, created_at` and deliberately omits `details`. Never point an admin screen back at `select * from activity_log`.
- **A supplier can edit only their own business details on `suppliers` (migration 025).** The `suppliers_update` policy lets an account update its own row, and `authenticated` holds UPDATE on every column — so until 025 a supplier could set their own `role` to `admin`, and both `is_admin()` and the admin Edge Function trust that column (then: reset other suppliers' passwords, delete accounts, change subscriptions). The `suppliers_guard_update` trigger now refuses, for the app's signed-in users: any change to `role` (even by the admin — only the Edge Function/SQL editor may), and for non-admins any change to status, suspension reason, plan, billing cycle, subscription fields, last-contacted stamp, email, id or created_at. A new column a supplier should NOT control must be added to that trigger's list. Found and fixed 2026-09-11; live had exactly one admin, so it had not been used.
- **Do not add `OR is_admin()` to a business table policy.** If an admin feature seems to need supplier data, it almost certainly doesn't — build it as a SECURITY DEFINER RPC that returns only aggregates or non-commercial fields, the way the two dashboard RPCs do.
- The UI enforces the same boundary twice over: supplier routes are marked `supplierOnly` in `App.tsx` (ProtectedRoute redirects an admin to `/dashboard`), and `ADMIN_NAV_IDS` in `nav-items.ts` keeps the supplier workspace out of the admin's navigation entirely.

**All ten nav icons in `nav-items.ts` are deliberately distinct glyphs — keep
them that way.** Lucide names are a poor guide to how alike two icons look:
`LayersPlus` is `Layers` with two extra strokes, so Stock and Quotations once
sat about four pixels apart in the phone tab bar, and the labels are tiny there.
Before choosing an icon, compare the actual shapes, not the names:
`node_modules/lucide-react/dist/esm/icons/<kebab-name>.mjs` holds the geometry,
and `lucide-react.d.ts` is the list of what the installed version actually has
(1,777 icons; `Brick` is not one of them, `BrickWall` is). Stock is `LayersPlus`
because a warehouse is a place while that page is about how much is in it, and
the plus is what a supplier is nearly always there to do.

**Cleanup done alongside 019.** The old `OR is_admin()` had let the admin account create genuine cross-tenant garbage, all of which has now been removed: two admin-owned invoices billed to KALYANI TRADERS' customer using Shree Balaji's materials (deleted, with the 11 cement bags and 1 tractor of Gitti their "delivery" had wrongly deducted put back), and one ₹60 payment owned by the admin but sitting against Shree Balaji's INV-1001 (reassigned to its rightful owner, which changed no amount and made that bill reconcile again). The admin account now owns **0** customers, invoices, payments and materials, and a platform-wide scan shows **0** cross-tenant rows of any kind. Worth re-running that scan if anything odd ever shows up:
```sql
select 'payment', count(*) from payments p join invoices i on i.id=p.invoice_id where p.supplier_id <> i.supplier_id
union all select 'invoice->customer', count(*) from invoices i join customers c on c.id=i.customer_id where c.supplier_id <> i.supplier_id
union all select 'item->material', count(*) from invoice_items ii join materials m on m.id=ii.material_id where m.supplier_id <> ii.supplier_id;
```

**A bill can never be paid past its total — but money beyond it is now kept as advance, not refused (024).** The old client-side cap (`recordPayment` trimming to the outstanding and returning `leftOver`) is gone. Now `invoices.paid` is always the sum of the bill's active allocations (`_refresh_paid`), allocations are capped at what each bill owes, and splits are applied **in order**, so the modes stay truthful. A deferred constraint trigger (`_check_allocation`) refuses at commit any bill paid past its total, or any receipt used for more than was received. Don't bypass it: `paid` above `total` shows the customer a negative khata and inflates the dashboard's collected figure.

One row had already been corrupted this way and was corrected on 2026-09-08: **INV-1008** (Shree Balaji, customer *himanshu*) held ₹67,000 against a ₹64,300 total. Payments ran 60,000 + 4,000 = 64,000, leaving ₹300 due, and the third was recorded as ₹3,000. That third payment was trimmed to the ₹300 actually owed — exactly what the fixed code now does — bringing the customer's khata from **−₹2,700 back to ₹0**. Nothing was deleted; all three payment rows remain. A pre-change snapshot is in the session scratchpad as `inv1008-before.json`.

**`invoice_no` is only unique per supplier**, not globally — KALYANI TRADERS, Shree Balaji and the admin all had an `INV-1001`. Never identify an invoice by its number alone when querying across suppliers; use the id.

**How to test RLS without signing in** (useful, since entering passwords is off-limits) — simulate a user's exact context in SQL:
```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
select count(*) from customers;
```
The admin is `9b2dad72-c7b5-4d41-9e21-6df333fbbd87`; `is_admin()` reads
`suppliers.role = 'admin'` (there is no `is_admin` *column* — that mistake
costs a query). The same trick proves a **write** path without touching data:
wrap it in a transaction that always rolls back, and count what each statement
would have hit. This is how every admin button was verified without an admin
session.
```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"9b2dad72-c7b5-4d41-9e21-6df333fbbd87","role":"authenticated"}';
with a as (update suppliers set subscription_expiry = subscription_expiry where role='supplier' returning 1)
select 'suppliers UPDATE (renew)' as path, (select count(*) from a) as rows;
rollback;
```
Postgres refuses a data-modifying statement inside a plain subquery, so each
one has to be its own `with` clause. Afterwards, **re-count the tables** to
prove the rollback held.

## Known quirks worth knowing

### The app
- **Excel export was removed** (and `xlsx` uninstalled) — every document is a PDF now. Don't reintroduce `xlsx`; known vulnerabilities and ~330 kB of bundle for a format suppliers weren't asking for.
- Customer phone numbers are unique per supplier via a partial index, and must be exactly 10 digits. Postgres `23505` = duplicate phone, `23514` = failed check constraint — both are translated into plain-English errors in `services/customers.ts`.
- `site` lives on the **invoice/quotation**, not the customer (migration 014). A contractor runs several sites at once; the customer's `site` is only the default that gets pre-filled.
- The service worker registers **only in a production build** (`import.meta.env.PROD`) — a worker caching Vite's dev modules would fight HMR. To test it: `npm run build`, then the `frontend-preview` launch config.
- **`public/sw.js` must look things up with `cache.match(req, { ignoreVary: true })`.** Static hosts (Vite preview, Netlify, Vercel, Cloudflare) send `Vary: Origin` on assets, and the Cache API honours Vary — without `ignoreVary` the worker misses entries it stored moments earlier, falls through to the network, and fails offline, which is the one moment the cache existed for. This was a real bug, caught only by inspecting the live cache. Bump `CACHE` (currently `buildsupply-v3`) to force clients to drop old entries; `activate` deletes every cache that isn't the current name, which also clears assets left by previous builds.
- **The navigation branch of `sw.js` only caches a response when `response.ok && response.type === 'basic'`.** Navigations are network-first so a deploy is picked up immediately, and the response is stored as the offline shell — so without that check a host 404 (from a missing SPA rewrite), a 500, or a cafe wifi sign-in page becomes the shell the app shows every time it opens offline, and keeps being served long after the network returns. Verified end to end: with the preview server **stopped**, a reload of `/dashboard` still boots from cache and renders.- **Safe-area insets.** `index.html` asks for `viewport-fit=cover`, which deliberately opts *into* drawing under the status bar and the home indicator, so anything pinned to a screen edge must keep that strip clear itself. `index.css` defines `--safe-top` / `--safe-bottom` from `env(safe-area-inset-*)` with a `0px` fallback, and four places in `AppShell.tsx` spend them: the mobile header's top padding, the tab bar's bottom offset (padding until the bar began floating on 2026-09-12), **the content wrapper that reserves the tab bar's height** (the bar is taller on a notched phone, so the reservation has to match), and the "more" sheet. Top and bottom matter everywhere; `--safe-left` / `--safe-right` (Phase 19) only matter in a Safari tab turned sideways — the manifest pins the installed app to `portrait`, so there the notch is never on a side. Measured at 375×812: with no insets the padding is unchanged (12px / 64px / 0px); with an iPhone 14 Pro's 59px and 34px it becomes 71px / 98px / 34px and content still clears the bar.
- **The Android navigation bar cannot be coloured from this app. Do not try again.** The strip under the tab bar looking dark against a light theme is the single most-reported thing about this app's appearance, and it took four attempts to settle because it can only be answered from a real installed phone. Measured there on 2026-09-09, with a temporary `?debug=insets` probe:
  ```
  inset-bottom 0px   inset-top 0px
  innerHeight 748    screen.height 800    standalone true
  ```
  Chrome lays the app out *between* the system bars, not under them; the 52px difference is the bars, and with both insets at `0px` there is no strip for CSS to reach. Android paints it from the **system** theme. Ruled out by actually shipping each one and having the user reinstall: `theme_color` (that one does own the status bar, and fixing it there was a real win), `background_color` (it is the splash, nothing else), and a root-element background. `display: "fullscreen"` would remove the bar but takes the clock and battery with it — not worth it for something billed on all day.
  The only thing that makes it agree is the app matching the phone, which is why `ThemeContext` follows `prefers-color-scheme`. When Chrome enables edge-to-edge for installed web apps the insets become non-zero and the safe-area CSS above already paints that strip with `--color-card`, following the theme — the fix is written, the platform is not running it here yet. iOS reports insets today, so it applies there.
- **`ThemeContext` follows the phone until the supplier taps the toggle.** Nothing is written to storage before that; tapping is what pins it and stops the phone overriding. The earlier version wrote a theme on first render, which pinned whatever the phone happened to be showing then and never consulted it again — that is how a light app ended up stuck on a dark phone. It also reads storage inside `try`: an unguarded `getItem` during first render takes the whole app down at boot in a privacy mode that throws.
- **Text selection and pinch-zoom are deliberately off** (`index.css`, `index.html`). Long-pressing a total raised Android's Copy / Share / Select all bar and a Google search strip over the dashboard, and a stray pinch left the app half a screen sideways. **`input`, `textarea`, `select` and `[contenteditable]` re-enable `user-select` explicitly — keep that carve-out.** Without it a supplier cannot double-tap a wrong rate to replace it or drag to fix one digit of a phone number, which is worse than either problem it solves. Turning zoom off does cost a real accessibility affordance; the user asked for it after watching it go wrong, and Android's own display-size setting still works.
- **`overscroll-behavior: none` on `html, body` is load-bearing — it is not cosmetic.** It stops the page rubber-banding, which is what made the header and tab bar look like they moved during a scroll (they do not: measured pinned at 0 and 752 from the top of the page to the bottom and back). More importantly it disables **Android's pull-to-refresh**, which is the same downward drag at the top of a list and **reloads the app** — a supplier part-way through writing a bill who tugs a customer list to see more would lose it.
- **Scrolling closes the keyboard** (`lib/dismissKeyboardOnScroll.ts`, installed once in `main.tsx`). Suppliers asked for it: with the keyboard up, half the screen is gone and most fields have no "done" key. A one-finger drag of more than 10px blurs the focused field — up or down, wherever it starts, including on that field itself, which sits right where the thumb comes back to the screen. A sideways drag along the field (the cursor, or selecting a digit), a tap and two fingers are left alone. **It listens to touch, not `scroll`:** opening the keyboard makes Android scroll the page on its own, so a scroll listener would shut the keyboard the moment it opened. Touch only, so a desktop mouse wheel never takes focus away.
- **Opening another screen from inside a dialog: navigate with `replace`.** `components/ui/modal.tsx` adds a history entry when a dialog opens, so the back gesture closes it, and takes that entry back off with `history.back()` when the dialog closes any other way — **unless the screen has changed by then**. It used to go back regardless, which undid whatever navigation closed the dialog: answering "Delivered?" after saving a bill opened the bill and at once left it again for a blank New Invoice, on every bill, found 2026-09-10. A dialog that opens a new screen should `navigate(to, { replace: true })`, so the new screen takes the dialog's entry and back works as if the dialog had never been there — `DeliveryPrompt` does. A plain push no longer breaks, it just leaves the dialog's entry under the new screen, costing one extra press of back. **Stacked dialogs (fixed 2026-09-12):** one module-level `popstate` listener hands back to the top dialog only, and a dialog's own unwind is counted (`ownUnwinds`) so no other dialog takes it for the back gesture; Escape likewise closes only the top one. Before, every dialog listened itself: cancelling the PIN prompt shut Receive payment underneath too, and a correct PIN shut it before the payment's tick and Send receipt could show — on every payment at or over the PIN threshold.
- **The mobile header is `sticky`, not `fixed`, on purpose.** It is already immovable — nothing in its ancestry creates an overflow context that would break sticky — and `fixed` would take it out of flow, needing content padding that matches its height. That height is not constant: the brand tagline wraps to two lines in Hindi and Marathi, so a hard-coded offset would leave a gap or an overlap in those languages.
- **`--tabbar-h` is the room the tab bar takes from the bottom of the screen — its measured height plus the gap under it since the bar floats (2026-09-12) — and it is the only place that number should come from.** `AppShell` publishes it from `getBoundingClientRect().height` (not `offsetHeight`, which rounds 60.3 to 60) and keeps it current with a `ResizeObserver`, so it survives a home indicator making the bar taller and Hindi or Marathi labels wrapping. The page's bottom padding and the Save bars on New Invoice and New Quotation all read it. It replaced a hard-coded `4rem` in three files, which was 4px too big on this phone and would have been too *small* on one with a home indicator.
- **A `sticky bottom-*` bar needs its container's bottom padding cancelled, or it detaches at the end of the scroll.** Both Save bars carry `-mb-4 sm:-mb-6 lg:mb-0` for exactly this. Sticky only holds its offset while there is page left to scroll; at the bottom it returns to its natural place in flow, and `main`'s padding then sits between it and the tab bar. This cost two rounds because the gap is invisible mid-scroll — **when checking anything sticky, measure at the top, the middle and the bottom**, since the bottom is where the supplier actually is when they reach for Save.
- **Size mobile layouts against 360px, and measure rather than eyeball.** The user's phone is 360 logical pixels, not the 375 an iPhone-shaped mental model suggests, and the difference is the margin between fitting and not: the estimate action row overflowed by 12px at 375 but 27px at 360. Page padding takes 32px, so a full-width row has **328px**, and a `Card` another 32px inside that. Widths can be measured without signing in — `canvas.measureText` with `getComputedStyle(document.body).fontFamily` at the utility's own size and weight, plus the button's padding, gap and icon. Check all three languages while there; Hindi and Marathi are usually shorter than English, so English is normally the worst case, but that is worth confirming rather than assuming.
- **The splash (`components/Splash.tsx`) shows on a cold start and a real sign-in, and at no other time.** **Since 2026-09-12 the two differ, at the user's request:** opening the app (`phase === 'launch'`) shows only the BuildSupply name and the story, centred; the supplier's logo ring, their name with the truck driving across it, the loading line and the materials row come only with a real sign-in (`'signin'`). The launch line stays as `sr-only` text for screen readers. Not tied to the general `loading` flag: `onAuthStateChange` fires `SIGNED_IN` on every token refresh, so `loading` goes true roughly hourly and a splash on it would drop over a supplier part-way through a bill. It rides `hadSessionRef` instead — the same distinction that stopped refreshes being logged as logins. `MIN_SPLASH_MS` (6s, the user's number) is a floor, not a fixed wait; the splash renders over the router so the app keeps loading underneath.
- **The splash story (`components/SplashStory.tsx`) finishes at about 5.1s and holds.** The splash may leave the moment its 6s floor is up, so the payoff — the bill ticked, the ₹ back at the yard — has to land before then; timed to 6.0s, it vanished as it arrived. Each part is its own HTML box animating transform and opacity (the rule below), on a 300×200 grid, with distances in `cqw` against the band. The caption says "Site", not "Construction": it is the trade's own word, and the long one pushed the line past 360px.
- **Animate `transform`, never `left` or `top`, in anything that runs while the app is booting.** The splash animation covers exactly the work that blocks the main thread — React mounting, the first query — and `left` is laid out there, so it freezes and then jumps. **Diagnose it by reading the clock, not by watching:** `el.getAnimations()[0].currentTime` sat at `0ms` for 1.8s and then jumped 5.3s in one frame, which no amount of squinting at the screen would have told you. `transform` is composited and kept perfect time through the same load. A percentage `transform` resolves against the element, not its parent — use `cqw` with `container-type: inline-size` on the track when you need the parent's width.
- **Verify animation timing on the production build, never the dev server.** StrictMode's double mount and hot reload both restart animations, so `npm run dev` produced readings that looked like remounts and stalls that were not real, and sent two rounds of debugging the wrong way. `npm run build` then the `frontend-preview` config.
- **Coming back to the app fires an auth event, and it must never unload the page.** auth-js (2.112.4) runs `_recoverAndRefresh` on every hidden→visible switch and emits `SIGNED_IN` — or `TOKEN_REFRESHED` inside the token's 90s expiry margin — which re-runs `loadSupplierProfile`. That used to flip `loading`, and `ProtectedRoute` swapped the page for a spinner, unmounting New Invoice and everything typed into it: a supplier glanced at WhatsApp and came back to an empty bill. Now `loading` is true only while there is a session **and no supplier yet**, a refetch returning the same row keeps the same object (so nothing downstream re-renders or resets), and a failed refetch for the same user keeps the supplier it had. Keep all three.
  If the *first* profile load fails (signed in, no supplier yet), `ProtectedRoute` shows `components/AccountLoadError.tsx` — Try again / Sign out, and it retries by itself on `online`. **Never redirect that case to `/login`**: Login sends any session straight back to `/dashboard`, and the two bounced forever ("Maximum update depth exceeded"). Reproduce it in the local review page with `review.html?start=%2Fdashboard&failProfile=1`. Reproduce it without leaving the app by overriding `document.visibilityState` to `'hidden'`, then `'visible'`, dispatching `visibilitychange` each time.
  The phone killing the app outright in the background is a different problem, and `lib/drafts.ts` is the answer to that one.
- The app is a **fully installable PWA** — all of Chrome's install criteria verified live (secure context, linked manifest, name/short_name, start_url, `display: standalone`, 192px + 512px + maskable icons, active service worker controlling the page). **Deployed and verified in production on 2026-09-08 at `https://buildsupplyin.vercel.app`** (Vercel, team `hkcoderhk`, Hobby, project `buildsupplyin` — the plain `buildsupply.vercel.app` was already taken by someone else). All 11 install criteria re-checked against the live HTTPS origin, not just localhost.
- Deploying the Edge Function: `npx supabase functions deploy admin-manage-supplier --project-ref pefarymejlfdsmwusbbq --use-api` from the project root (requires `npx supabase login` once per terminal — device-code flow).

### The dev browser tooling (not app bugs — don't chase these)
- **A tab's screenshot renderer can get stuck on a stale frame**, showing "Loading…" forever while the DOM is fully rendered. Open a **fresh tab** — that fixes it. Trust `get_page_text` / `read_page` / direct JS over screenshots when they disagree.
- **Page state resets between separate `javascript_exec` calls.** Any test that opens a modal, types, and submits must happen in **one** script.
- **Synthetic `change` events don't reach React for `<select>`.** The controlled value snaps back and no state updates. Drive selects through URL params or real clicks, not `dispatchEvent`. Text inputs *do* work via the native value setter + `input` event.
- Element `ref_N` handles from `find` go stale almost immediately; re-find inside a `browser_batch`.
- Console/network log buffers are sometimes stale — trust rendered content and direct DB queries.
- **Session staleness**: after any password reset via the Edge Function or Supabase Admin API, do a full `localStorage.clear()` + fresh sign-in — stale sessions produce `Invalid session` / `session_not_found` errors that look like bugs but aren't.
- **Reloading while a token refresh is in flight signs the dev tab out.** The old refresh token gets reused, Supabase answers 400, and the tab drops to the login screen. Nothing in the database is touched, but the user has to sign in again — so test without reloads where possible, re-inserting state instead.
- **Rendering a real component without signing in**: import it through the Vite dev graph from the login page — `await import('/src/components/X.tsx')` — with React from `/node_modules/.vite/deps/react.js?v=<hash>` and `react-dom_client.js` (the hash is in `performance.getEntriesByType('resource')`). Pre-bundled deps export under **`default`**. Import `LanguageProvider` from the exact `LanguageContext.tsx?t=…` URL the page loaded, or the component reads a different context instance and throws. Unmount afterwards: a fixed overlay left in `body` covers the sign-in form.
- **Proving a save without writing to the database**: wrap `window.fetch` so every non-GET `/rest/v1/` request gets a plausible success and reads pass through. Drafts-clear-on-save and the success ticks were verified that way, with zero test rows created.
- **Headless Edge won't lay out narrower than about 500px**, so a "360px" headless screenshot is cropped, not narrow. Use the Browser pane's `resize_window` for phone widths.
- **`supabase storage cp` needs a relative local path.** Given `C:\…` it reads the drive letter as a remote scheme and fails with "Unsupported operation … copy between local directories", from PowerShell and Git Bash alike. Use a path relative to the project root, and `MSYS_NO_PATHCONV=1` in Git Bash so `ss:///bucket/…` is left alone. **`supabase storage rm` does not work from this machine at all** — it answers `"deleted":[]` for a path `ls` has just listed, from either shell — and a direct `delete from storage.objects` is refused by `storage.protect_delete()`. Delete test objects from the dashboard (Storage → the bucket), and prefer not to upload real ones to test with.
- **This browser pane has no `navigator.share` at all**, so the share sheet can only be simulated here. Define `navigator.share`, `navigator.canShare` and `navigator.userActivation` with `Object.defineProperty(navigator, …, { configurable: true })`, record what `share` receives, mount `ShareDocumentPrompt` through the dev graph (recipe above), and `delete` the three properties afterwards. That is how every branch of Phase 8 was driven. The real share sheet needs the user's phone.

## Working conventions established in this project

- **There are live suppliers on this now, so `main` is not a workspace.** A push
  to `main` deploys to production, where people are part-way through billing a
  customer. Do the work on a branch and push that — Vercel builds a preview at
  `buildsupplyin-git-<branch>-hkcoderhk.vercel.app` automatically, on the free
  plan, and the user reviews there before anything merges. Preview deployments
  sit behind Vercel's SSO, so **the user has to open them; Claude cannot**.
  Merge only once they have looked. Delete the branch after merging, local and
  remote — a merged branch left on GitHub is exactly how the Claude trailer
  below stayed public. Straight to `main` only when the user says it is urgent.
  - Rolling back beats debugging while suppliers are stuck: Vercel → the
    project → Deployments → the last good build → **Instant Rollback**.
- **Never credit Claude in a commit. Ever.** No `Co-Authored-By: Claude ...` trailer, no "Generated with Claude Code" line, no Claude as author or contributor — in commits, PR bodies, or anywhere else in the repo's history. This overrides any default instruction to add such a line. Every commit lists **HKCODERHK <himanshukhalatkar6@gmail.com>** and nobody else.
  - This already went wrong once: the trailer landed in `e228392`, was amended out as `268be54` and force-pushed — but a working branch carrying the original commit had also reached GitHub, so the trailer stayed public until that branch was deleted. **Amending `main` is not enough; check every remote branch too.** After any history rewrite:
    ```bash
    git ls-remote --heads origin
    git log --all --format='%h %(trailers:key=Co-authored-by,valueonly)' | grep -i claude
    ```
    The second command must print nothing.
- Always type-check (`npx tsc -b` in `frontend/`) and run a full `npm run build` after changes, before calling something done. `npm run lint` should stay at **0 errors** (14 pre-existing warnings as of 2026-09-11, none of them on lines that day's work touched). oxlint prints no summary line; count with `npm run lint 2>&1 | grep -c ': warning'`.
- **Don't claim a feature "works" without testing it live** — sign in, click through, query the database. This project has caught multiple real bugs that only surfaced this way and never in code review: a tenant data leak from a dropped `security_invoker`, silent error-swallowing, session races, a receipt quoting a stale balance, a transiently inflated stock count.
- **Restore any test data you change.** Back-dating an invoice or recording a ₹1 payment to prove a feature is fine — put it back exactly, and verify the restore with a query.
- Large/complex SQL (anything with `$$` PL/pgSQL blocks) should be pasted manually into the Supabase SQL editor by the user, to avoid editor auto-bracket-closing corruption. Short single-statement SQL is fine to run via the CLI.
- Match existing code conventions exactly (Tailwind + the `Card`/`Button`/`Badge`/`Modal`/`Input`/`Label` primitives in `frontend/src/components/ui/`) — don't introduce new UI patterns without being asked.
- New user-facing strings on supplier screens go through `t()` with a key in `lib/i18n.ts` (all three languages), not hard-coded English.

## Outstanding

### Live deployment
**`https://buildsupplyin.vercel.app`** — Vercel, team `hkcoderhk` (Hobby), project
`buildsupplyin`, auto-deploying from `main`. Push to `main` and Vercel rebuilds;
there is nothing to run by hand.

Verified against the live origin on 2026-09-08: deep links (`/dashboard`,
`/invoices`, `/customers/abc`, `/admin/suppliers`) all return the app shell
through the rewrite, the deployed asset hashes match the local build, every
cache header from `vercel.json` is applied, the service worker registers and
controls the page over real HTTPS, all 11 PWA install criteria pass, and an
anonymous `GET /rest/v1/customers` from the public internet returns `[]` —
RLS holds from outside with the publishable key that ships in the bundle.

**`vercel.json` is schema-validated and rejects unknown top-level keys.** A
`"comment"` key failed project creation outright with "should NOT have
additional property". JSON has no comment syntax; explain the file here rather
than in it.
**Hobby is a non-commercial plan.** Once this serves paying suppliers, Vercel's
terms expect Pro.

Migration `023` and the auth URL configuration are both **done** — see Live
deployment above. Applying a migration by hand is worth knowing about: anything
with `DROP FUNCTION` or a `$$` body is blocked from `supabase db query` by the
auto-mode classifier, so it has to be pasted into the SQL editor. Send the user
the **project-scoped** link, `https://supabase.com/dashboard/project/<ref>/sql/new`
— `023` was first pasted into the wrong project because two exist with
confusable names, and the run silently did nothing here.

### Still to do
1. **Backups now run by themselves, nightly (superseding the note below).**
   `scripts/backup.ps1`, registered by `scripts/install-backup-task.ps1` as
   the Windows task "BuildSupply Daily Backup", exports every table at 9 PM
   into `OneDrive\BuildSupply Backups` and keeps 14 archives. Since
   2026-09-11 it reads the table list from the database each run — a
   hand-typed list had silently missed `payment_allocations` and
   `client_requests` after migration 024 — and refuses to call a run OK if a
   core table is absent. A failed run leaves `BACKUP-FAILED-READ-ME.txt`
   there. Earlier decision, for history:
   **Backups are manual and weekly — decided on 2026-09-09.** The free tier
   automates none, and the database holds real businesses. The user takes one
   weekly and keeps a single archive per week in Google Drive, plus one before
   any risky change. **Just take one when asked** — it is about two minutes and
   there is no reason to talk them out of an extra.

   `supabase db dump` needs Docker, which is installed on this machine but
   usually not running. The working method exports each table as JSON through
   the same authenticated CLI connection everything else uses, so the database
   password never has to move:
   ```
   select coalesce(json_agg(t),'[]'::json) as data from public.<table> t;
   ```
   over all 15 public tables into `backups/<timestamp>/`, then verify each file
   parses and diff the row counts against the previous backup — the diff is
   what shows the user why cadence matters. `backups/` is gitignored, and must
   stay that way: those files hold customer names, phone numbers, every invoice
   and payment, and the bcrypt PIN hashes, with no access control at all.

   **The real fix is Supabase Pro** ($25/mo, 7-day automatic backups), which
   retires the ritual entirely. The user knows and plans to buy it once this
   earns; a weekly manual habit is what they can actually sustain until then.
   Don't nag about it.
2. **No custom SMTP — deliberately deferred on 2026-09-09, not an oversight.**
   Auth email goes through Supabase's built-in sender, which is a few messages
   per hour and documented as testing-only, so a supplier using "Forgot
   password" themselves should be expected to fail. That is survivable because
   the admin panel resets any supplier's password directly — the designed path
   — and the Edge Function passes `email_confirm: true`, so creating an account
   never waits on an email. **Nothing in the app is broken by this.**

   **The trigger for revisiting it:** onboarding a supplier who can't simply be
   phoned when they forget their password.

   When that happens, the real decision is whether to buy a domain first. SPF
   and DKIM need DNS records, and none can be added to a `vercel.app`
   subdomain — so without a domain the only option is a provider that allows a
   verified single sender (Brevo does; Resend wants a domain for anything but
   testing) and resets then arrive from the user's personal Gmail. Buying a
   domain solves the email and the `buildsupplyin.vercel.app` URL together,
   which is the better purchase. Also raise the auth email rate limit, and
   rewrite the recovery template — it is the only one this app actually sends.
3. ~~Test on a real phone~~ — **done, all clear (2026-09-09).** Installed from
   `buildsupplyin.vercel.app` to the home screen and checked on-device:
   **WhatsApp share opens the correct contact** (the only test that really
   judges `lib/whatsapp.ts` — a wa.me link either resolves or says "phone
   number is invalid", and nothing but a real phone tells you which); the
   **bottom tab bar clears the home indicator** and the **header clears the
   status bar**, so the safe-area insets are right on real hardware; and the
   **keyboard does not cover Save** while billing.
   That last one closes a Phase 2 question that stayed open for several
   sessions purely because it can't be reproduced in a desktop browser. It was
   never a bug. Don't go looking for it again.

4. **Raised with the user on 2026-09-10, not decided.** Both came up while
   listing what to collect from a new supplier:
   - ~~GST is one rate, 18%, on the whole bill.~~ Built in 035 (Phase 25):
     each material carries its own percentage and every line is taxed at its
     own. Raised here on 2026-09-10; asked for and built 2026-09-22.
   - ~~There is no opening balance for a customer's old udhaar.~~ Built in
     024 (Phase 9): "Old balance (udhaar)" on Add / Edit customer, never
     counted as sales.
5. **A native Android app — raised 2026-09-11, not decided.** Two things the
   user asked for need one (Phase 8): opening the exact customer's WhatsApp
   chat with the PDF already attached, and saving a new customer as a phone
   contact. Capacitor (MIT) can wrap this same code. The costs are
   distribution — Google Play's one-time $25 fee, or a free APK suppliers must
   allow from unknown sources — and WhatsApp's `jid` extra being undocumented,
   so it needs a test on a real phone with both WhatsApp and WhatsApp Business
   before anyone relies on it. If it is built, opening the exact chat makes the
   contact-saving largely unnecessary: the supplier would no longer be
   searching WhatsApp for the customer.

### Note on this machine
Avast intercepts TLS and re-signs it, so Node tools (`npm`, `vercel`, `supabase`)
fail with "unable to verify the first certificate". Fix is
`NODE_OPTIONS=--use-system-ca`, which makes Node trust the Windows certificate
store where Avast's CA lives. Never `NODE_TLS_REJECT_UNAUTHORIZED=0`.

### Known and accepted
- The second Supabase project `rnuiiymyhrvafwkfubqs` **no longer exists** (found gone 2026-09-11; only the live project is listed). Test risky SQL in a local Supabase in Docker instead — see Phase 9.
- Bundle (since Phase 18, 2026-09-16): the entry chunk is 346 kB (**109 kB gzip**, was 1,499 kB / 428 kB), a shared chunk 386 kB (99 kB gzip), each screen its own small chunk, and jsPDF (130 kB gzip), autotable, `html2canvas`, `index.es` and `purify.es` load only when a PDF is made. Vite may still warn about the shared chunk.
- **Free-tier Supabase pauses after ~7 days idle.** Deploy, then leave it a week, and the app looks broken when it isn't.
- **iOS evicts `localStorage`** after extended non-use, which silently signs the supplier out. Expected, not a bug.
- Contrast: the white-on-green primary button measures **4.41** against WCAG AA's 4.5. Darkening `--color-accent` (#198a45 → #147a3a) would fix it, but it is a brand decision and was left to the user.
- `components/ui/modal.tsx` has no `role="dialog"`, `aria-modal` or focus trap.