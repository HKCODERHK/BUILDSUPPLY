-- 024: money integrity.
--
-- Everything that moves money or stock now happens inside the database, in
-- one step, instead of as several separate writes from the phone.
--
-- RECEIPTS ARE PERMANENT. `payments` is the record of money received: once
-- written, the app never edits or deletes a row. Which bills a receipt paid
-- is recorded separately, in `payment_allocations`, and an allocation that no
-- longer applies (its bill was cancelled, an opening balance changed) is
-- marked released, never deleted. Every rupee can be traced from the day it
-- came in to the bills it ended up on. The database enforces this itself: a
-- delete from any app, old or new, is skipped (section 3).
--
-- ADVANCE is the part of a receipt not allocated to any bill. Money beyond
-- what a customer owes is kept as advance instead of refused, and their next
-- bill uses it up automatically. Money on a cancelled bill goes back to being
-- advance; it is never removed. An advance recorded as such (the customer
-- page's "Receive advance", payments.is_advance) is kept for the customer's
-- NEXT bill: it is used only on bills raised after it, never on dues they
-- already had.
--
-- ONE STEP, UNDER A LOCK ON THE CUSTOMER: taking a payment, creating,
-- editing, cancelling and delivering a bill, estimates, stock and the opening
-- balance. Every save carries a request id, so a double tap, a retry or a
-- second phone can't record anything twice, and nothing is worked out from a
-- stale balance. (INV-1024 in Shree Balaji's account: two Rs.830 payments 31
-- seconds apart, both calculated from the same balance.)
--
-- Bill and estimate numbers are handed out under a lock and can never repeat.
--
-- A customer's old udhaar is an OPENING BALANCE: an invoices row with
-- kind = 'opening'. It counts in the khata and is paid first, but it is not
-- sales. Changing it replaces the row, so the old figure stays on record.
--
-- Every function is SECURITY INVOKER: row-level security still decides what
-- each supplier can touch, exactly as it does for plain queries.
--
-- SAFE WITH THE APP SUPPLIERS ARE RUNNING TODAY. Nothing it reads changes
-- shape, and triggers keep what it writes consistent with the new tables
-- until the new app is deployed — including its Cancel, which deleted the
-- bill's payments: that delete is now skipped and the money kept as advance.
--
-- EXISTING DATA. Every live bill's allocations are rebuilt from its payments,
-- oldest first, capped at the bill's total, and checked against the bill's
-- paid amount before anything is committed; if any bill disagrees, the whole
-- migration stops and nothing changes. The one payment that does not fit is
-- INV-1024's second Rs.830, which becomes that customer's advance.

begin;

-- ── 1. Columns ──────────────────────────────────────────────────────────

alter table public.invoices add column if not exists kind text not null default 'bill';
alter table public.invoices drop constraint if exists invoices_kind_check;
alter table public.invoices add constraint invoices_kind_check check (kind in ('bill', 'opening'));

-- A receipt belongs to a customer. invoice_id stays only for rows written
-- before this migration (and by the old app); what a receipt paid now lives
-- in payment_allocations.
alter table public.payments add column if not exists customer_id uuid references public.customers (id) on delete set null;
update public.payments p set customer_id = i.customer_id
  from public.invoices i
 where i.id = p.invoice_id and p.customer_id is null;
alter table public.payments alter column invoice_id drop not null;

-- Handed over for the customer's NEXT bill ("Receive advance"). Kept apart
-- from what they already owe: only ever used on bills raised after it.
alter table public.payments add column if not exists is_advance boolean not null default false;

create index if not exists payments_customer_idx on public.payments (customer_id, created_at);
create index if not exists invoices_customer_created_idx on public.invoices (customer_id, created_at);

-- ── 2. Which bills each receipt paid ────────────────────────────────────
-- Deliberately NO unique (payment_id, invoice_id): with one, PostgREST would
-- treat this table as a many-to-many link between payments and invoices, and
-- the old app's `payments -> invoices(...)` embed would become ambiguous.

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  payment_id uuid not null references public.payments (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now(),
  released_at timestamptz,
  released_reason text
);
create index if not exists payment_allocations_invoice_idx on public.payment_allocations (invoice_id) where released_at is null;
create index if not exists payment_allocations_payment_idx on public.payment_allocations (payment_id) where released_at is null;

alter table public.payment_allocations enable row level security;
drop policy if exists payment_allocations_tenant_isolation on public.payment_allocations;
create policy payment_allocations_tenant_isolation on public.payment_allocations
  for all using (supplier_id = auth.uid()) with check (supplier_id = auth.uid());

-- Existing payments: each live bill's, oldest first, up to the bill's total.
insert into public.payment_allocations (supplier_id, payment_id, invoice_id, amount, created_at)
select x.supplier_id, x.payment_id, x.invoice_id, x.alloc, x.created_at
  from (
    select p.supplier_id,
           p.id as payment_id,
           p.invoice_id,
           p.created_at,
           least(p.amount,
                 greatest(0, i.total - (sum(p.amount) over (partition by p.invoice_id order by p.created_at, p.id) - p.amount))) as alloc
      from public.payments p
      join public.invoices i on i.id = p.invoice_id
     where i.status <> 'Cancelled'
  ) x
 where x.alloc > 0
   and not exists (select 1 from public.payment_allocations a where a.payment_id = x.payment_id);

do $check$
begin
  if exists (
    select 1
      from public.invoices i
     where i.status <> 'Cancelled'
       and abs(i.paid - coalesce((select sum(a.amount) from public.payment_allocations a
                                   where a.invoice_id = i.id and a.released_at is null), 0)) > 0.005
  ) then
    raise exception 'Stopped: a bill''s paid amount does not match its payments. Nothing was changed.';
  end if;
end
$check$;

-- ── 3. The app running today ────────────────────────────────────────────
-- It inserts payments with invoice_id and no customer_id, and updates the
-- bill's paid amount itself. These two triggers fill in the rest.

create or replace function public.payments_fill_customer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.customer_id is null and new.invoice_id is not null then
    select customer_id into new.customer_id from public.invoices where id = new.invoice_id;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_fill_customer on public.payments;
create trigger payments_fill_customer
  before insert on public.payments
  for each row execute function public.payments_fill_customer();

create or replace function public.payments_legacy_allocation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Receipts written by the new functions carry no invoice_id; only the old
  -- app's do, and theirs are already capped at what the bill owed.
  if new.invoice_id is not null then
    insert into public.payment_allocations (supplier_id, payment_id, invoice_id, amount, created_at)
    values (new.supplier_id, new.id, new.invoice_id, new.amount, new.created_at);
  end if;
  return null;
end;
$$;

drop trigger if exists payments_legacy_allocation on public.payments;
create trigger payments_legacy_allocation
  after insert on public.payments
  for each row execute function public.payments_legacy_allocation();

-- Receipts and allocations are never deleted. The app running today deletes
-- a bill's payments when it cancels the bill (and a phone can keep that
-- version cached after the new one ships), so a delete is quietly skipped
-- rather than refused: that app carries on as if it worked, and the money
-- stays, released to advance by the trigger below. Only a cascade still
-- removes rows — the admin deleting a whole supplier account. Deleting one
-- by hand in the Table Editor does nothing either, on purpose.
create or replace function public.keep_money_rows()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists payments_keep on public.payments;
create trigger payments_keep
  before delete on public.payments
  for each row execute function public.keep_money_rows();

