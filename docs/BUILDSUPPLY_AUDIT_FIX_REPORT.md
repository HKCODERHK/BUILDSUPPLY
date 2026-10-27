# BuildSupply — Audit Fix Report

**Date:** 2026-10-27 · **Branch:** `audit-fixes` (from `main` @ `9e953de`) · **Audit:** [BUILDSUPPLY_FULL_SYSTEM_AUDIT.md](BUILDSUPPLY_FULL_SYSTEM_AUDIT.md)

**Nothing was merged, deployed or applied to production.**
- No production row, setting, grant or login was changed.
- The backup tasks were left off.
- The only contact with production was read-only `select` queries: function hashes, data facts and grants.

**Every database change was tested on a throwaway local Supabase in Docker.**
- It was built from `schema.sql` + migrations 002→053.
- Its 232 functions, views, triggers and policies hash-match live exactly (checked before any change).

## Summary

| ID | Finding | Status |
|---|---|---|
| F-01 | No way to correct a mistyped payment | **Fixed** |
| F-02 | Deleted material silently dropped from an order; ₹0 line on approval | **Fixed** |
| F-03 | Estimates never expire | **Fixed** (new estimates; old ones keep no end date by design) |
| F-04 | Converting an estimate re-prices GST at today's rate | **Fixed** |
| F-05 | A supplier login can write money tables directly | **Fixed** |
| F-06 | No screen refreshes when the app returns | **Fixed** (customer pages, Dashboard, Orders, customer page) |
| F-07 | Payment re-entry after a timeout can duplicate | **Fixed** |
| F-08 | `expire_lapsed_subscriptions` executable by any login | **Fixed** |
| F-09 | `send-push` unauthenticated | **Not changed — by design** (see below) |
| F-10 | `supplier-apply` platform cap can be exhausted | **Fixed** (function change, needs deploy) |
| F-11 | Dependency advisories | **Fixed** (0 advisories) |
| F-12 | No Content-Security-Policy | **Fixed** (enforced CSP) |
| F-13 | No "Not interested" on an estimate | **Not changed — covered by F-03** |
| F-14 | Dialog accessibility; button contrast | **Partially fixed** (dialogs fixed; contrast is your brand decision) |
| F-15 | Suspension takes up to 15 minutes to bite | **Fixed** (for writes) |

## What's waiting for your approval

1. **Migration `052_audit_fixes.sql`** (paste first): F-01, F-02, F-03, F-04, F-08, F-15.
2. **Migration `053_money_write_guard.sql`** (paste second): F-05.
3. **Edge Function `supplier-apply`** redeploy: F-10.
4. **Merging `audit-fixes` into `main`**: the app side of everything, the CSP, and the dependency updates.

