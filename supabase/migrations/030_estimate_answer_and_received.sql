-- 030: the customer answers an estimate, and confirms material received.
--
-- B. Once an online order is approved, the customer's status link shows the
--    estimate — its lines, rates and total — with Accept or Please call me.
--    The answer is kept on the order; the supplier sees it and converts the
--    estimate to a bill as always. Nothing is billed by the answer itself.
-- D. On the khata link, a bill the supplier has marked delivered gets a
--    "Material received?" button; the customer's tap records when.
--
-- Only the customer's own link can set either one: a guard refuses the app's
-- signed-in users, so neither can be filled in on the customer's behalf.
-- Nothing about bills, payments, stock or balances changes.
--
-- Safe to paste twice. Needs 029.

begin;

-- ── 1. Where the answers are kept ──────────────────────────────────────

alter table public.order_requests add column if not exists customer_response text;
alter table public.order_requests add column if not exists responded_at timestamptz;
alter table public.order_requests drop constraint if exists order_requests_customer_response_check;
alter table public.order_requests add constraint order_requests_customer_response_check
  check (customer_response is null or customer_response in ('accepted', 'call_me'));

alter table public.invoices add column if not exists received_at timestamptz;

-- ── 2. Only the customer's link may set them ───────────────────────────
-- The public functions below run as their owner, not as 'authenticated' or
-- 'anon', so they pass; the app's own users cannot write these columns.

create or replace function public.order_answer_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.customer_response is distinct from old.customer_response
          or new.responded_at is distinct from old.responded_at) then
    raise exception 'Only the customer can answer an estimate.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists order_answer_guard on public.order_requests;
create trigger order_answer_guard
  before update of customer_response, responded_at on public.order_requests
  for each row execute function public.order_answer_guard();

create or replace function public.invoice_received_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and new.received_at is distinct from old.received_at then
    raise exception 'Only the customer can confirm material received.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_received_guard on public.invoices;
create trigger invoice_received_guard
  before update of received_at on public.invoices
  for each row execute function public.invoice_received_guard();

-- ── 3. The status link: as in 027, plus the estimate and the answer ────

create or replace function public.order_status(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o record;
  q record;
  v jsonb;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('found', false);
  end if;
  select r.status, r.created_at, r.delivery_date, r.items, r.reject_code, r.reject_reason,
         r.quotation_id, r.customer_response, r.responded_at, s.business_name into o
    from public.order_requests r
    join public.suppliers s on s.id = r.supplier_id
   where r.public_token = p_token;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  v := jsonb_build_object(
    'found', true,
    'status', o.status,
    'business_name', o.business_name,
    'created_at', o.created_at,
    'delivery_date', o.delivery_date,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', i->>'name', 'unit', i->>'unit', 'qty', (i->>'qty')::numeric) order by n)
        from jsonb_array_elements(o.items) with ordinality as x(i, n)), '[]'::jsonb));
  if o.status = 'rejected' then
    v := v || jsonb_build_object('reject_code', o.reject_code, 'reject_reason', o.reject_reason);
  end if;
  -- Approved: the estimate the supplier made from it, and the customer's answer.
  if o.status = 'approved' and o.quotation_id is not null then
    select qt.id, qt.quote_no, qt.status, qt.subtotal, qt.gst_amount, qt.transport_labour_charge, qt.total into q
      from public.quotations qt
     where qt.id = o.quotation_id;
    if found then
      v := v || jsonb_build_object(
        'estimate', jsonb_build_object(
          'quote_no', q.quote_no,
          'status', q.status,
          'subtotal', q.subtotal,
          'gst_amount', q.gst_amount,
          'transport_labour_charge', q.transport_labour_charge,
          'total', q.total,
          'items', coalesce((
            select jsonb_agg(jsonb_build_object('description', qi.description, 'qty', qi.qty, 'rate', qi.rate, 'amount', qi.amount)
                             order by qi.id)
              from public.quotation_items qi
             where qi.quotation_id = q.id), '[]'::jsonb)),
        'response', o.customer_response,
        'responded_at', o.responded_at);
    end if;
  end if;
  return v;
end;
$$;

-- ── 4. The customer answers ────────────────────────────────────────────

