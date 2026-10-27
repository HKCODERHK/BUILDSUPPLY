# BuildSupply — Full System Audit (pre-onboarding)

**Date:** 2026-10-27 · **Commit audited:** `9e953de` (main) · **Scope:** repository, migrations 002→051, the three Edge Functions, live Supabase (read-only), live Vercel headers.
**Nothing was changed** — no code, schema, data, branches, deploys or backup tasks. Every production check was a single read-only `select` or an anonymous `GET`.

---

## 1. Executive summary

BuildSupply's foundations are strong. Money and stock changes run inside the database under row locks with request ids; RLS is on every table; the admin is fenced off from supplier data on the backend, not just in the UI; public links use 128-bit codes; and no customer-sent price is ever trusted. I found **no P0 issue**: no cross-shop data exposure, no money corruption on live, and no way for a customer or an outsider to change a price.

The real risks are **day-to-day operational gaps that a real supplier will hit within the first weeks**:

1. **A wrongly typed payment cannot be corrected** (P1). Receipts are permanent by design, and nothing exists to reverse one.
2. **Deleted materials vanish from orders without anyone being told** (P1). The customer's "sent" screen lists an item the shop never received, and approving such an order prices the line at ₹0. **Live has 9 such lines right now** in open orders.
3. **Old estimates can be accepted and billed at old rates** with no warning (P2). Nothing expires; live has 5 open estimates over 30 days old.
4. **Converting an estimate re-prices GST at today's rates** (P2), so the bill can differ from the estimate the customer accepted.
5. **No screen refreshes when the app comes back to the foreground** (P2). Prices on an open order page, balances on a khata link and the supplier's own lists stay as they were when the screen opened.
6. **Non-code readiness:** backups are off, the legal texts are DRAFT, Vercel Hobby is non-commercial, and there is no SMTP. Each of these must be decided before a paying supplier arrives.

---

## 2. Verified architecture