Exact steps are in [§ Deploying safely](#deploying-safely).

---

## Findings one by one

### F-01 · Correcting a payment entered by mistake — **Fixed**

- **Original finding:** receipts are permanent (024) and nothing could reverse one, so a ₹50,000 typo for ₹5,000 became a permanent ₹45,000 advance.

- **Root cause:** 024 made `payments` rows undeletable on purpose, but no correction path was ever built.

- **Fix:** a correction never edits or deletes anything.
  - `correct_payment(request_id, payment_id, reason, new_amount, new_mode)` adds a **reversal entry**: the same amount, negative, pointing at the wrong entry, with your reason.
  - When there is a right amount, it also adds a **corrected receipt** for it.
  - It releases the wrong entry's allocations, puts the right amount onto the same bills in the same order, and lets held advance move onto bills that owe again (the existing `_apply_advance` rule).
  - It runs under the customer's lock, needs a 3–200 character reason, uses the PIN gate if the shop has a PIN, and is idempotent by request id.
  - Because every total in the app adds payments up, these all come out right by themselves: the dashboard's "collected", the khata, statements, reports, `customer_balances` and `dashboard_totals`.
  - Two database guarantees stop a reversed entry from ever paying a bill: `_receipt_remaining` treats a reversed or reversal entry as holding no money, and the commit-time `_check_allocation` refuses it.
  - The customer gets **one** alert ("Shop corrected a payment entry · ₹50,000 → ₹5,000") and no second "received".

- **App changes:**
  - On Payments, every entry is tappable. The dialog offers "Wrong amount or mode" or "Entered by mistake — cancel it", plus a reason, and explains that the wrong entry stays on record.
  - Rows read "Correction · reason · −₹50,000" (red), "Corrected entry", and "Corrected" (struck through).
  - After taking a payment, "Entered the wrong amount? Correct it" opens that receipt's correction.
  - The khata link, the statement and the ledger PDF show the correction plainly.

- **Files:**
  - Migration: `052_audit_fixes.sql` §1 (new columns `payments.corrects_payment_id` and `correction_reason`, a sign check, two unique partial indexes, and re-issues of `_receipt_remaining`, `_check_allocation`, `_notify_payments` and `_notification_text`).
  - New: `PaymentCorrectionModal.tsx`.
  - Changed: `Payments.tsx`, `CustomerProfile.tsx`, `services/payments.ts`, `lib/customerLedger.ts`, `lib/customerLedgerPdf.ts`, `KhataPage.tsx`, `services/khata.ts`, `i18n.ts`.

- **Before → after:** no way to fix a typo → two taps, a reason and optionally the PIN, and the khata is right, with the history intact.

- **Financial impact:** totals change only through the new reversal rows. No existing row is touched by the migration.

- **Tests (all pass):**
  - **SQL suite (`supabase/tests/052_audit_fixes_test.sql`, checks 01–28):**
    - corrected to ₹5,000;
    - reversed outright;
    - an advance corrected after a later bill used it;
    - one half of a split payment reversed;
    - a payment on a cancelled bill reversed;
    - double submit returns the first result;
    - "already corrected" and "a correction can't be corrected";
    - reason required, same amount refused, negative refused;
    - another shop, the admin, a customer login and signed-out callers all refused;
    - the khata payload flags;
    - the backstops refuse money on a reversed entry.
  - **Race:** two sessions correcting the same payment at once → exactly one correction; the other is told "already corrected".
  - **Load:** pgbench storm of 12 concurrent sessions × 250 transactions mixing payments, corrections, bills with counter payments and deliveries → 3,000/3,000, **0 failures, 0 deadlocks**. After 567 corrections and 286 replacement receipts, every invariant held:
    - bills' paid = active allocations;
    - none paid past total;
    - no money on a reversed entry;
    - no negative advance;
    - dashboard collected = sum of entries.
  - **Browser (local stack, production CSP injected):** corrected ₹50,000 → ₹5,000 through the dialog. The list, the khata link, the statement and a real ledger PDF all show the correction.

- **Remaining risk:** none known. A correction can itself be corrected later (it's an ordinary receipt).

### F-02 · Deleted materials in orders — **Fixed**

- **Original finding:**
  - `place_order` silently dropped a material that no longer existed.
  - The customer's "sent" screen still listed it.
  - Approving such an order priced the line at ₹0.
  - 9 such lines sit in open orders on live.

- **Root cause:** an inner join that filtered unknown ids instead of refusing them, and a `rate: mat ? … : 0` default in the estimate screen.

- **Fix (database, `place_order`):** the order is refused, with a clear message, when:
  - an item can't be read;
  - a material is no longer this shop's;
  - a quantity is over 1,00,000.

  Nothing is dropped any more. Each line now also keeps `listed_price`, the price the shop showed at the time. It is for the shop's information only and is never used to price anything.

- **Fix (app):**
  - When the order page hears "no longer sold" or "not available", it re-reads the shop's list, takes those items out of the cart, and says which.
  - On the estimate screen, a line whose material was removed comes in flagged "No longer in your materials — enter a rate or remove this line", and **Save is blocked** until it has a rate.
  - A line whose rate moved since the customer ordered shows "The customer ordered when it was ₹380".
  - The order screen marks such lines.
  - Removing a vehicle option now also checks open orders: if one names it, it is switched off instead of deleted.

- **Files:**
  - Migration: `052` §2.
  - App: `OrderPage.tsx`, `services/orders.ts`, new `lib/orderPageDiff.ts` (+ test), `NewQuotation.tsx`, `OrderDetail.tsx`, `services/materials.ts`, `i18n.ts`.

- **Existing production data:** the 9 dangling order lines are **not changed**. When the shop opens one of those orders, the estimate screen flags each line and won't save it at ₹0. Rejecting or approving them stays your call.

- **Tests:**
  - SQL checks 30–33: unknown material, unreadable quantity, oversized quantity and switched-off material are all refused, and nothing is kept.
  - `050` suite: 33/33 (one message check widened to accept the new, clearer refusal).
  - Browser: the shop deleted "River Sand" while it sat in a customer's cart; sending was refused, the cart dropped it, and the page said so. An order naming the deleted "Old Brick" opened with the line flagged and Save blocked until a rate was entered.

### F-03 · Estimate expiry — **Fixed**

- **Original finding:** nothing ever expired, so a customer could accept a months-old estimate and the shop could bill it at old rates without a word.

- **Fix:**
  - `quotations.valid_until`. **New** estimates get today + 15 days by default; the shop can change or clear it on the New Estimate screen.
  - **Existing estimates keep no date and never expire.** The column was added without a default first, so nothing already sent changes.
  - One rule decides expiry, in both the database (`_estimate_expired`) and the app (`lib/estimateValidity.ts`): open, past its date, and **not accepted in time**. An estimate accepted before its date stays agreed.
  - The customer's status link refuses **Accept** on an expired estimate but keeps "Please call me". It shows "This estimate was valid until …", and no longer offers the total by UPI.
  - The khata link lists it as Expired.
  - The estimate PDF prints "Valid until …".
  - On the shop's side:
    - the estimate shows its date, or "Expired — it was valid until …" with **Give it 15 more days**;
    - billing an expired estimate, or one 15+ days old, first warns "made N days ago, rates may have changed";
    - the list marks expired estimates and sends old ones to their own page for that warning.

- **Files:**
  - Migration: `052` §3 (the column, `_estimate_expired`, and re-issues of `respond_to_estimate`, `order_status`, `customer_khata` and `khata_document`, each = previous version + the new fields).
  - App: `lib/estimateValidity.ts`, `NewQuotation.tsx`, `QuotationDetail.tsx`, `Quotations.tsx`, `OrderStatus.tsx`, `KhataPage.tsx`, `lib/quotationPdf.ts`, `services/quotations.ts`, `services/orders.ts`, `services/khata.ts`.

- **Tests:**
  - SQL checks 40–47.
  - Browser:
    - the expired estimate's link showed no Accept and only "Please call me";
    - the shop saw "Expired — valid until 26 Oct" and the warning before billing;
    - Extend set 11 Nov;
    - the bill was made only after "Make the bill at these rates";
    - the PDF printed "Valid until 11 Nov 2026".

- **Owner decision:** 15 days is my default. Change `ESTIMATE_VALID_DAYS` in `lib/estimateValidity.ts` and the default in 052 together if you want another number.

### F-04 · GST on estimate → bill — **Fixed**

- **Root cause:** `create_invoice` priced every line with `_price_items`, which reads the material's GST today.

- **Fix:**
  - When a bill is made from an estimate, each bill line is matched to the estimate line with the same material, quantity and rate (in any order). It takes the estimate's GST percentage.
  - A line the shop changed is taxed as a new line.
  - Estimates saved before 035 (one 18% on the whole estimate) become a bill with **exactly** the estimate's GST figure, so even ₹1 of rounding can't differ.
  - Bills not made from an estimate are unchanged.

- **Files:** `052` §4 (`_price_items_from_estimate`, `_is_legacy_estimate_copy`, `create_invoice` re-issued).

- **Tests:** SQL checks 50–53.
  - The estimate is at 18%, then cement moves to 28%, and the bill still charges 18% (₹820 = the estimate's), whatever the line order.
  - A new bill does use 28%.
  - A changed line uses the current rate.
  - A pre-035 estimate's ₹1 GST is reproduced exactly.

### F-05 · Direct writes to money tables — **Fixed**

- **Fix:** a trigger on `invoices`, `invoice_items`, `payments`, `payment_allocations`, `quotations` and `quotation_items` refuses any write from the app's API roles that doesn't come from inside one of the app's own functions.
  - It tells the two apart by the call stack Postgres reports (`pg_context`): a direct API write is a statement on its own, while a write inside a function has more lines. This was verified empirically, including the CTE form PostgREST uses.
  - So **no money function had to change**, and they all still run as the signed-in supplier under row-level security.
  - The two direct writes the app makes are still allowed: adding and editing customers, and marking an estimate Sent (plus its valid-until date).
  - Payment and allocation deletes keep 024's quiet skip.
  - A customer with any bill, payment, estimate or order can't be deleted (it orphaned their bills); one added by mistake still can.
  - The SQL editor, the service role, cron, the customer-side functions and cascades (deleting a whole shop) are unaffected.

- **File:** `053_money_write_guard.sql`.

- **Tests:**
  - SQL checks 60–70: direct updates, deletes and inserts on every guarded table refused; the app's own writes allowed; existing functions, delivery, print options, bill edits and the customer's "received" all work; deleting a shop still cascades.
  - **Over the real REST API** with a supplier's token, each refused **403** with the plain message:
    - PATCH a bill's total;
    - DELETE a bill;
    - POST a payment;
    - PATCH a payment;
    - PATCH bill lines;
    - DELETE a customer with bills.

    The app's own `record_customer_payment` returned 200.
  - Browser:
    - the guard allowed payments, corrections, bill conversion, cancelling a bill, delivery (stock 200 → 175, logged), an opening balance and estimate Sent;
    - the admin screens load;
    - the admin's token still reads `[]` from invoices, payments, customers, allocations and estimates.

- **Remaining risk:** a future feature that writes these tables **directly** from the app will be refused. Write it as a database function. This is noted in CLAUDE.md.

### F-06 · Refresh on return — **Fixed**

- **Fix:** a small hook, `lib/useRefreshOnReturn.ts`, re-reads a screen's figures, quietly with no loader and without resetting anything typed, when:
  - the phone comes back to the app after 30 s or more;
  - the page is restored from the back/forward cache;
  - the network comes back.

  It is used on the order page, the khata link (and `/me` through it), the order status link, the Dashboard, Orders and the customer page. There is no polling and no realtime connection.

  On the order page, a changed price, delivery charge or removed material in the cart is named in a notice. Separately, the order page now sends what it showed, and if a price moved the database keeps nothing and answers `changed`, so a customer can never send an order against prices that changed since they looked.

- **Tests:**
  - Browser: Cement moved ₹380 → ₹400 behind an open page → sending was stopped with "Cement PPC: ₹380 → ₹400" and the new total, and the second tap sent it.
  - Steel moved ₹70 → ₹75 while the page was "in the background" → on return the notice and total updated, with nothing sent.
  - A ₹200 payment taken while a khata link sat in the background → on return the figure went ₹223 → ₹23.
  - Unit tests for the cart diff.

### F-07 · Duplicate payment after a timeout — **Fixed**

- **Fix (both Receive payment dialogs):**
  - A payment whose answer never came keeps its request id while the dialog says the same thing, even after closing and reopening. Re-entering it returns the first result instead of recording it twice.
  - "Not sure it was saved? Tap Record again — the same payment is never counted twice" appears only after a genuine network failure, not after a refusal.
  - The same amount from the same customer within 15 minutes asks once: "₹2,000 by Cash was already recorded for Ramesh Patil at 3:42 pm. Tap Record again only if this is a second payment." A genuine second payment is never blocked.

- **Tests (browser):**
  - a lost answer after the server saved ₹777 → closed, reopened, re-entered → warned → second tap → **exactly one** ₹777 in the database;
  - a genuine second ₹2,000 recorded after the deliberate second tap;
  - unit tests for when "not sure" shows.

### F-08 · `expire_lapsed_subscriptions` — **Fixed**

- **Fix:** `revoke execute … from authenticated`. The cron job runs as `postgres` (checked on live: all three jobs), and nothing in the app calls it (grep).
- **Tests:** SQL check 80; over REST the admin's token now gets "permission denied".

### F-09 · `send-push` callable by anyone — **Not changed (by design)**

- **Reason:** the function only sends notifications that are already due, once each (`claim_push_batch` is service-role only), and returns counts. A caller learns nothing and can't create or redirect an alert.
- **Why a secret wouldn't help:** the remaining risk is invocation-quota burn, and a shared secret would **not** reduce that. Supabase counts an invocation whether or not the function then rejects it.
- **Recommendation:** watch the Edge Function invocation chart.
- **Optional hardening, if you want it:** a private secret table plus a header check. Deploy order matters: migrate first, then set the secret, then redeploy.

### F-10 · Application flood — **Fixed (needs deploy)**

- **Fix:**
  - `supplier-apply` now allows **3 applications an hour from one internet address** and **30 platform-wide** (was 10 platform-wide only, which one script could use up).
  - The address is stored only as a keyed hash (HMAC with the function's service key), in the application's own audit row. It is never stored raw, and no new table is needed.
  - When busy, the Apply page now offers "Or message us on WhatsApp".
- **Tests (local edge runtime):**
  - same address: 200, 200, 200, **429**; another address: 200;
  - the refused one created no login;
  - the audit rows hold 32-character hashes and never the address.

### F-11 · Dependencies — **Fixed**

`npm audit fix` changed the lock file only: Vite 8.3.5, DOMPurify 3.4.17, source-map-js 1.2.2. **0 vulnerabilities.** The build, all PDFs and the QR codes tested fine afterwards.

### F-12 · Content-Security-Policy — **Fixed**

- **Fix:** an **enforced** CSP in `vercel.json`, mirrored with the other security headers into `public/_headers`, which never had them. The policy:
  - code only from this site (`script-src 'self'`; the bundle was checked for `eval` and `new Function`: none);
  - connections only to this Supabase project and the password-breach check;
  - pictures also from this project's storage;
  - no framing.
- **Tests:** the local production build ran with the identical policy (origins swapped to the local stack). Across sign-in, payments, corrections, orders, estimates, khata links, status links, admin screens, real ledger and estimate PDFs and QR codes there were **zero CSP violations**.
- **Remaining:** check the Vercel preview's console once, since that's the real header. **Rule for the future:** any new external resource (a font, analytics, a map embed) must be added to the CSP in both files.

### F-13 · No "Not interested" on an estimate — **Not changed (covered by F-03)**

- **Why:** the harm was estimates staying open forever; with F-03 they now expire.
- **What's left:** a "Not interested" button is a feature. The audit marked it "only if suppliers ask", and your rules say not to build parked features unasked.

### F-14 · Accessibility — **Partially fixed**

- **Fixed:** every dialog (`components/ui/modal.tsx`):
  - is `role="dialog"` with `aria-modal` and labelled by its title;
  - has a close button that can't submit a form;
  - moves focus inside when it opens, unless a field there already took it;
  - keeps Tab inside the top dialog only, so stacked PIN prompts still work;
  - returns focus to the button that opened it, never to a text field, so a phone keyboard won't pop up.
  - The image preview gets the same Tab and Escape handling.
- **Tests (browser):** Tab wraps both ways, Escape closes, focus returns to the opener, attributes present.
- **Owner decision:** the primary button's contrast is 4.41 against WCAG's 4.5. Darkening `--color-accent` from #198a45 to #147a3a fixes it but changes the brand green, so I left it (CLAUDE.md already records it as your call).
- **Unchanged by request:** pinch-zoom stays off.

### F-15 · Suspension delay — **Fixed (for writes)**

- **Finding while testing:** the app **already** shows "Your account is suspended" on a fresh load. The 15-minute window was an already-open screen or a direct API call.
- **Fix:** `_require_supplier()`, the first line of every function that records a bill, payment, estimate, delivery or stock change, now also asks for an **active shop login**.
  - A suspended shop gets "This account is paused. Please contact BuildSupply." at once.
  - A customer's, applicant's or the admin's login gets "Only a shop's own login can do this."
  - It is one helper re-issued, so no money function changed.
- **Tests:**
  - SQL checks 90–93.
  - Browser: a screen opened while active, then the shop suspended → recording a payment refused with that message, nothing saved; reactivated → works again.
- **Remaining:** reads (and direct customer/material edits) stay possible for up to 15 minutes on an open session. That is the shop's own data, and the login ban still ends the session.

---

## Bugs found by my own testing (and fixed)

1. **Statement marked every payment "corrected later" on the khata link.** Its rows carry no ids, so my lookup matched `undefined`. Fixed in `lib/customerLedger.ts`, with unit tests for both row shapes.
2. **"Not sure it was saved?" appeared after a definite refusal.** It now shows only for a lost answer (`mayHaveBeenSaved`).
3. **The write guard's first draft** raised "record new has no field status" on non-estimate tables. Writes were still refused, but with the wrong message. Fixed by nesting the check.
4. **`_is_legacy_estimate_copy` ordered by a constant.** Fixed to order by the value; caught by check 53.

## Branch and commits

`audit-fixes` (pushed for review — see the final note for the preview link):

| Commit | What |
|---|---|
| `9dfd5ef` | Database: migrations 052, 053, the test suite, the audit report |
| `bcebed0` | App: corrections, duplicate guard, order re-checks, estimate validity, refresh on return |
| `d4b975a` | Apply limit per address, dependency advisories, CSP, dialog accessibility |
| `4dac4ec` | Two bugs the browser run found; 051's tests scoped to their own shop |
| (last) | This report and the CLAUDE.md notes |

Every commit is authored by HKCODERHK, with no Claude trailer (checked).

## Results

| Check | Result |
|---|---|
| Type-check (`tsc -b`) | 0 errors |
| Lint | 0 errors, 13 warnings (was 14; none new) |
| Unit tests (Vitest) | 58/58 |
| Production build | OK |
| `npm audit` | 0 vulnerabilities |
| SQL suite 052 (new) | 72/72 |
| SQL suite 051 | 40/40 |
| SQL suite 050 | 33/33 |
| All three suites on one fresh database (002→053, in one run) | 145/145 |
| Migrations applied twice (idempotence) | 052 ✓, 053 ✓ |
| Concurrency storm (12 × 250) | 3,000/3,000, 0 failed, 0 deadlocks, all invariants hold |
| REST-level guard test | 6 direct writes → 403; app function → 200 |
| `supplier-apply` local | per-address limit and hashing as designed |
| Browser at 360 px, EN / HI / MR | 0 sideways overflow on every changed screen; all new strings translated |
| CSP violations in the browser run | 0 |

## Regression coverage

| Area | Checked in the browser (local stack) |
|---|---|
| **Supplier** | Payments list and correction; Receive payment (normal, duplicate warning, lost answer); estimate from an order; estimate validity, Extend, convert warning, bill made; bill cancelled; delivery and stock log; opening balance (SQL); customer page refresh |
| **Customer** | Order page: cart, price-change refusal, removed material, refresh on return, order sent with listed prices. Khata link: payments, statement, estimates, refresh on return. Status link: expired estimate |
| **Admin** | Dashboard, supplier list, compliance, catalog and settings load with no console errors; the admin's token still can't read any shop's money tables; the new correction function refuses the admin |

**Not individually re-tested:** each of the 37 earlier customer UX fixes. The screens they live on were exercised, and the 360 px sweep in three languages passed, but not item by item.

## Production data that may need your review

- **9 open order lines name materials deleted on 2026-10-21.** Nothing changes them. When the shop opens one, the estimate screen now flags each line and won't save it at ₹0. Approve or reject them as you see fit.
- **6 open estimates have no valid-until date** and will never expire. Billing one that is 15+ days old shows the age warning. If you want them to expire, give them a date. That is a data change, so it needs your OK.
- **No existing payment, bill, estimate or order is changed by either migration.**

## Compatibility and rollback

- **Old app on the new database:** works. It never sends the new fields or calls the new functions, and its only direct money write (estimate → Sent) is allowed.
- **New app on the old database:** works too, which matters because Vercel previews talk to live.
  - Corrections hide themselves (the rows lack the column).
  - The order page's extra fields are ignored.
  - Estimate dates simply don't save.
  - The age warning still works.
- **Rolling back the app:** Vercel → Deployments → previous build → Instant Rollback.
- **Rolling back 053** (safe at any time):
  ```sql
  drop trigger if exists invoices_money_guard on public.invoices;
  drop trigger if exists invoice_items_money_guard on public.invoice_items;
  drop trigger if exists payments_money_guard on public.payments;
  drop trigger if exists payment_allocations_money_guard on public.payment_allocations;
  drop trigger if exists quotations_money_guard on public.quotations;
  drop trigger if exists quotation_items_money_guard on public.quotation_items;
  drop trigger if exists customers_delete_guard on public.customers;
  drop function if exists public.money_write_guard();
  drop function if exists public.customers_delete_guard();
  ```
- **Rolling back 052 is not recommended once a correction exists.** The old `_receipt_remaining` would treat a reversed receipt as spendable again.
  - If one piece misbehaves, re-paste just that function's previous version from its earlier migration.
  - Those versions are: `place_order` from 050; `order_status` and `customer_khata` from 047; `khata_document` from 043; `respond_to_estimate` from 030; `create_invoice` from 035; `_require_supplier` from 024.
  - The new columns are harmless left in place.

## Deploying safely

1. **Backups first.** The three backup tasks are off by your choice. Before any production migration, either re-enable them and take one verified backup, or take a manual one. Supabase's own daily backups need Pro.
2. **Paste `052_audit_fixes.sql`** in the SQL editor, at `https://supabase.com/dashboard/project/pefarymejlfdsmwusbbq/sql/new` (project-scoped link). It runs in one transaction. Then check read-only:
   ```sql
   select count(*) from pg_proc where proname in ('correct_payment','_estimate_expired','_price_items_from_estimate','_is_legacy_estimate_copy');  -- 4
   select has_function_privilege('authenticated','public.expire_lapsed_subscriptions()','execute');  -- false
   select count(*) from public.quotations where valid_until is not null;  -- 0 (nothing existing got a date)
   select count(*) from public.payments where amount <= 0;  -- 0
   ```
3. **Paste `053_money_write_guard.sql`.** Then check:
   ```sql
   select count(*) from pg_trigger where tgname like '%money_guard' or tgname = 'customers_delete_guard';  -- 7
   ```
4. **Deploy the apply function:**
   ```bash
   npx supabase functions deploy supplier-apply --project-ref pefarymejlfdsmwusbbq --use-api --no-verify-jwt
   ```
5. **Review the Vercel preview of `audit-fixes` on your phone.** Open the console once for CSP errors, then:
   - make a bill and take a payment;
   - correct it;
   - open the order link and send an order;
   - open a khata link;
   - make and share an estimate PDF;
   - upload a logo.
6. **Merge** to `main` with `--no-ff`. Vercel deploys. Check the live asset hash matches the build.
7. **After the merge:** delete the branch (local and GitHub), run the Claude-trailer check, and re-run `scripts/backup/install-backup.ps1 -NoTasks` whenever backups are back on, so the drill builds 052 and 053.

## Intentionally left unchanged

- **F-09 push secret:** wouldn't reduce the real risk (see above).
- **F-13 "Not interested":** a feature; F-03 already closes the gap.
- **Button contrast:** your brand decision.
- **Pinch-zoom:** off, at your request.
- **Supabase Realtime and polling:** not needed. Prices are indicative and the database re-checks at send time.
- **The 9 dangling order lines and 6 dateless estimates:** production data, not touched.
- **The backup system:** off, as you asked. No backup or drill was run.

## Not tested, and why

- **A real Android phone or iPhone.** None is connected here. The share sheet, push alerts and the installed app's CSP behaviour need your phone.
- **The real Vercel CSP header.** It was tested as an identical meta-tag policy on a local production build. The preview is the first real test.
- **Production migrations.** Not applied, by your rules.
- **`supplier-apply` on Supabase's own edge.** Tested on the local edge runtime. Whether `cf-connecting-ip` reaches Edge Functions (as it does PostgREST) is unconfirmed; if not, the first `X-Forwarded-For` entry is used.