drop trigger if exists payment_allocations_keep on public.payment_allocations;
create trigger payment_allocations_keep
  before delete on public.payment_allocations
  for each row execute function public.keep_money_rows();

-- However a bill is cancelled — the new app, the old one, or by hand — the
-- money on it goes back to its receipts as advance.
create or replace function public.invoices_release_on_cancel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'Cancelled' and old.status is distinct from 'Cancelled' then
    update public.payment_allocations
       set released_at = now(), released_reason = 'Bill cancelled'
     where invoice_id = new.id and released_at is null;
    new.paid := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_release_on_cancel on public.invoices;
create trigger invoices_release_on_cancel
  before update of status on public.invoices
  for each row execute function public.invoices_release_on_cancel();

-- The backstop, checked when each transaction commits: no bill paid past
-- its total, no receipt used for more than was received.
create or replace function public._check_allocation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_total numeric;
  v_on_bill numeric;
  v_received numeric;
  v_used numeric;
begin
  select total into v_total from public.invoices where id = new.invoice_id;
  select coalesce(sum(amount), 0) into v_on_bill
    from public.payment_allocations where invoice_id = new.invoice_id and released_at is null;
  if v_on_bill > v_total + 0.005 then
    raise exception 'A bill can''t be paid more than its total.';
  end if;

  select amount into v_received from public.payments where id = new.payment_id;
  select coalesce(sum(amount), 0) into v_used
    from public.payment_allocations where payment_id = new.payment_id and released_at is null;
  if v_used > v_received + 0.005 then
    raise exception 'A payment can''t be used for more than was received.';
  end if;
  return null;
end;
$$;

drop trigger if exists payment_allocations_check on public.payment_allocations;
create constraint trigger payment_allocations_check
  after insert or update on public.payment_allocations
  deferrable initially deferred
  for each row execute function public._check_allocation();

-- ── 4. Numbers can never repeat ─────────────────────────────────────────

create unique index if not exists invoices_bill_no_unique on public.invoices (supplier_id, invoice_no) where kind = 'bill';
create unique index if not exists quotations_quote_no_unique on public.quotations (supplier_id, quote_no);
-- One live opening balance per customer; replaced ones stay, cancelled.
create unique index if not exists invoices_one_opening_per_customer
  on public.invoices (customer_id) where kind = 'opening' and status <> 'Cancelled';

-- ── 5. One request, one result ──────────────────────────────────────────

create table if not exists public.client_requests (
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  id uuid not null,
  kind text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (supplier_id, id)
);
alter table public.client_requests enable row level security;
drop policy if exists client_requests_tenant_isolation on public.client_requests;
create policy client_requests_tenant_isolation on public.client_requests
  for all using (supplier_id = auth.uid()) with check (supplier_id = auth.uid());

-- ── 6. Helpers ──────────────────────────────────────────────────────────

