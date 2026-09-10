-- 024: money integrity.
--
-- Everything that moves money or stock now happens inside the database, in
-- one step, instead of as several separate writes from the phone:
--
--   * A payment is recorded against a locked customer, so a double tap, a
--     second phone or a slow network can never record it twice or overwrite
--     what the other one wrote. INV-1024 in Shree Balaji's account is what
--     this prevents: two Rs.830 payments 31 seconds apart, both worked out
--     from the same stale balance.
--   * Money beyond what a bill owes clears the customer's older bills, oldest
--     first, and anything left is kept as an ADVANCE — a payment with no bill.
--     A later bill uses the advance up automatically.
--   * Creating, editing, cancelling and delivering a bill, taking a payment,
--     and adding stock each succeed or fail as a whole.
--   * Bill and estimate numbers are handed out under a lock and can never
--     repeat (unique indexes as the backstop).
--   * A customer's old udhaar is an OPENING BALANCE: an invoices row with
--     kind = 'opening'. It counts in the khata and is paid first, but it is
--     not sales.
--
-- Every function is SECURITY INVOKER, so row-level security still decides
-- what each supplier can touch, exactly as it does for plain queries.
--
-- Safe with the app suppliers are running today: new columns have defaults,
-- a trigger fills the new payments.customer_id for the old code path, and
-- nothing the old code reads has changed shape.

begin;

-- ── 1. Columns ──────────────────────────────────────────────────────────

alter table public.invoices add column if not exists kind text not null default 'bill';
alter table public.invoices drop constraint if exists invoices_kind_check;
alter table public.invoices add constraint invoices_kind_check check (kind in ('bill', 'opening'));

-- A payment belongs to a customer; the bill it went onto is optional. No
-- bill means it is advance, waiting for the customer's next bill.
alter table public.payments add column if not exists customer_id uuid references public.customers (id) on delete set null;
update public.payments p set customer_id = i.customer_id
  from public.invoices i
 where i.id = p.invoice_id and p.customer_id is null;
alter table public.payments alter column invoice_id drop not null;

create index if not exists payments_invoice_id_idx on public.payments (invoice_id);
create index if not exists payments_customer_advance_idx on public.payments (customer_id) where invoice_id is null;
create index if not exists invoices_customer_created_idx on public.invoices (customer_id, created_at);

-- The app running today inserts payments without customer_id.
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
  before insert or update of invoice_id on public.payments
  for each row execute function public.payments_fill_customer();

-- ── 2. Numbers can never repeat ─────────────────────────────────────────

create unique index if not exists invoices_bill_no_unique on public.invoices (supplier_id, invoice_no) where kind = 'bill';
create unique index if not exists quotations_quote_no_unique on public.quotations (supplier_id, quote_no);
create unique index if not exists invoices_one_opening_per_customer on public.invoices (customer_id) where kind = 'opening';

-- ── 3. One request, one result ──────────────────────────────────────────
-- The phone sends an id with every save. The same id arriving again — a
-- double tap, a retry after a dropped connection — gets the first result
-- back instead of doing the work twice.

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

-- ── 4. Helpers ──────────────────────────────────────────────────────────

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
  perform 1 from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found.';
  end if;
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

-- What the customer owes and holds in advance, straight after a change —
-- so a receipt never quotes a balance worked out from stale numbers.
-- 'advance_balance', not 'advance': results merge this in with ||, and a
-- payment's own 'advance' (what this payment kept) must not be overwritten.
create or replace function public._customer_position(p_customer_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'pending', coalesce((select sum(total - paid) from public.invoices
                          where customer_id = p_customer_id and status <> 'Cancelled'), 0),
    'advance_balance', coalesce((select sum(amount) from public.payments
                                  where customer_id = p_customer_id and invoice_id is null), 0))
$$;