| Layer | What it is (verified) |
|---|---|
| Frontend | React 19 + Vite 8 + TS + Tailwind 4, lazy-loaded screens (`lib/screens.ts`), PWA with a hand-written `public/sw.js` (v8) |
| Hosting | Vercel `buildsupplyin` (Hobby). Live headers: HSTS (preload), `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy. **No CSP.** |
| Backend | Supabase Postgres + Auth + Storage + `pg_cron` + `pg_net` |
| Business logic | Plain-SQL/PLpgSQL functions. Money and stock functions are **SECURITY INVOKER** (RLS applies). Public and customer functions are **SECURITY DEFINER** with a pinned `search_path` |
| Edge Functions | `admin-manage-supplier` (JWT checked → `suppliers.role='admin'`, origin allow-list), `supplier-apply` (no JWT, origin check plus 10/hour platform cap), `send-push` (no JWT, only sends what is already due) |
| Auth | Supplier and admin by email+password; customers by anonymous Supabase Auth on a separate client (`lib/customerAuth.ts`); access tokens last 15 min |

**Live read-only results (2026-10-27):**
- tables without RLS: **0**
- bills whose `paid` ≠ active allocations: **0**
- bills paid past their total: **0**
- cross-tenant payment→bill rows: **0**; cross-tenant bill→customer rows: **0**
- orphaned bills: **0**
- both views are `security_invoker=true`
- anonymous REST reads of customers, invoices, payments, materials and suppliers return `[]`; order_requests, complaints, notifications and push_subscriptions refuse with 42501

---

## 3. Route & workflow inventory

- **Public:** `/`, `/login` (Shop owner | Customer), `/apply`, `/privacy`, `/terms`, `/forgot-password`, `/reset-password`
- **Customer:** `/order/:link` (with `?v=cart|orders|profile`), `/order-status/:token`, `/khata/:code` (with `?s=…`), `/me`, `/khata-help`
- **Applicant:** `/application`
- **Supplier:**
  - Dashboard; Customers and a customer's page
  - Invoices: new, a bill, edit
  - Quotations: new, an estimate
  - Payments, Deliveries, Reminders, Reports
  - Materials (My materials / Catalog / Stock logs)
  - Orders and an order; Complaints; Notifications
  - Settings, with `?s=` sections
  - Shortcuts: `/go/bill`, `/go/payment`, `/go/details`
- **Admin:** dashboard, suppliers, a supplier, catalog, compliance, a compliance record, platform settings

Public RPCs callable by `anon` (verified live):
- `order_page`, `place_order`, `order_status`, `respond_to_estimate`
- `customer_khata`, `khata_document`, `confirm_received`
- `file_complaint`, `khata_complaints`
- `request_khata_link`, `request_khata_link_from`
- `shop_profile`, `platform_disclosure`
- `save_push_subscription`, `push_subscribed`, `remove_push_subscription`
- `is_admin` (kept on purpose, see 040)

The rest are trigger functions or pg_trgm internals, which cannot be called as RPCs.

---

## 4. Material rates — the deep investigation (Section 2 of the brief)

**Flow traced:**

1. The supplier edits `materials.rate`.
2. `OrderPage.tsx:292` calls `order_page(link)` once, on mount.
3. The customer picks quantities, and the page shows **indicative** totals from those loaded prices (`OrderPage.tsx:374`).
4. `place_order` (`050_selling_types.sql:153`) stores **material id, name, unit, qty and the vehicle/capacity — never a price**.
5. The supplier taps Approve, which opens `NewQuotation` (`?order=`). `applyOrder` prices each line at the supplier's **current** rate (`NewQuotation.tsx:150-166`). The supplier can edit it, then saves through `create_quotation`/`approve_order`.
6. The customer sees the real estimate on their status link and taps Accept or Call me.
7. Convert to a bill (`QuotationDetail.tsx:118`): `create_invoice` uses the **estimate's stored line rates**, but `_price_items` takes GST from the material's **current** `gst_rate`.

| # | Question | Answer (with evidence) |
|---|---|---|
| 1 | Latest rates on open? | **Yes.** `order_page` is a live definer RPC. The SW never touches Supabase (cross-origin; `sw.js` fetch handler returns early) and there is no CDN layer for the API. |
| 2 | Rate changes while page open? | **Not shown until a reload.** There is no refetch on focus, `visibilitychange`, interval or realtime (grep: the only `visibilitychange` listeners are drafts, the hero video and the bell). |
| 3 | Stale caches? | localStorage holds only the last order's **ids and qty** (`rememberLast`), never prices. SW: cross-origin is never cached. **No stale-price cache exists** apart from the in-memory page state. |
| 4 | Order submitted with an outdated price? | Harmless to the money. The order carries no price, and the estimate is priced fresh by the supplier. The only effect is that the customer's "Estimated total" can differ from the estimate. |
| 5 | Server revalidates? | **Partly.** It checks material belongs to shop ✔, `available` ✔ (refused), whole loads / min / step ✔, qty format ✔, shop open and active ✔. **But** a material id that no longer exists (deleted) is **silently dropped**, not refused (`050:315` inner join). See F-02. |
| 6 | Browser prices trusted anywhere? | **No** on the customer side: `place_order` reads only `material_id` and `qty` (comment at `050:284`). On the supplier side the supplier's own typed rate is authoritative by design, and GST is resolved in the DB (`_price_items`). |
| 7 | Malicious rate manipulation? | **Not possible.** Extra JSON fields are never read, and another shop's material ids are dropped. |
| 8 | What is the order price? | **Indicative only** (the page says so). The estimate is the price offer, and the bill is final. |
| 9 | History kept after a rate change? | **Yes.** `quotation_items.rate` and `invoice_items.rate`, `gst_rate` and `gst_amount` are stored per line (035). Order items keep the name and the load capacity. |
| 10 | Existing estimates/bills after a rate change? | Unchanged. An **edit** of a bill re-prices GST at today's percentage (`035:287`), by design. |
| 11 | GST/unit change vs old records? | Old bills: frozen (stored line GST, issuer snapshot 043). **Estimate → bill conversion re-reads GST** (F-04). Unit: bills print the stored description. Only the driver's list reads the live `unit_label`. |
| 12 | Material deleted/disabled mid-order? | Disabled → refused with a clear message ✔. **Deleted → silently dropped** from the order; the customer's sent screen still lists it (`OrderPage.tsx:652` renders local `chosen`) ✘. When the supplier approves an order whose material was deleted, the line comes up at **₹0** (`NewQuotation.tsx:166`) ✘. |
| 13 | Concurrent updates? | Orders: request id plus `on conflict` ✔. Estimate convert vs a second convert: `create_invoice` locks the quotation `status in ('Draft','Sent')`, so a second convert is refused ✔. Accept vs convert: independent rows, with no harm (accept after convert is refused, since only Draft/Sent can be answered). |
| 14 | Supplier told the order used an old price? | **No.** The order stores no "price the customer saw", so the supplier can't know what the customer expected. |
| 15 | Customer told price changed? | **Only implicitly.** The estimate on the status link shows real rates, and nothing says "this differs from the ₹X you saw". |

**Recommendation (simplest safe design):**
- **(a) Refresh on return:** refetch `order_page` on `visibilitychange`→visible when the page has been hidden for over ~60s. About 10 lines; no new infrastructure.
- **(b) Revalidate on submit:** have `place_order` **refuse** unknown material ids ("Something you chose is no longer sold — please review") instead of dropping them. Optionally, also return the stored items so the sent screen shows what the server kept.
- **(c) Optional, low-cost transparency:** store each line's displayed price in the order item as `seen_price` (informational only, never used for money). The estimate screen could then flag "customer saw ₹X".

**Not recommended:** Realtime or polling. Prices are indicative and the estimate is the binding step, so live push adds cost, connection limits and complexity for no money-safety gain.

| Option | Complexity | Reliability | Cost | Verdict |
|---|---|---|---|---|
| Refresh-on-open (today) | none | stale while open | free | keep |
| + refresh on foreground | tiny | covers the "left open overnight" case | free | **recommended** |
| + revalidate on submit | small (SQL) | closes the silent-drop hole | free | **recommended** |
| Polling | small | wasteful on 2G/4G | API calls | no |
| Realtime | medium (anon channel and RLS for anon) | fragile on budget phones | free-tier connection limits | no |

---

## 5. Financial integrity

**Verified in code:**
- `_check_items`: no negative qty or rate, and at least one line.
- Transport ≥ 0.
- `payments.amount > 0` and the `payments_mode_check` constraint.
- Customer lock with `FOR NO KEY UPDATE` and advisory-lock numbering.
- `_claim_request`/`_finish_request` idempotency.
- Deferred `_check_allocation`.
- `payments_keep` / `payment_allocations_keep`.
- Release on cancel.
- `update_invoice` refuses a total below the amount already paid.
- Convert refuses a second conversion.
- Request ids live for the dialog's lifetime: `CustomerProfile.tsx:84`, `Payments.tsx:86`, `NewInvoice.tsx:153`.

**Verified live:** 0 bills out of step, 0 overpaid, 0 cross-tenant.

| Scenario | Result |
|---|---|
| Customer pays twice | The second payment becomes an advance and is used by the next bill ✔ |
| Double-tap Save | Same request id → one bill ✔ |
| Timeout after a successful write, retry **in the same dialog** | Same id → original result returned ✔ |
| Timeout, supplier **closes the dialog and enters again** | New id → **second payment recorded**, with no way to undo it ✘ (F-01) |
| Two bills at once | Advisory lock → distinct numbers ✔ |
| Accept while converting | Safe (see 4.13) ✔ |
| Cancel a bill after payment | Allocations released → advance ✔ |
| Advance before a bill exists | `record_advance`, used by later bills only ✔ |
| GST changes after an estimate | **The bill differs from the estimate** ✘ (F-04) |
| Identical repeat order | Allowed since 038 ✔ |
| Stock at zero under concurrency | Clamped at 0 and locked in id order ✔ (stock never goes negative; an oversold delivery silently clamps) |

**Not re-executed in this audit:** the local Docker DB suite (502 checks and the 20-phone `pgbench` storm, per project history). Results above are from a code trace plus live invariants.

---

## 6. Security

**Implemented and verified (leave unchanged):**
- RLS on all public tables (live: 0 without).
- Admin removed from business tables (019).
- Admin RPCs check `is_admin()` in the body: `admin_list_suppliers`, `admin_dashboard_stats`, `admin_supplier_activity`, `accept_supplier_application`, `compliance_decide`, `review_compliance_document`.
- `suppliers_guard_update` (025) stops role and plan self-promotion.
- Every definer function pins `search_path` (live: all definer rows carry `search_path=public`).
- 128-bit khata and status codes; no ids or phones leaked by public reads.
- `request_khata_link` always answers ok (no enumeration).
- Spam guard: honeypot, per-phone, per-device HMAC, shop cap, block list.
- PIN lockout shared across set, verify and clear.
- Private `kyc` bucket with no update or delete policy.
- No `dangerouslySetInnerHTML` / `innerHTML` anywhere in `src`.
- `safeLink` for social URLs.
- Referrer-Policy keeps link codes out of referrers.
- `robots.txt` keeps private paths out of search engines.
- Origin allow-list on the admin Edge Function.

**Gaps (none exploitable cross-tenant):**
- F-05 Direct table writes by a supplier's own login.
- F-08 `expire_lapsed_subscriptions` callable by any login.
- F-09 `send-push` can be invoked by anyone.
- F-10 `supplier-apply` platform cap can be exhausted by a script.
- F-11 Dependency advisories.
- F-12 No CSP.

---

## 7. Findings (priority-ranked)

### F-01 · P1 · Supplier / Database · No way to correct a mistyped payment
- **Type:** Design risk / missing workflow
- **Evidence:** `payments_keep` and `payment_allocations_keep` (024) refuse deletes, and no reverse, void or refund function exists (grep of migrations and `src`: none). A typo such as ₹50,000 for ₹5,000 becomes a ₹45,000 advance permanently. Compounded by a re-entry after a timeout (new request id on reopening the dialog).
- **Current protection:** the PIN gate at or above ₹25,000 (only if a PIN is set); idempotency within one dialog.
- **Impact:** a wrong khata, a wrong dashboard "collected" figure and customer disputes; the only workaround (opening balance) distorts the books.
- **Recommended fix:** `reverse_payment(payment_id, reason)` — marks the receipt reversed (new `reversed_at`/`reversed_reason`, never deleted), releases its allocations, and re-runs `_refresh_paid`. PIN-gated, shown struck-through in the ledger and khata. Plus a confirmation line ("Record ₹50,000 cash from Ramesh?") before save.
- **Risk of fix:** touches 024's money core, khata views, PDFs and backups. Needs your approval: it changes the "receipts are permanent" rule (they stay, but can be marked reversed).
- **Testing:** local Docker suite plus new checks: reverse → allocations released → balance restored, a double reverse refused, other tenants refused.
- **Status:** Confirmed (by code)

### F-02 · P1 · Customer / Supplier · Deleted material silently dropped from an order; ₹0 line on approval
- **Type:** Confirmed bug
- **Evidence:**
  - `place_order` inner-joins `materials` (`050:315`), so unknown ids vanish unless *all* vanish.
  - The sent screen renders local `chosen` (`OrderPage.tsx:652`).
  - `NewQuotation.tsx:166`: a missing material → `rate: 0`.
  - `removeVehicleOption` deletes options not on bills/estimates/stock logs, but doesn't check `order_requests.items`.
  - **Live:** 9 order lines in pending/approved orders name deleted materials (left by the 2026-10-21 clear).
- **Current protection:** `available=false` is refused properly.
- **Impact:** the customer believes they ordered something the shop never saw, and a ₹0 estimate line can be sent.
- **Recommended fix:**
  - `place_order` raises "no longer sold" for any unknown id.
  - `NewQuotation` marks a missing-material line "No longer in your materials — set a rate" and blocks saving at ₹0.
  - Optionally, `removeVehicleOption` treats open orders as "on record".
- **Risk of fix:** `place_order` is re-issued (same signature); old pages get a clear error instead of a silent drop.
- **Testing:** delete a material with the order page open → submit → refused; approve an old order → the line is flagged.
- **Status:** Confirmed

### F-03 · P2 · Customer / Supplier · Estimates never expire; old rates can be accepted and billed
- **Type:** Design risk
- **Evidence:** the `Expired` status exists in the CHECK (012) but nothing sets it. `respond_to_estimate` accepts any Draft/Sent estimate. Live: 5 open estimates older than 30 days.
- **Impact:** a customer accepts a 2-month-old estimate, the supplier taps "Make the bill" from the banner, and the bill goes out at old rates.
- **Recommended fix (simplest):** show the estimate's age on the accepted banner and the convert screen ("Estimate from 12 Aug — 76 days old; rates may have changed"). Optional: a validity period in days, setting `Expired` on read. Don't auto-expire without your call.
- **Risk of fix:** UI only (the first option).
- **Status:** Confirmed

### F-04 · P2 · Financial · Converting an estimate re-prices GST at today's material rates
- **Type:** Confirmed bug (consistency)
- **Evidence:** `QuotationDetail.tsx:125` and `Quotations.tsx:62` → `create_invoice` → `_price_items` reads `materials.gst_rate` (`035:96`), ignoring `quotation_items.gst_rate`. The same holds for typed lines.
- **Impact:** if cement moves from 18% to 28% between estimate and bill, the bill total differs from what the customer accepted.
- **Recommended fix:** when `p_quotation_id` is given, take each line's `gst_rate` from the estimate's stored line, falling back to the material for pre-035 estimates.
- **Risk of fix:** `create_invoice` is re-issued, and the money suite must re-run.
- **Status:** Confirmed (by code)

### F-05 · P2 · Security / Database · A supplier login can write money tables directly, bypassing the functions
- **Type:** Design risk (same tenant only)
- **Evidence:** live, `authenticated` holds UPDATE and DELETE on invoices, invoice_items, payments, payment_allocations, customers, quotations and materials. The policies are `FOR ALL` own-rows. So with their own token (as any REST client can), a supplier could:
  - `update invoices set total/paid`;
  - delete a bill — items and allocations cascade, because the keep-triggers let cascades through;
  - delete a customer, which sets `invoices.customer_id` to null.

  The UI never does any of this (`deleteCustomer` has no caller).
- **Impact:** no cross-tenant harm. But "an issued bill cannot change" is only true through the app, which weakens dispute evidence and allows self-corruption by a bug or a script.
- **Recommended fix (later, carefully):** money functions are INVOKER, so a plain REVOKE breaks them. Options:
  - BEFORE UPDATE/DELETE triggers refusing direct changes unless a transaction-local flag (set by the functions, like 036's `stock_reason`) is present;
  - or move the money functions to DEFINER with explicit tenant checks.
- **Risk of fix:** high — it touches every money path. Run the full local suite.
- **Status:** Confirmed (privileges); not exercised

### F-06 · P2 · All · No screen refreshes when the app returns to the foreground
- **Type:** UX / consistency
- **Evidence:** every data screen loads in a mount `useEffect` only. The bell polls every 60s (`useUnreadNotifications.ts:24`), but the lists don't.
- **Impact:** a stale order-page price, khata balance, supplier Orders list or Dashboard after the PWA sat in the background. An alert says "New order" but the open Orders list doesn't show it until navigation.
- **Recommended fix:** one small `useRefreshOnReturn(reload, 60s)` hook on OrderPage, KhataPage, OrderStatus, `/me`, Dashboard, Orders, Customers and the customer page.
- **Risk of fix:** low. Avoid it on forms (NewInvoice), where reloading would fight drafts.
- **Status:** Confirmed

### F-07 · P2 · Supplier · Payment re-entry after a timeout can duplicate (no "check first" nudge)
- See F-01. Even before a reversal exists: on a network error, keep the dialog open with "Not sure it saved? Tap Record again — it won't count twice", and refresh the payment list when the dialog closes after an error.
- **Risk of fix:** low.
- **Status:** Confirmed (by code)

### F-08 · P3 · Security · `expire_lapsed_subscriptions()` executable by any signed-in login
- **Evidence:** live grant check shows definer=true, authenticated=true (040 revoked only anon/public).
- **Impact:** an anonymous customer login can trigger the nightly status-hygiene update early. It changes nothing the nightly job wouldn't.
- **Fix:** `revoke execute … from authenticated` (cron runs as postgres).
- **Status:** Confirmed

### F-09 · P3 · Security · `send-push` is unauthenticated
- **Evidence:** deployed `--no-verify-jwt`. Calling it only sends notifications already due (`claim_push_batch`, service_role-only).
- **Impact:** quota burn on Edge invocations, nothing else.
- **Fix (later):** a shared header secret set in `platform_settings`/`pg_net`.
- **Status:** Confirmed (by design)

### F-10 · P3 · Security · `supplier-apply` 10/hour platform-wide cap
- **Impact:** a script can block genuine applications for an hour at a time. Acceptable while onboarding is by hand.
- **Status:** Confirmed (by design)

### F-11 · P2/P3 · Dependencies · `npm audit`
- **Findings:**
  - `dompurify ≤3.4.16` (critical; transitive via jsPDF — the app never calls `.html()` and has no innerHTML, so it is not reachable today);
  - `vite 8.2.0–8.2.2` (high; dev server only);
  - `source-map-js` (high; build-time).
- **Fix:** `npm audit fix` on a branch, then build, preview and check PDFs.
- **Status:** Confirmed

### F-12 · P3 · Security · No Content-Security-Policy header
- **Impact:** defence-in-depth only; no XSS sink was found.
- **Fix:** a report-only CSP first, since inline styles, Supabase, `wa.me` and `upi:` need allowances.
- **Status:** Confirmed

### F-13 · P3 · Customer UX · Customer can only "Accept" or "Call me" on an estimate — no "Not interested"
- Unanswered estimates stay open forever (feeds F-03). Suggest only if suppliers ask.
- **Status:** Confirmed

### F-14 · P3 · Accessibility
- `modal.tsx`: no `role="dialog"`, `aria-modal` or focus trap.
- Primary button contrast 4.41 (< 4.5).
- Pinch-zoom disabled (an accepted decision).
- **Status:** Confirmed (known)

### F-15 · P3 · Operational · Admin suspension takes up to 15 minutes to bite for an open session
- A banned login keeps its current access token until expiry (15 min). Public pages hide the shop at once (`status <> 'active'`). Acceptable.
- **Status:** Confirmed (by design)

---

## 8. End-to-end scenarios

Evidence for each is a code trace plus live invariants. **No scenario was clicked through with a signed-in supplier in this audit** (Claude cannot sign in; see §12).

| # | Scenario | Result |
|---|---|---|
| 1 | New supplier → … → payment → khata | Flow intact. Watch F-02 (₹0 lines) and F-04 (GST on convert) |
| 2 | Khata → repeat order → statement | ✔ ("Fill in my last order" filters unavailable items) |
| 3 | Rate change while order page open | Customer sees the old indicative price; the estimate uses the new one. F-06 / §4 |
| 4 | Material archived / deleted mid-order | Archived ✔ refused clearly. Deleted ✘ F-02 |
| 5 | Two shops on one phone; remove, sign out | ✔ `forgetShopOnPhone`, separate auth storage key. The khata store keeps `{code,name}` together (Phase 22 fix) |
| 6 | Shop paused / ordering off | ✔ `order_page` → `open:false`; `customer_khata` → `paused` (047) |
| 7 | Estimate expired / rejected / cancelled bill | ✘ no expiry (F-03); cancel releases money ✔ |
| 8 | Partial payments, advances, cancel | ✔ live invariants hold |
| 9 | Network retry, double tap, concurrent | ✔ within a dialog; ✘ after reopening (F-07) |
| 10 | Admin suspends | ✔ public pages hide; admin can't read business tables (019, live `[]`); see F-15 |
| 11 | Complaint → reply → customer sees | ✔ `respond_complaint` checks the owner; one open per bill |
| 12 | Old WhatsApp link after state change | ✔ status/khata are live reads; ✘ old estimate still acceptable (F-03) |

---

## 9. What's working well — leave unchanged

- The money core (024/035/036): locks, request ids, allocations, permanent receipts, release on cancel, deferred checks.
- Server-side pricing rules: no customer price trusted, GST resolved in the DB, per-line snapshots, the issuer snapshot (043).
- Tenant isolation and the admin boundary (019, 025); `security_invoker` views.
- Public link design: 128-bit codes, minimal payloads, no enumeration, account-free status links.
- Spam guard (032), PIN gate (022), KYC bucket rules (045), immutable audit tables.
- SW caching policy: never caches Supabase, never stores HTML as `/assets`.
- Drafts surviving the app being killed; `flushSync` before navigating off guarded forms.

---

## 10. Missing, unnecessary or risky features

- **Missing and needed:** payment reversal (F-01).
- **Missing, nice-to-have:** estimate validity (F-03), seen-price on orders (§4c).
- **Unnecessary now:**
  - Realtime: don't build.
  - Multi-admin: not needed.
  - Reviews: correctly left out.
- **Risky if left:** direct table writes (F-05) — fine for a handful of trusted suppliers, worth closing before scale.

---

## 11. Manual tests on a real Android phone

1. Open the order link, leave it 10 min, change a rate on the supplier phone, return and submit → note the price shown vs the estimate.
2. Delete a material (one never billed) while the customer's cart holds it → submit → what does the customer see? (Expected today: "sent", item missing.)
3. Receive payment in airplane mode mid-save → reconnect → tap Record again in the same dialog (expect one payment); then try closing and re-entering (expect a duplicate — F-07).
4. Customer push alerts on the status link, the khata link and `/me` (untested on a phone per notes).
5. Save → `/me` on the live site; add `/me` to the home screen (customer manifest).
6. The theme switch's smoothness, status-bar colours, and the Snapchat-style Profile header (not yet seen on a phone).
7. Long-press shortcuts after Chrome refreshes the manifest.
8. Hindi/Marathi on the order cart and the khata at 360px.

---

## 12. Tests I could not perform, and why

- **A signed-in supplier or admin click-through:** Claude cannot enter passwords. UI flows were traced in code, not driven.
- **The local Docker DB suite and pgbench storm:** not re-run (Docker start is unreliable here, and the audit stayed read-only). Results rely on code plus the project's recorded runs (502/502 at 037, later per-migration suites).
- **Proving F-05 by actually writing:** deliberately not done against live (it is production data). It is proven by the privilege query only.
- **Real phones, iOS, push delivery, the share sheet:** need a device.
- **Load/performance at scale:** data volume on live is tiny (~60 bills), so index adequacy is untested.
- **Backups and restore drill:** off by your instruction; not run.

---

## 13. Backup & recovery readiness (reassessed)

**Not ready for a paying supplier.** All three scheduled tasks are disabled (since ~2026-10-12), Supabase is on the Free tier (no managed backups or PITR), and it pauses after ~7 days idle. Before the first real supplier:
- **(a)** Re-enable the three tasks and run one verified backup plus a drill (with your approval).
- **(b)** Decide on Supabase Pro ($25/mo, 7-day daily backups) — the only fix for "everything depends on one laptop".

---

## A. Must fix before the first real supplier

1. **F-01** payment reversal plus a confirm line — needs your approval on the money rule.
2. **F-02** refuse deleted materials in `place_order`, and flag ₹0 lines on approval. Also tidy the 9 dangling live order lines (they are test data: approve, reject or leave — your call).
3. **Backups on, plus a drill; decide on Supabase Pro** (§13).
4. **Legal:** privacy, terms and the 045 compliance texts are marked DRAFT for CA/lawyer review.
5. **Vercel Hobby is non-commercial:** move to Pro (or another host) before charging suppliers.
6. **F-11** `npm audit fix` on a branch (cheap).

## B. Should improve later

- F-03 estimate age warning
- F-04 GST from the estimate on convert
- F-06 refresh on return
- F-07 retry wording
- F-05 direct-write guard
- F-08 revoke grant
- F-12 CSP
- F-14 accessibility
- SMTP and a custom domain when a supplier can't simply phone you

## C. Already implemented correctly — leave unchanged

See §9. In particular: don't add Realtime, don't loosen RLS, and don't move pricing to the browser.
