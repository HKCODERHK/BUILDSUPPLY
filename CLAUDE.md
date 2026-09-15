# BuildSupply — Project Context for Claude

Read this fully before doing anything in this repo. It captures everything from prior sessions so work can continue without re-deriving context.

## What this is
A multi-tenant SaaS billing/khata (ledger) app for building-material suppliers in India — customers, invoices, quotations, stock, payments, deliveries, WhatsApp bill sharing, PDF reports. Originally built from a Claude Design mockup (`BuildKhata.html`), then given a real Supabase backend, then a full Admin platform, then a structured Master Material Catalog, and most recently a round of features aimed squarely at *less typing, fewer disputes* for the supplier.

**The guiding principle, stated by the user repeatedly: this app exists to make a building-material supplier's day easier.** Anything that makes the app feel like Tally is a step backwards. When in doubt, remove a screen rather than add one.

## Locations
- **Project root**: `C:\New folder\BUILDSUPPLY`
- **Frontend**: `frontend/` (React 19 + Vite 8 + TypeScript + Tailwind CSS v4)
- **Schema migrations**: `supabase/migrations/` — `002` through `031`, run in order. **031 is the latest and is applied** (2026-09-15, pasted by the user — links and drivers, see Phase 16). 030 (estimate answers and material received, Phase 13), 024 (money integrity, Phase 9), 025 (supplier row guard), 026 (online orders), 027 (reject reasons), 028 (khata link) and 029 (UPI) are applied too. (An unrelated storage-bucket 024 from Phase 8 was applied and removed again on 2026-09-11 and its file deleted.) (There is no `001` file; the base schema is `supabase/schema.sql`, which predates the migration folder.)
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
  per phone per 24h, 60 per supplier per hour, the same phone and items
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
  (`app-header`, `app-tabbar`) shown without fading, so the bubble slides once.
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

Supplier helpers — the eight free ideas the user picked from a 17-idea list,
in their order:
1. **Customers from the phone's contacts** (`lib/contacts.ts`,
   `AddCustomerModal`): the Contact Picker API, Android Chrome only — the
   button is hidden elsewhere, and it is read-only. One contact fills the
   form; on Customers several can be picked, checked over (names editable,
   anyone without a 10-digit mobile left out) and added one at a time, with
   any refused (a number already in use) listed with the reason.
2. **Today's rates card** (Dashboard `RatesReminder`): once a day, "Update
   today's rates?" — Update rates (opens Stock) or Same as yesterday; either
   puts it away until tomorrow (localStorage
   `buildsupply-rates-checked:<supplierId>`, the phone's own date). Only once a
   material has a rate. A card among the notices, never a popup.
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
- **Admin CANNOT reach**: `customers`, `invoices`, `invoice_items`, `payments`, `materials`, `quotations`, `quotation_items`, `drivers` (031), or `activity_log` rows belonging to a supplier.
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
- **The navigation branch of `sw.js` only caches a response when `response.ok && response.type === 'basic'`.** Navigations are network-first so a deploy is picked up immediately, and the response is stored as the offline shell — so without that check a host 404 (from a missing SPA rewrite), a 500, or a cafe wifi sign-in page becomes the shell the app shows every time it opens offline, and keeps being served long after the network returns. Verified end to end: with the preview server **stopped**, a reload of `/dashboard` still boots from cache and renders.- **Safe-area insets.** `index.html` asks for `viewport-fit=cover`, which deliberately opts *into* drawing under the status bar and the home indicator, so anything pinned to a screen edge must keep that strip clear itself. `index.css` defines `--safe-top` / `--safe-bottom` from `env(safe-area-inset-*)` with a `0px` fallback, and four places in `AppShell.tsx` spend them: the mobile header's top padding, the tab bar's bottom offset (padding until the bar began floating on 2026-09-12), **the content wrapper that reserves the tab bar's height** (the bar is taller on a notched phone, so the reservation has to match), and the "more" sheet. Only top and bottom exist — the manifest pins the installed app to `portrait`, so the notch is never on a side. Measured at 375×812: with no insets the padding is unchanged (12px / 64px / 0px); with an iPhone 14 Pro's 59px and 34px it becomes 71px / 98px / 34px and content still clears the bar.
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
   - **GST is one rate, 18%, on the whole bill** (`GST_RATE` in New Invoice
     and New Quotation, and the `0.18` in `services/invoices.ts` and
     `services/quotations.ts`). Right for cement and TMT; sand and gitti are
     usually 5%. It matters the day a GST-registered sand or gitti supplier
     signs up.
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
- Bundle: `dist` is 1.7 MB total; the main chunk is 1.20 MB (**345 kB gzip**), plus jsPDF's `html2canvas` (44 kB gzip), `index.es` (47 kB) and `purify.es` (10 kB). Vite warns about the main chunk. Code-splitting the PDF libraries would fix it if it ever matters.
- **Free-tier Supabase pauses after ~7 days idle.** Deploy, then leave it a week, and the app looks broken when it isn't.
- **iOS evicts `localStorage`** after extended non-use, which silently signs the supplier out. Expected, not a bug.
- Contrast: the white-on-green primary button measures **4.41** against WCAG AA's 4.5. Darkening `--color-accent` (#198a45 → #147a3a) would fix it, but it is a brand decision and was left to the user.
- `components/ui/modal.tsx` has no `role="dialog"`, `aria-modal` or focus trap.