create or replace function public._invoice_status(p_total numeric, p_paid numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_paid >= p_total then 'Paid' when p_paid > 0 then 'Partial' else 'Unpaid' end
$$;

create or replace function public._require_supplier()
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  return v;
end;
$$;

-- Every money change locks the customer first, so two changes to one
-- customer's khata run one after the other, never interleaved.
create or replace function public._lock_customer(p_customer_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_customer_id is null then
    return;
  end if;
  perform 1 from public.customers where id = p_customer_id for no key update;
  if not found then
    raise exception 'Customer not found.';
  end if;
end;
$$;

-- Stock rows are always locked in the same order, so two phones delivering
-- bills that share materials wait for each other instead of deadlocking.
--
-- Every row lock in this file is NO KEY UPDATE, never plain FOR UPDATE. It
-- still makes two changes to the same stock (or customer, or bill) take
-- turns, but it does not block the key-share lock Postgres takes on a row
-- that is merely *named* by a new bill line or payment. FOR UPDATE did: a
-- delivery holding the stock rows in id order and a bill being saved naming
-- them in line order waited on each other, and one was killed as a deadlock
-- (caught by the 20-phone test).
create or replace function public._lock_materials(p_ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
begin
  perform 1 from public.materials where id = any(p_ids) order by id for no key update;
end;
$$;

-- Null for a request never seen before (and now claimed); otherwise the
-- stored result of the first one, marked as a duplicate.
create or replace function public._claim_request(p_supplier uuid, p_request_id uuid, p_kind text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  prior jsonb;
begin
  if p_request_id is null then
    return null;
  end if;
  insert into public.client_requests (supplier_id, id, kind)
  values (p_supplier, p_request_id, p_kind)
  on conflict do nothing;
  if found then
    return null;
  end if;
  select result into prior from public.client_requests where supplier_id = p_supplier and id = p_request_id;
  return coalesce(prior, '{}'::jsonb) || jsonb_build_object('duplicate', true);
end;
$$;

create or replace function public._finish_request(p_supplier uuid, p_request_id uuid, p_result jsonb)
returns void
language sql
set search_path = public
as $$
  update public.client_requests set result = p_result where supplier_id = p_supplier and id = p_request_id
$$;

-- A bill's paid amount is always the sum of what is allocated to it.
create or replace function public._refresh_paid(p_invoice_id uuid)
returns void
language sql
set search_path = public
as $$
  update public.invoices i
     set paid = x.paid,
         status = case when i.status = 'Cancelled' then 'Cancelled' else public._invoice_status(i.total, x.paid) end
    from (select coalesce(sum(amount), 0) as paid
            from public.payment_allocations
           where invoice_id = p_invoice_id and released_at is null) x
   where i.id = p_invoice_id
$$;

-- What part of a receipt is not on any bill — the customer's advance.
create or replace function public._receipt_remaining(p_payment_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select p.amount - coalesce((select sum(a.amount) from public.payment_allocations a
                               where a.payment_id = p.id and a.released_at is null), 0)
    from public.payments p
   where p.id = p_payment_id
$$;

-- What the customer owes and holds in advance, straight after a change, so a
-- receipt never quotes a balance worked out from stale numbers. Keyed
-- 'advance_balance', not 'advance': results merge this in with ||, and a
-- payment's own 'advance' must not be overwritten.
create or replace function public._customer_position(p_customer_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'pending', coalesce((select sum(total - paid) from public.invoices
                          where customer_id = p_customer_id and status <> 'Cancelled'), 0),
    'advance_balance',
      coalesce((select sum(amount) from public.payments where customer_id = p_customer_id), 0)
      - coalesce((select sum(a.amount) from public.payment_allocations a
                    join public.payments p on p.id = a.payment_id
                   where p.customer_id = p_customer_id and a.released_at is null), 0))
$$;

-- Puts what is left of a receipt onto bills: the given bill first, then the
-- customer's opening balance, then their other open bills oldest first.
-- Whatever does not fit stays on the receipt as advance.
create or replace function public._allocate_receipt(
  p_supplier uuid,
  p_customer_id uuid,
  p_payment_id uuid,
  p_first_invoice uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  remaining numeric := public._receipt_remaining(p_payment_id);
  v_for_next_bill boolean;
  v_received_at timestamptz;
  bill record;
  take numeric;
  applied jsonb := '[]'::jsonb;
begin
  -- An advance for the next bill ("Receive advance") only goes onto bills
  -- raised after it came in — never onto older dues or an opening balance.
  select is_advance, created_at into v_for_next_bill, v_received_at
    from public.payments where id = p_payment_id;

  if p_first_invoice is not null and remaining > 0 then
    select id, invoice_no, total, paid into bill
      from public.invoices
     where id = p_first_invoice and status <> 'Cancelled'
       for no key update;
    if found and bill.paid < bill.total then
      take := least(bill.total - bill.paid, remaining);
      insert into public.payment_allocations (supplier_id, payment_id, invoice_id, amount)
      values (p_supplier, p_payment_id, bill.id, take);
      perform public._refresh_paid(bill.id);
      applied := applied || jsonb_build_array(jsonb_build_object('invoice_id', bill.id, 'invoice_no', bill.invoice_no, 'amount', take));
      remaining := remaining - take;
    end if;
  end if;

  if remaining > 0 and p_customer_id is not null then
    for bill in
      select id, invoice_no, total, paid
        from public.invoices
       where customer_id = p_customer_id and status <> 'Cancelled' and paid < total
         and (not v_for_next_bill or (kind = 'bill' and created_at > v_received_at))
       -- Old udhaar is older than any bill, whatever time it was typed in.
       order by (kind <> 'opening'), created_at, id
         for no key update
    loop
      take := least(bill.total - bill.paid, remaining);
      insert into public.payment_allocations (supplier_id, payment_id, invoice_id, amount)
      values (p_supplier, p_payment_id, bill.id, take);
      perform public._refresh_paid(bill.id);
      applied := applied || jsonb_build_array(jsonb_build_object('invoice_id', bill.id, 'invoice_no', bill.invoice_no, 'amount', take));
      remaining := remaining - take;
      exit when remaining <= 0;
    end loop;
  end if;

  return jsonb_build_object('applied', applied, 'unapplied', greatest(remaining, 0));
end;
$$;

-- Uses a customer's advance on their open bills, oldest receipt onto oldest
-- bill. Receipts themselves are never touched — only allocations are added.
create or replace function public._apply_advance(p_customer_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  r record;
  ignored jsonb;
begin
  if p_customer_id is null then
    return;
  end if;
  for r in
    select id, supplier_id from public.payments where customer_id = p_customer_id order by created_at, id
  loop
    exit when not exists (select 1 from public.invoices
                           where customer_id = p_customer_id and status <> 'Cancelled' and paid < total);
    if public._receipt_remaining(r.id) > 0 then
      ignored := public._allocate_receipt(r.supplier_id, p_customer_id, r.id, null);
    end if;
  end loop;
end;
$$;

-- Takes a bill's money off it without losing any: the allocations are
-- marked released, which puts that money back on its receipts as advance.
create or replace function public._release_allocations(p_invoice_id uuid, p_reason text)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  v numeric;
begin
  select coalesce(sum(amount), 0) into v
    from public.payment_allocations where invoice_id = p_invoice_id and released_at is null;
  update public.payment_allocations
     set released_at = now(), released_reason = p_reason
   where invoice_id = p_invoice_id and released_at is null;
  perform public._refresh_paid(p_invoice_id);
  return v;
end;
$$;

create or replace function public._check_items(p_items jsonb)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_subtotal numeric;
begin
  if not exists (select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
                  where coalesce((x->>'qty')::numeric, 0) > 0) then
    raise exception 'Add at least one item with a quantity.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x
              where coalesce((x->>'qty')::numeric, 0) < 0 or coalesce((x->>'rate')::numeric, 0) < 0) then
    raise exception 'Quantities and rates can''t be negative.';
  end if;
  select coalesce(sum((x->>'qty')::numeric * coalesce((x->>'rate')::numeric, 0)), 0) into v_subtotal
    from jsonb_array_elements(p_items) x
   where coalesce((x->>'qty')::numeric, 0) > 0;
  return v_subtotal;
end;
$$;

create or replace function public._insert_items(p_supplier uuid, p_invoice_id uuid, p_items jsonb)
returns void
language sql
set search_path = public
as $$
  insert into public.invoice_items (supplier_id, invoice_id, material_id, description, qty, rate, amount)
  select p_supplier,
         p_invoice_id,
         m.id,
         coalesce(e.x->>'description', ''),
         (e.x->>'qty')::numeric,
         coalesce((e.x->>'rate')::numeric, 0),
         (e.x->>'qty')::numeric * coalesce((e.x->>'rate')::numeric, 0)
    from jsonb_array_elements(p_items) with ordinality as e(x, ord)
    -- Only a material this supplier can see; anything else becomes a plain line.
    left join public.materials m on m.id = nullif(e.x->>'material_id', '')::uuid
   where coalesce((e.x->>'qty')::numeric, 0) > 0
   order by e.ord
$$;

-- ── 7. Payments ─────────────────────────────────────────────────────────

-- Money against one bill, possibly split across modes (Payments screen).
-- Each split is its own receipt, applied in order, so the modes stay true.
create or replace function public.record_payment(p_request_id uuid, p_invoice_id uuid, p_splits jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_prior jsonb;
  v_customer uuid;
  v_split jsonb;
  v_amount numeric;
  v_due numeric;
  v_receipt uuid;
  v_part jsonb;
  v_applied jsonb := '[]'::jsonb;
  v_advance numeric := 0;
  v_left numeric := 0;
  v_result jsonb;
begin
  v_prior := public._claim_request(v_supplier, p_request_id, 'payment');
  if v_prior is not null then
    return v_prior;
  end if;

  select customer_id into v_customer from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Bill not found.';
  end if;
  perform public._lock_customer(v_customer);
  perform 1 from public.invoices where id = p_invoice_id and status <> 'Cancelled' for no key update;
  if not found then
    raise exception 'This bill was cancelled, so it can''t take a payment.';
  end if;

  for v_split in select value from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) loop
    v_amount := coalesce((v_split->>'amount')::numeric, 0);
    continue when v_amount <= 0;
    if v_customer is null then
      -- Nobody to hold an advance for: take only what the bill still owes.
      select total - paid into v_due from public.invoices where id = p_invoice_id;
      v_left := v_left + greatest(v_amount - v_due, 0);
      v_amount := least(v_amount, v_due);
      continue when v_amount <= 0;
    end if;
    insert into public.payments (supplier_id, customer_id, amount, mode)
    values (v_supplier, v_customer, v_amount, coalesce(v_split->>'mode', 'Cash'))
    returning id into v_receipt;
    v_part := public._allocate_receipt(v_supplier, v_customer, v_receipt, p_invoice_id);
    v_applied := v_applied || (v_part->'applied');
    v_advance := v_advance + (v_part->>'unapplied')::numeric;
  end loop;

  v_result := jsonb_build_object('applied', v_applied, 'advance', v_advance, 'left_over', v_left)
              || public._customer_position(v_customer);
  perform public._finish_request(v_supplier, p_request_id, v_result);
  return v_result;
end;
$$;

-- Money handed over against the khata as a whole (customer screen), which
-- is how customers actually pay.
create or replace function public.record_customer_payment(p_request_id uuid, p_customer_id uuid, p_amount numeric, p_mode text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_prior jsonb;
  v_receipt uuid;
  v_part jsonb;
  v_result jsonb;
begin
  v_prior := public._claim_request(v_supplier, p_request_id, 'payment');
  if v_prior is not null then
    return v_prior;
  end if;
  if p_customer_id is null then
    raise exception 'Customer not found.';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Enter the amount received.';
  end if;

  perform public._lock_customer(p_customer_id);
  insert into public.payments (supplier_id, customer_id, amount, mode)
  values (v_supplier, p_customer_id, p_amount, coalesce(p_mode, 'Cash'))
  returning id into v_receipt;
  v_part := public._allocate_receipt(v_supplier, p_customer_id, v_receipt, null);

  v_result := jsonb_build_object('applied', v_part->'applied', 'advance', v_part->'unapplied', 'left_over', 0)
              || public._customer_position(p_customer_id);
  perform public._finish_request(v_supplier, p_request_id, v_result);
  return v_result;
end;
$$;

-- Money handed over for the customer's NEXT bill (customer page, "Receive
-- advance"). Kept apart from anything they already owe: nothing is
-- allocated now, and it goes only onto bills raised after it.
create or replace function public.record_advance(p_request_id uuid, p_customer_id uuid, p_amount numeric, p_mode text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_prior jsonb;
  v_result jsonb;
begin
  v_prior := public._claim_request(v_supplier, p_request_id, 'advance');
  if v_prior is not null then
    return v_prior;
  end if;
  if p_customer_id is null then
    raise exception 'Customer not found.';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Enter the amount received.';
  end if;

  perform public._lock_customer(p_customer_id);
  insert into public.payments (supplier_id, customer_id, amount, mode, is_advance)
  values (v_supplier, p_customer_id, p_amount, coalesce(p_mode, 'Cash'), true);

  v_result := jsonb_build_object('applied', '[]'::jsonb, 'advance', p_amount, 'left_over', 0)
              || public._customer_position(p_customer_id);
  perform public._finish_request(v_supplier, p_request_id, v_result);
  return v_result;
end;
$$;

-- ── 8. Bills ────────────────────────────────────────────────────────────

create or replace function public.create_invoice(
  p_request_id uuid,
  p_customer_id uuid,
  p_site text,
  p_items jsonb,
  p_gst boolean default false,
  p_transport numeric default 0,
  p_payments jsonb default null,
  p_quotation_id uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_prior jsonb;
  v_subtotal numeric;
  v_gst numeric;
  v_transport numeric := coalesce(p_transport, 0);
  v_total numeric;
  v_seq bigint;
  v_id uuid;
  v_split jsonb;
  v_amount numeric;
  v_receipt uuid;
  v_part jsonb;
  v_applied jsonb := '[]'::jsonb;
  v_advance numeric := 0;
  v_took boolean := false;
  v_payment jsonb := null;
  v_result jsonb;
begin
  v_prior := public._claim_request(v_supplier, p_request_id, 'invoice');
  if v_prior is not null then
    return v_prior;
  end if;
  if p_customer_id is null then
    raise exception 'Pick a customer for this bill.';
  end if;
  if v_transport < 0 then
    raise exception 'Transport and labour can''t be negative.';
  end if;

  perform public._lock_customer(p_customer_id);
  v_subtotal := public._check_items(p_items);
  v_gst := case when p_gst then round(v_subtotal * 0.18) else 0 end;
  v_total := v_subtotal + v_gst + v_transport;

  if p_quotation_id is not null then
    perform 1 from public.quotations where id = p_quotation_id and status in ('Draft', 'Sent') for no key update;
    if not found then
      raise exception 'This estimate was already turned into a bill.';
    end if;
  end if;

  -- One number at a time per supplier. Cancelled bills keep theirs, and any
  -- bill number that isn't INV-<digits> simply doesn't count.
  perform pg_advisory_xact_lock(hashtextextended('invoice_no:' || v_supplier::text, 0));
  select coalesce(max(substring(invoice_no from '^INV-(\d+)$')::bigint), 1000) + 1
    into v_seq
    from public.invoices
   where supplier_id = v_supplier and kind = 'bill';

  insert into public.invoices
    (supplier_id, invoice_no, customer_id, quotation_id, site, subtotal, gst_amount,
     transport_labour_charge, total, paid, status, kind)
  values
    (v_supplier, 'INV-' || v_seq, p_customer_id, p_quotation_id, nullif(btrim(coalesce(p_site, '')), ''),
     v_subtotal, v_gst, v_transport, v_total, 0, public._invoice_status(v_total, 0), 'bill')
  returning id into v_id;

  perform public._insert_items(v_supplier, v_id, p_items);

  if p_quotation_id is not null then
    update public.quotations set status = 'Converted', converted_invoice_id = v_id where id = p_quotation_id;
  end if;

  -- Advance already held goes onto the new bill before anything is collected.
  perform public._apply_advance(p_customer_id);

  -- Money taken at the counter: one receipt per mode (cash, and the rest by
  -- UPI), in the order given, each onto this bill first.
  for v_split in select value from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    v_amount := coalesce((v_split->>'amount')::numeric, 0);
    continue when v_amount <= 0;
    insert into public.payments (supplier_id, customer_id, amount, mode)
    values (v_supplier, p_customer_id, v_amount, coalesce(v_split->>'mode', 'Cash'))
    returning id into v_receipt;
    v_part := public._allocate_receipt(v_supplier, p_customer_id, v_receipt, v_id);
    v_applied := v_applied || (v_part->'applied');
    v_advance := v_advance + (v_part->>'unapplied')::numeric;
    v_took := true;
  end loop;
  if v_took then
    v_payment := jsonb_build_object('applied', v_applied, 'advance', v_advance, 'left_over', 0);
  end if;

  v_result := jsonb_build_object(
                'invoice', (select to_jsonb(i) from public.invoices i where i.id = v_id),
                'payment', v_payment)
              || public._customer_position(p_customer_id);
  perform public._finish_request(v_supplier, p_request_id, v_result);
  return v_result;
end;
$$;

-- Corrects a bill. Stock moves by one net amount per material, and only if
-- the goods already left; a total below what was already paid is refused.
create or replace function public.update_invoice(
  p_invoice_id uuid,
  p_site text,
  p_items jsonb,
  p_gst boolean default false,
  p_transport numeric default 0
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_inv public.invoices%rowtype;
  v_customer uuid;
  v_subtotal numeric;
  v_gst numeric;
  v_transport numeric := coalesce(p_transport, 0);
  v_total numeric;
begin
  select customer_id into v_customer from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Bill not found.';
  end if;
  perform public._lock_customer(v_customer);
  select * into v_inv from public.invoices where id = p_invoice_id for no key update;
  if v_inv.status = 'Cancelled' then
    raise exception 'This bill was cancelled and can no longer be edited.';
  end if;
  if v_inv.kind <> 'bill' then
    raise exception 'Only a bill can be edited here.';
  end if;
  if v_transport < 0 then
    raise exception 'Transport and labour can''t be negative.';
  end if;

  v_subtotal := public._check_items(p_items);
  v_gst := case when p_gst then round(v_subtotal * 0.18) else 0 end;
  v_total := v_subtotal + v_gst + v_transport;

  if v_total < v_inv.paid then
    raise exception 'This customer has already paid Rs. % against this bill, so the new total can''t be lower than that. Cancel the bill instead if it is wrong.',
      to_char(v_inv.paid, 'FM99,99,99,999');
  end if;

  if v_inv.delivered then
    perform public._lock_materials(array(
      select material_id from public.invoice_items where invoice_id = p_invoice_id and material_id is not null
      union
      select mm.id from jsonb_array_elements(p_items) x join public.materials mm on mm.id = nullif(x->>'material_id', '')::uuid));
    update public.materials m
       set stock_qty = greatest(0, m.stock_qty + d.delta)
      from (
        select material_id, sum(delta) as delta
          from (
            select material_id, qty as delta
              from public.invoice_items
             where invoice_id = p_invoice_id and material_id is not null
            union all
            select mm.id, -(x->>'qty')::numeric
              from jsonb_array_elements(p_items) x
              join public.materials mm on mm.id = nullif(x->>'material_id', '')::uuid
             where coalesce((x->>'qty')::numeric, 0) > 0
          ) s
         group by material_id
      ) d
     where m.id = d.material_id and d.delta <> 0;
  end if;

  delete from public.invoice_items where invoice_id = p_invoice_id;
  perform public._insert_items(v_inv.supplier_id, p_invoice_id, p_items);

  update public.invoices
     set site = nullif(btrim(coalesce(p_site, '')), ''),
         subtotal = v_subtotal,
         gst_amount = v_gst,
         transport_labour_charge = v_transport,
         total = v_total,
         status = public._invoice_status(v_total, paid)
   where id = p_invoice_id;

  -- A bigger bill can use advance the customer already holds.
  perform public._apply_advance(v_customer);

  return (select to_jsonb(i) from public.invoices i where i.id = p_invoice_id);
end;
$$;

-- Takes the stock for a bill once the goods leave. A second call — a double
-- tap, or two phones at once — finds it already delivered and changes nothing.
create or replace function public.mark_invoice_delivered(p_invoice_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
begin
  update public.invoices
     set delivered = true
   where id = p_invoice_id and delivered = false and status <> 'Cancelled' and kind = 'bill';
  if not found then
    return false;
  end if;

  perform public._lock_materials(array(
    select material_id from public.invoice_items where invoice_id = p_invoice_id and material_id is not null));
  update public.materials m
     set stock_qty = greatest(0, m.stock_qty - q.qty)
    from (select material_id, sum(qty) as qty
            from public.invoice_items
           where invoice_id = p_invoice_id and material_id is not null
           group by material_id) q
   where m.id = q.material_id;
  return true;
end;
$$;

-- Voids a bill entered by mistake. The money taken on it is real, so it is
-- kept: it goes back to being the customer's advance (their other unpaid
-- bills use it first), and the record of where it was stays.
create or replace function public.cancel_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_inv public.invoices%rowtype;
  v_customer uuid;
  v_kept numeric;
begin
  select customer_id into v_customer from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Bill not found.';
  end if;
  perform public._lock_customer(v_customer);
  select * into v_inv from public.invoices
   where id = p_invoice_id and status <> 'Cancelled' and kind = 'bill'
     for no key update;
  if not found then
    return jsonb_build_object('already', true);
  end if;

  if v_inv.delivered then
    perform public._lock_materials(array(
      select material_id from public.invoice_items where invoice_id = p_invoice_id and material_id is not null));
    update public.materials m
       set stock_qty = m.stock_qty + q.qty
      from (select material_id, sum(qty) as qty
              from public.invoice_items
             where invoice_id = p_invoice_id and material_id is not null
             group by material_id) q
     where m.id = q.material_id;
  end if;

  v_kept := public._release_allocations(p_invoice_id, 'Bill cancelled');
  update public.invoices set status = 'Cancelled', paid = 0 where id = p_invoice_id;
  perform public._apply_advance(v_customer);

  return jsonb_build_object('kept', v_kept) || public._customer_position(v_customer);
end;
$$;

-- ── 9. Stock, estimates, opening balance ────────────────────────────────

-- One statement, so two top-ups at the same moment both count.
create or replace function public.adjust_stock(p_material_id uuid, p_delta numeric)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_qty numeric;
begin
  update public.materials
     set stock_qty = greatest(0, stock_qty + coalesce(p_delta, 0))
   where id = p_material_id
  returning stock_qty into v_qty;
  if not found then
    raise exception 'Material not found.';
  end if;
  return v_qty;
end;
$$;

create or replace function public.create_quotation(
  p_request_id uuid,
  p_customer_id uuid,
  p_site text,
  p_items jsonb,
  p_gst boolean default false,
  p_transport numeric default 0
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_prior jsonb;
  v_subtotal numeric;
  v_gst numeric;
  v_transport numeric := coalesce(p_transport, 0);
  v_total numeric;
  v_seq bigint;
  v_id uuid;
  v_result jsonb;
begin
  v_prior := public._claim_request(v_supplier, p_request_id, 'quotation');
  if v_prior is not null then
    return v_prior;
  end if;
  if p_customer_id is null then
    raise exception 'Pick a customer for this estimate.';
  end if;
  perform 1 from public.customers where id = p_customer_id;
  if not found then
    raise exception 'Customer not found.';
  end if;
  if v_transport < 0 then
    raise exception 'Transport and labour can''t be negative.';
  end if;

  v_subtotal := public._check_items(p_items);
  v_gst := case when p_gst then round(v_subtotal * 0.18) else 0 end;
  v_total := v_subtotal + v_gst + v_transport;

  perform pg_advisory_xact_lock(hashtextextended('quote_no:' || v_supplier::text, 0));
  select coalesce(max(substring(quote_no from '^QT-(\d+)$')::bigint), 1000) + 1
    into v_seq
    from public.quotations
   where supplier_id = v_supplier;

  insert into public.quotations (supplier_id, quote_no, customer_id, site, subtotal, gst_amount, transport_labour_charge, total)
  values (v_supplier, 'QT-' || v_seq, p_customer_id, nullif(btrim(coalesce(p_site, '')), ''), v_subtotal, v_gst, v_transport, v_total)
  returning id into v_id;

  insert into public.quotation_items (supplier_id, quotation_id, material_id, description, qty, rate, amount)
  select v_supplier,
         v_id,
         m.id,
         coalesce(e.x->>'description', ''),
         (e.x->>'qty')::numeric,
         coalesce((e.x->>'rate')::numeric, 0),
         (e.x->>'qty')::numeric * coalesce((e.x->>'rate')::numeric, 0)
    from jsonb_array_elements(p_items) with ordinality as e(x, ord)
    left join public.materials m on m.id = nullif(e.x->>'material_id', '')::uuid
   where coalesce((e.x->>'qty')::numeric, 0) > 0
   order by e.ord;

  v_result := (select to_jsonb(q) from public.quotations q where q.id = v_id);
  perform public._finish_request(v_supplier, p_request_id, v_result);
  return v_result;
end;
$$;

-- Sets, changes or (with 0) removes what a customer already owed before
-- BuildSupply. A change never overwrites: the old row is cancelled, its
-- money goes back to advance, and a new row takes its place, so the old
-- figure stays on record. `p_as_of` is optional; without it a change keeps
-- the date the balance already had, and a new one is dated now.
create or replace function public.set_opening_balance(p_customer_id uuid, p_amount numeric, p_as_of date default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_row public.invoices%rowtype;
  v_has boolean;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_at timestamptz;
begin
  if p_customer_id is null then
    raise exception 'Customer not found.';
  end if;
  if v_amount < 0 then
    raise exception 'An opening balance can''t be negative.';
  end if;
  perform public._lock_customer(p_customer_id);

  select * into v_row from public.invoices
   where customer_id = p_customer_id and kind = 'opening' and status <> 'Cancelled'
     for no key update;
  v_has := found;

  -- A chosen date is noon on that day in India, so it lands on that day
  -- whoever looks at it.
  v_at := case
            when p_as_of is not null then (p_as_of::timestamp + interval '12 hours') at time zone 'Asia/Kolkata'
            when v_has then v_row.created_at
            else now()
          end;

  if v_has then
    if v_row.total = v_amount and v_row.created_at = v_at then
      return jsonb_build_object('opening', to_jsonb(v_row)) || public._customer_position(p_customer_id);
    end if;
    perform public._release_allocations(v_row.id, 'Opening balance changed');
    update public.invoices set status = 'Cancelled', paid = 0 where id = v_row.id;
  end if;

  if v_amount > 0 then
    insert into public.invoices
      (supplier_id, invoice_no, customer_id, subtotal, gst_amount, transport_labour_charge,
       total, paid, status, kind, delivered, created_at)
    values
      (v_supplier, 'Opening balance', p_customer_id, v_amount, 0, 0,
       v_amount, 0, public._invoice_status(v_amount, 0), 'opening', true, v_at);
  end if;

  perform public._apply_advance(p_customer_id);

  return jsonb_build_object(
           'opening', (select to_jsonb(i) from public.invoices i
                        where i.customer_id = p_customer_id and i.kind = 'opening' and i.status <> 'Cancelled'))
         || public._customer_position(p_customer_id);
end;
$$;

-- ── 10. Totals ──────────────────────────────────────────────────────────
-- Same meaning as before for every existing row: sales and pending are
-- unchanged (there are no opening balances yet), and collected is every
-- rupee received, which equals the paid amounts today except for INV-1024's
-- extra Rs.830. security_invoker is spelled out AND re-asserted below: a
-- create or replace without it once let every supplier read every other
-- supplier's totals (migration 016, fixed by 017).

create or replace view public.customer_balances with (security_invoker = true) as
select c.id as customer_id,
       c.supplier_id,
       coalesce(sum(i.total) filter (where i.kind = 'bill'), 0::numeric) as sales,
       coalesce(sum(i.total), 0::numeric) - coalesce(sum(i.paid), 0::numeric) as pending,
       coalesce((select sum(p.amount) from public.payments p where p.customer_id = c.id), 0::numeric)
         - coalesce((select sum(a.amount)
                       from public.payment_allocations a
                       join public.payments p on p.id = a.payment_id
                      where p.customer_id = c.id and a.released_at is null), 0::numeric) as advance
  from public.customers c
  left join public.invoices i on i.customer_id = c.id and i.status <> 'Cancelled'
 group by c.id, c.supplier_id;

create or replace view public.dashboard_totals with (security_invoker = true) as
select i.supplier_id,
       coalesce(sum(i.total) filter (where i.kind = 'bill'), 0::numeric) as total_sales,
       coalesce((select sum(p.amount) from public.payments p where p.supplier_id = i.supplier_id), 0::numeric) as total_collected,
       coalesce(sum(i.total - i.paid), 0::numeric) as total_pending
  from public.invoices i
 where i.status <> 'Cancelled'
 group by i.supplier_id;

alter view public.customer_balances set (security_invoker = true);
alter view public.dashboard_totals set (security_invoker = true);

-- ── 11. Who may call what ───────────────────────────────────────────────

do $grants$
declare
  fn text;
begin
  foreach fn in array array[
    'public._invoice_status(numeric, numeric)',
    'public._require_supplier()',
    'public._lock_customer(uuid)',
    'public._lock_materials(uuid[])',
    'public._claim_request(uuid, uuid, text)',
    'public._finish_request(uuid, uuid, jsonb)',
    'public._refresh_paid(uuid)',
    'public._receipt_remaining(uuid)',
    'public._customer_position(uuid)',
    'public._allocate_receipt(uuid, uuid, uuid, uuid)',
    'public._apply_advance(uuid)',
    'public._release_allocations(uuid, text)',
    'public._check_items(jsonb)',
    'public._insert_items(uuid, uuid, jsonb)',
    'public._check_allocation()',
    'public.payments_fill_customer()',
    'public.payments_legacy_allocation()',
    'public.keep_money_rows()',
    'public.invoices_release_on_cancel()',
    'public.record_payment(uuid, uuid, jsonb)',
    'public.record_customer_payment(uuid, uuid, numeric, text)',
    'public.record_advance(uuid, uuid, numeric, text)',
    'public.create_invoice(uuid, uuid, text, jsonb, boolean, numeric, jsonb, uuid)',
    'public.update_invoice(uuid, text, jsonb, boolean, numeric)',
    'public.mark_invoice_delivered(uuid)',
    'public.cancel_invoice(uuid)',
    'public.adjust_stock(uuid, numeric)',
    'public.create_quotation(uuid, uuid, text, jsonb, boolean, numeric)',
    'public.set_opening_balance(uuid, numeric, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end
$grants$;

-- The request-id log only has to outlive a retry; a week is plenty.
select cron.schedule(
  'buildsupply-client-requests-cleanup',
  '30 21 * * *',
  $cron$delete from public.client_requests where created_at < now() - interval '7 days'$cron$
);

commit;