create or replace function public.respond_to_estimate(p_token text, p_response text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('found', false);
  end if;
  if p_response is null or p_response not in ('accepted', 'call_me') then
    raise exception 'Please choose Accept or Please call me.';
  end if;
  select o.id, o.status, o.customer_response, qt.status as quote_status, s.status as supplier_status into r
    from public.order_requests o
    join public.suppliers s on s.id = o.supplier_id
    left join public.quotations qt on qt.id = o.quotation_id
   where o.public_token = p_token
     for no key update of o;
  if not found or r.supplier_status <> 'active' then
    return jsonb_build_object('found', false);
  end if;
  if r.status <> 'approved' or r.quote_status is null then
    raise exception 'There is no estimate to answer yet.';
  end if;
  if r.quote_status not in ('Draft', 'Sent') then
    raise exception 'This estimate can no longer be changed.';
  end if;
  if r.customer_response = p_response then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  update public.order_requests set customer_response = p_response, responded_at = now() where id = r.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── 5. The khata link: as in 029, plus delivered / received per bill ───

create or replace function public.customer_khata(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  s record;
  b record;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('found', false);
  end if;
  select cu.id, cu.supplier_id, cu.name, cu.phone, cu.address, cu.site into c
    from public.customers cu
   where cu.khata_token = p_token;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  select sp.business_name, sp.address, sp.phone, sp.gst_number, sp.logo_url, sp.status,
         sp.upi_id, sp.khata_upi_enabled into s
    from public.suppliers sp
   where sp.id = c.supplier_id;
  -- Like the order page: nothing while the account is not active.
  if not found or s.status <> 'active' then
    return jsonb_build_object('found', false);
  end if;
  select cb.pending, cb.advance into b from public.customer_balances cb where cb.customer_id = c.id;
  return jsonb_build_object(
    'found', true,
    'supplier', jsonb_build_object('business_name', s.business_name, 'address', s.address, 'phone', s.phone,
                                   'gst_number', s.gst_number, 'logo_url', s.logo_url),
    'customer', jsonb_build_object('name', c.name, 'phone', c.phone, 'address', c.address, 'site', c.site),
    'pending', coalesce(b.pending, 0),
    'advance', coalesce(b.advance, 0),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object('invoice_no', i.invoice_no, 'kind', i.kind, 'status', i.status, 'site', i.site,
                                          'total', i.total, 'paid', i.paid, 'created_at', i.created_at,
                                          'delivered', i.delivered, 'received_at', i.received_at)
                       order by i.created_at, i.id)
        from public.invoices i
       where i.customer_id = c.id and i.status <> 'Cancelled'), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'amount', p.amount, 'mode', p.mode, 'created_at', p.created_at,
               'payment_allocations', coalesce((
                 select jsonb_agg(jsonb_build_object('amount', a.amount, 'released_at', null,
                                                     'invoices', jsonb_build_object('invoice_no', i2.invoice_no, 'kind', i2.kind, 'site', i2.site)))
                   from public.payment_allocations a
                   join public.invoices i2 on i2.id = a.invoice_id
                  where a.payment_id = p.id and a.released_at is null), '[]'::jsonb))
             order by p.created_at, p.id)
        from public.payments p
       where p.customer_id = c.id), '[]'::jsonb))
    -- "Pay by UPI" only when the supplier has switched it on and set an ID.
    || case when s.khata_upi_enabled and s.upi_id is not null
            then jsonb_build_object('upi_id', s.upi_id)
            else '{}'::jsonb end;
end;
$$;

-- ── 6. The customer confirms material received ─────────────────────────

create or replace function public.confirm_received(p_token text, p_invoice_no text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v record;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('found', false);
  end if;
  select cu.id, s.status as supplier_status into c
    from public.customers cu
    join public.suppliers s on s.id = cu.supplier_id
   where cu.khata_token = p_token;
  if not found or c.supplier_status <> 'active' then
    return jsonb_build_object('found', false);
  end if;
  -- Only this customer's own live bills.
  select i.id, i.delivered, i.received_at into v
    from public.invoices i
   where i.customer_id = c.id and i.invoice_no = p_invoice_no and i.kind = 'bill' and i.status <> 'Cancelled'
     for no key update;
  if not found then
    raise exception 'Bill not found.';
  end if;
  if not v.delivered then
    raise exception 'This bill is not marked delivered yet.';
  end if;
  if v.received_at is not null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  update public.invoices set received_at = now() where id = v.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── 7. Who may call what ───────────────────────────────────────────────

revoke all on function public.order_status(text) from public;
grant execute on function public.order_status(text) to anon, authenticated, service_role;
revoke all on function public.customer_khata(text) from public;
grant execute on function public.customer_khata(text) to anon, authenticated, service_role;
revoke all on function public.respond_to_estimate(text, text) from public;
grant execute on function public.respond_to_estimate(text, text) to anon, authenticated, service_role;
revoke all on function public.confirm_received(text, text) from public;
grant execute on function public.confirm_received(text, text) to anon, authenticated, service_role;

commit;