-- Puts an amount onto bills: the given bill first, then the customer's other
-- open bills oldest first (an opening balance is always the oldest), and
-- keeps whatever is left as advance. Only a bill with no customer can leave
-- money over, and that is reported back rather than recorded.
create or replace function public._allocate(
  p_supplier uuid,
  p_customer_id uuid,
  p_first_invoice uuid,
  p_amount numeric,
  p_mode text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  remaining numeric := p_amount;
  bill record;
  take numeric;
  applied jsonb := '[]'::jsonb;
begin
  if p_first_invoice is not null then
    select id, invoice_no, total, paid into bill
      from public.invoices
     where id = p_first_invoice and status <> 'Cancelled'
       for update;
    if found and bill.paid < bill.total then
      take := least(bill.total - bill.paid, remaining);
      insert into public.payments (supplier_id, customer_id, invoice_id, amount, mode)
      values (p_supplier, p_customer_id, bill.id, take, p_mode);
      update public.invoices
         set paid = paid + take, status = public._invoice_status(total, paid + take)
       where id = bill.id;
      applied := applied || jsonb_build_array(jsonb_build_object('invoice_id', bill.id, 'invoice_no', bill.invoice_no, 'amount', take));
      remaining := remaining - take;
    end if;
  end if;

  if remaining > 0 and p_customer_id is not null then
    for bill in
      select id, invoice_no, total, paid
        from public.invoices
       where customer_id = p_customer_id
         and status <> 'Cancelled'
         and paid < total
         and (p_first_invoice is null or id <> p_first_invoice)
       order by created_at, id
         for update
    loop
      take := least(bill.total - bill.paid, remaining);
      insert into public.payments (supplier_id, customer_id, invoice_id, amount, mode)
      values (p_supplier, p_customer_id, bill.id, take, p_mode);
      update public.invoices
         set paid = paid + take, status = public._invoice_status(total, paid + take)
       where id = bill.id;
      applied := applied || jsonb_build_array(jsonb_build_object('invoice_id', bill.id, 'invoice_no', bill.invoice_no, 'amount', take));
      remaining := remaining - take;
      exit when remaining <= 0;
    end loop;
  end if;

  if remaining > 0 and p_customer_id is not null then
    insert into public.payments (supplier_id, customer_id, invoice_id, amount, mode)
    values (p_supplier, p_customer_id, null, remaining, p_mode);
    return jsonb_build_object('applied', applied, 'advance', remaining, 'left_over', 0);
  end if;

  return jsonb_build_object('applied', applied, 'advance', 0, 'left_over', greatest(remaining, 0));
end;
$$;

-- Uses a customer's advance on their open bills, oldest advance onto oldest
-- bill. An advance row that only partly fits is split, and both parts keep
-- the date and mode the money actually came in on, so the statement still
-- shows when it was received.
create or replace function public._apply_advance(p_customer_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  adv record;
  bill record;
  left_amt numeric;
  take numeric;
begin
  if p_customer_id is null then
    return;
  end if;
  for adv in
    select id, supplier_id, amount, mode, created_at
      from public.payments
     where customer_id = p_customer_id and invoice_id is null and amount > 0
     order by created_at, id
       for update
  loop
    left_amt := adv.amount;
    for bill in
      select id, total, paid
        from public.invoices
       where customer_id = p_customer_id and status <> 'Cancelled' and paid < total
       order by created_at, id
         for update
    loop
      take := least(bill.total - bill.paid, left_amt);
      if take >= left_amt then
        update public.payments set invoice_id = bill.id where id = adv.id;
      else
        insert into public.payments (supplier_id, customer_id, invoice_id, amount, mode, created_at)
        values (adv.supplier_id, p_customer_id, bill.id, take, adv.mode, adv.created_at);
        update public.payments set amount = amount - take where id = adv.id;
      end if;
      update public.invoices
         set paid = paid + take, status = public._invoice_status(total, paid + take)
       where id = bill.id;
      left_amt := left_amt - take;
      exit when left_amt <= 0;
    end loop;
  end loop;
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

-- ── 5. Payments ─────────────────────────────────────────────────────────

-- One bill, possibly split across modes (Payments screen). Splits are taken
-- in order, so the modes stay truthful.
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
  perform 1 from public.invoices where id = p_invoice_id and status <> 'Cancelled' for update;
  if not found then
    raise exception 'This bill was cancelled, so it can''t take a payment.';
  end if;

  for v_split in select value from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) loop
    v_amount := coalesce((v_split->>'amount')::numeric, 0);
    continue when v_amount <= 0;
    v_part := public._allocate(v_supplier, v_customer, p_invoice_id, v_amount, coalesce(v_split->>'mode', 'Cash'));
    v_applied := v_applied || (v_part->'applied');
    v_advance := v_advance + (v_part->>'advance')::numeric;
    v_left := v_left + (v_part->>'left_over')::numeric;
  end loop;

  v_result := jsonb_build_object('applied', v_applied, 'advance', v_advance, 'left_over', v_left)
              || public._customer_position(v_customer);
  perform public._finish_request(v_supplier, p_request_id, v_result);
  return v_result;
end;
$$;

-- Money handed over against the khata as a whole (customer screen) — which
-- is how customers actually pay.
create or replace function public.record_customer_payment(p_request_id uuid, p_customer_id uuid, p_amount numeric, p_mode text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_prior jsonb;
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
  v_result := public._allocate(v_supplier, p_customer_id, null, p_amount, coalesce(p_mode, 'Cash'))
              || public._customer_position(p_customer_id);
  perform public._finish_request(v_supplier, p_request_id, v_result);
  return v_result;
end;
$$;

-- ── 6. Bills ────────────────────────────────────────────────────────────

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

create or replace function public.create_invoice(
  p_request_id uuid,
  p_customer_id uuid,
  p_site text,
  p_items jsonb,
  p_gst boolean default false,
  p_transport numeric default 0,
  p_payment jsonb default null,
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
  v_amount numeric;
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
    perform 1 from public.quotations where id = p_quotation_id and status in ('Draft', 'Sent') for update;
    if not found then
      raise exception 'This estimate was already turned into a bill.';
    end if;
  end if;

  -- One number at a time per supplier; cancelled bills keep theirs.
  perform pg_advisory_xact_lock(hashtextextended('invoice_no:' || v_supplier::text, 0));
  select coalesce(max(nullif(regexp_replace(invoice_no, '\D', '', 'g'), '')::bigint), 1000) + 1
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

  v_amount := coalesce((p_payment->>'amount')::numeric, 0);
  if v_amount > 0 then
    v_payment := public._allocate(v_supplier, p_customer_id, v_id, v_amount, coalesce(p_payment->>'mode', 'Cash'));
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
  select * into v_inv from public.invoices where id = p_invoice_id for update;
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

  perform public._apply_advance(v_customer);

  return (select to_jsonb(i) from public.invoices i where i.id = p_invoice_id);
end;
$$;

-- Takes the stock for a bill once the goods leave. Safe to call twice.
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

-- Voids a bill entered by mistake. The money taken on it is real, so the
-- supplier decides: keep it as the customer's advance, or remove it.
create or replace function public.cancel_invoice(p_invoice_id uuid, p_keep_payments boolean default false)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_inv public.invoices%rowtype;
  v_customer uuid;
  v_kept numeric := 0;
begin
  select customer_id into v_customer from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Bill not found.';
  end if;
  perform public._lock_customer(v_customer);
  select * into v_inv from public.invoices
   where id = p_invoice_id and status <> 'Cancelled' and kind = 'bill'
     for update;
  if not found then
    return jsonb_build_object('already', true);
  end if;

  if v_inv.delivered then
    update public.materials m
       set stock_qty = m.stock_qty + q.qty
      from (select material_id, sum(qty) as qty
              from public.invoice_items
             where invoice_id = p_invoice_id and material_id is not null
             group by material_id) q
     where m.id = q.material_id;
  end if;

  if p_keep_payments and v_customer is not null then
    select coalesce(sum(amount), 0) into v_kept from public.payments where invoice_id = p_invoice_id;
    update public.payments set invoice_id = null, customer_id = v_customer where invoice_id = p_invoice_id;
  else
    delete from public.payments where invoice_id = p_invoice_id;
  end if;

  update public.invoices set status = 'Cancelled', paid = 0 where id = p_invoice_id;
  perform public._apply_advance(v_customer);

  return jsonb_build_object('kept', v_kept) || public._customer_position(v_customer);
end;
$$;

-- ── 7. Stock, estimates, opening balance ────────────────────────────────

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
  select coalesce(max(nullif(regexp_replace(quote_no, '\D', '', 'g'), '')::bigint), 1000) + 1
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

-- Sets (or changes, or with 0 removes) what a customer already owed before
-- BuildSupply. Payments that were on the old figure go back to advance and
-- are applied again, oldest bill first, so any change is always consistent.
create or replace function public.set_opening_balance(p_customer_id uuid, p_amount numeric, p_as_of date default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_row public.invoices%rowtype;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  -- Noon on the chosen day in India, so it lands on that day for everyone.
  v_at timestamptz := ((coalesce(p_as_of, (now() at time zone 'Asia/Kolkata')::date))::timestamp + interval '12 hours')
                      at time zone 'Asia/Kolkata';
begin
  if p_customer_id is null then
    raise exception 'Customer not found.';
  end if;
  if v_amount < 0 then
    raise exception 'An opening balance can''t be negative.';
  end if;
  perform public._lock_customer(p_customer_id);

  select * into v_row from public.invoices where customer_id = p_customer_id and kind = 'opening' for update;
  if found then
    update public.payments set invoice_id = null, customer_id = p_customer_id where invoice_id = v_row.id;
    if v_amount = 0 then
      delete from public.invoices where id = v_row.id;
    else
      update public.invoices
         set subtotal = v_amount, total = v_amount, paid = 0,
             status = public._invoice_status(v_amount, 0), created_at = v_at
       where id = v_row.id;
    end if;
  elsif v_amount > 0 then
    insert into public.invoices
      (supplier_id, invoice_no, customer_id, subtotal, gst_amount, transport_labour_charge,
       total, paid, status, kind, delivered, created_at)
    values
      (v_supplier, 'Opening balance', p_customer_id, v_amount, 0, 0,
       v_amount, 0, public._invoice_status(v_amount, 0), 'opening', true, v_at);
  end if;

  perform public._apply_advance(p_customer_id);

  return jsonb_build_object(
           'opening', (select to_jsonb(i) from public.invoices i where i.customer_id = p_customer_id and i.kind = 'opening'))
         || public._customer_position(p_customer_id);
end;
$$;

-- ── 8. Totals ───────────────────────────────────────────────────────────
-- security_invoker is spelled out AND re-asserted below: a create or replace
-- without it once let every supplier read every other supplier's totals
-- (migration 016, fixed by 017).

create or replace view public.customer_balances with (security_invoker = true) as
select c.id as customer_id,
       c.supplier_id,
       coalesce((select sum(i.total) from public.invoices i
                  where i.customer_id = c.id and i.status <> 'Cancelled' and i.kind = 'bill'), 0) as sales,
       coalesce((select sum(i.total - i.paid) from public.invoices i
                  where i.customer_id = c.id and i.status <> 'Cancelled'), 0) as pending,
       coalesce((select sum(p.amount) from public.payments p
                  where p.customer_id = c.id and p.invoice_id is null), 0) as advance
  from public.customers c;

-- Sales are bills only; pending includes opening balances; collected is every
-- rupee actually received, advance included.
create or replace view public.dashboard_totals with (security_invoker = true) as
select s.supplier_id,
       s.total_sales,
       coalesce(p.collected, 0) as total_collected,
       s.total_pending
  from (select supplier_id,
               coalesce(sum(total) filter (where kind = 'bill'), 0) as total_sales,
               coalesce(sum(total - paid), 0) as total_pending
          from public.invoices
         where status <> 'Cancelled'
         group by supplier_id) s
  left join (select supplier_id, sum(amount) as collected
               from public.payments
              group by supplier_id) p using (supplier_id);

alter view public.customer_balances set (security_invoker = true);
alter view public.dashboard_totals set (security_invoker = true);

-- ── 9. Who may call what ────────────────────────────────────────────────

do $grants$
declare
  fn text;
begin
  foreach fn in array array[
    'public._invoice_status(numeric, numeric)',
    'public._require_supplier()',
    'public._lock_customer(uuid)',
    'public._claim_request(uuid, uuid, text)',
    'public._finish_request(uuid, uuid, jsonb)',
    'public._customer_position(uuid)',
    'public._allocate(uuid, uuid, uuid, numeric, text)',
    'public._apply_advance(uuid)',
    'public._check_items(jsonb)',
    'public._insert_items(uuid, uuid, jsonb)',
    'public.record_payment(uuid, uuid, jsonb)',
    'public.record_customer_payment(uuid, uuid, numeric, text)',
    'public.create_invoice(uuid, uuid, text, jsonb, boolean, numeric, jsonb, uuid)',
    'public.update_invoice(uuid, text, jsonb, boolean, numeric)',
    'public.mark_invoice_delivered(uuid)',
    'public.cancel_invoice(uuid, boolean)',
    'public.adjust_stock(uuid, numeric)',
    'public.create_quotation(uuid, uuid, text, jsonb, boolean, numeric)',
    'public.set_opening_balance(uuid, numeric, date)',
    'public.payments_fill_customer()'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end
$grants$;

-- The id log only has to outlive a retry; a week is plenty.
select cron.schedule(
  'buildsupply-client-requests-cleanup',
  '30 21 * * *',
  $cron$delete from public.client_requests where created_at < now() - interval '7 days'$cron$
);

commit;
