-- 035: GST per material.
--
-- Asked for 2026-09-22. Until now GST was one rate for the whole bill — the
-- literal `0.18` in create_invoice, update_invoice and create_quotation, and
-- `GST_RATE = 0.18` on both screens. That is right for cement and TMT and
-- wrong for sand and gitti (5%), which is the long-standing open question in
-- CLAUDE.md ("it matters the day a GST-registered sand supplier signs up").
--
-- What this adds:
--   * `materials.gst_rate` — the supplier's own percentage for that material,
--     defaulting to 18, so nothing about any existing supplier's billing
--     changes until they set one.
--   * `invoice_items.gst_rate` / `gst_amount` and the same on
--     `quotation_items` — the tax that was charged on that line, written once
--     when the bill is saved. **This is what keeps an issued bill true**: a
--     supplier changing cement from 18% to 28% next month must not silently
--     rewrite last month's bills, and because the figure is stored per line
--     rather than looked up, it cannot.
--   * `_price_items` — resolves each line's percentage **server-side from the
--     material**, so the app never gets to state its own tax rate. A line with
--     no material behind it (a typed-in one-off) keeps 18, which is exactly
--     what it was charged before this migration.
--   * `khata_document` carries the per-line tax, so the PDF the customer
--     downloads from their khata link is the same bill the supplier sees.
--
-- The GST switch on the bill screen stays as it is: off means no tax at all,
-- which is most suppliers. On means each line uses its own material's rate.
--
-- Rounding moves from one rounding of the whole bill to one per line, summed.
-- For an all-18% bill that can differ by a rupee from what the old code would
-- have produced; per line is what a tax invoice has to show, since the printed
-- lines have to add up to the printed total.
--
-- No money, stock, balance or existing row changes. Safe to run twice.

begin;

-- ── 1. The columns ────────────────────────────────────────────────────────

alter table public.materials
  add column if not exists gst_rate numeric(5, 2) not null default 18;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'materials_gst_rate_range') then
    alter table public.materials
      add constraint materials_gst_rate_range check (gst_rate >= 0 and gst_rate <= 100);
  end if;
end $$;

comment on column public.materials.gst_rate is
  'GST percentage for this material (035). 18 by default, which is what every bill charged before per-material rates existed.';

alter table public.invoice_items
  add column if not exists gst_rate numeric(5, 2),
  add column if not exists gst_amount numeric(12, 2);

alter table public.quotation_items
  add column if not exists gst_rate numeric(5, 2),
  add column if not exists gst_amount numeric(12, 2);

comment on column public.invoice_items.gst_rate is
  'The percentage charged on this line, fixed when the bill was saved (035). Null on lines written before 035, where the bill carried one rate for the whole of it.';

-- Lines written before 035 keep nulls. The tax they were charged is not
-- recorded per line anywhere, and inventing one here would put a made-up
-- figure in the record; `invoices.gst_amount` is still the truth for those
-- bills, and the app falls back to showing it as one line, the way it always
-- did. Only a line that actually carries a rate is shown material-wise.

-- ── 2. Resolving each line's tax, server-side ─────────────────────────────
-- The app sends what it sends; the rate always comes from the material row,
-- so nothing a customer-facing or tampered request could carry becomes tax.

create or replace function public._price_items(p_supplier uuid, p_items jsonb, p_gst boolean)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(
           e.x
           || jsonb_build_object(
                'gst_rate', v.rate,
                -- Whole rupees per line, as every other figure on a bill is.
                'gst_amount', round((e.x->>'qty')::numeric * coalesce((e.x->>'rate')::numeric, 0) * v.rate / 100))
           order by e.ord), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as e(x, ord)
    left join public.materials m
           on m.id = nullif(e.x->>'material_id', '')::uuid and m.supplier_id = p_supplier
   cross join lateral (
     select case
              when not p_gst then 0
              -- A typed-in line with no material behind it: 18, which is what
              -- it was charged before this migration existed.
              else coalesce(m.gst_rate, 18)
            end as rate) v
$$;

-- Writes the lines, now carrying the tax each one was charged. Same signature,
-- so `create or replace` keeps its grants; callers hand it the priced items.
create or replace function public._insert_items(p_supplier uuid, p_invoice_id uuid, p_items jsonb)
returns void
language sql
set search_path = public
as $$
  insert into public.invoice_items (supplier_id, invoice_id, material_id, description, qty, rate, amount, gst_rate, gst_amount)
  select p_supplier,
         p_invoice_id,
         m.id,
         coalesce(e.x->>'description', ''),
         (e.x->>'qty')::numeric,
         coalesce((e.x->>'rate')::numeric, 0),
         (e.x->>'qty')::numeric * coalesce((e.x->>'rate')::numeric, 0),
         (e.x->>'gst_rate')::numeric,
         coalesce((e.x->>'gst_amount')::numeric, 0)
    from jsonb_array_elements(p_items) with ordinality as e(x, ord)
    -- Only a material this supplier can see; anything else becomes a plain line.
    left join public.materials m on m.id = nullif(e.x->>'material_id', '')::uuid
   where coalesce((e.x->>'qty')::numeric, 0) > 0
   order by e.ord
$$;

-- What the whole bill's GST comes to: the lines, added up.
create or replace function public._items_gst(p_items jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  select coalesce(sum(coalesce((x->>'gst_amount')::numeric, 0)), 0)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
   where coalesce((x->>'qty')::numeric, 0) > 0
$$;

-- ── 3. The three functions that price a document ─────────────────────────
-- Each is the 024 version with the two GST lines changed and the priced items
-- passed on. Nothing else in any of them moved.

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
  v_items jsonb;
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
  v_items := public._price_items(v_supplier, p_items, p_gst);
  v_gst := public._items_gst(v_items);
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

  perform public._insert_items(v_supplier, v_id, v_items);

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
  v_items jsonb;
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
  -- Corrected lines are re-priced at today's percentages, the same way their
  -- rates are whatever the supplier types now. The bill is being rewritten.
  v_items := public._price_items(v_inv.supplier_id, p_items, p_gst);
  v_gst := public._items_gst(v_items);
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
  perform public._insert_items(v_inv.supplier_id, p_invoice_id, v_items);

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
  v_items jsonb;
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
  v_items := public._price_items(v_supplier, p_items, p_gst);
  v_gst := public._items_gst(v_items);
  v_total := v_subtotal + v_gst + v_transport;

  perform pg_advisory_xact_lock(hashtextextended('quote_no:' || v_supplier::text, 0));
  select coalesce(max(substring(quote_no from '^QT-(\d+)$')::bigint), 1000) + 1
    into v_seq
    from public.quotations
   where supplier_id = v_supplier;

  insert into public.quotations (supplier_id, quote_no, customer_id, site, subtotal, gst_amount, transport_labour_charge, total)
  values (v_supplier, 'QT-' || v_seq, p_customer_id, nullif(btrim(coalesce(p_site, '')), ''), v_subtotal, v_gst, v_transport, v_total)
  returning id into v_id;

  insert into public.quotation_items (supplier_id, quotation_id, material_id, description, qty, rate, amount, gst_rate, gst_amount)
  select v_supplier,
         v_id,
         m.id,
         coalesce(e.x->>'description', ''),
         (e.x->>'qty')::numeric,
         coalesce((e.x->>'rate')::numeric, 0),
         (e.x->>'qty')::numeric * coalesce((e.x->>'rate')::numeric, 0),
         (e.x->>'gst_rate')::numeric,
         coalesce((e.x->>'gst_amount')::numeric, 0)
    from jsonb_array_elements(v_items) with ordinality as e(x, ord)
    left join public.materials m on m.id = nullif(e.x->>'material_id', '')::uuid
   where coalesce((e.x->>'qty')::numeric, 0) > 0
   order by e.ord;

  v_result := (select to_jsonb(q) from public.quotations q where q.id = v_id);
  perform public._finish_request(v_supplier, p_request_id, v_result);
  return v_result;
end;
$$;

-- ── 4. The customer's own copy carries the same lines ────────────────────
-- 031's function, with gst_rate and gst_amount added to both item lists so
-- the PDF downloaded from a khata link is the bill the supplier issued.

create or replace function public.khata_document(p_token text, p_kind text, p_no text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  d record;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' or coalesce(p_kind, '') not in ('bill', 'estimate') then
    return jsonb_build_object('found', false);
  end if;
  select cu.id, s.status as supplier_status into c
    from public.customers cu
    join public.suppliers s on s.id = cu.supplier_id
   where cu.khata_token = p_token;
  if not found or c.supplier_status <> 'active' then
    return jsonb_build_object('found', false);
  end if;

  if p_kind = 'bill' then
    select i.id, i.invoice_no, i.created_at, i.site, i.subtotal, i.gst_amount, i.transport_labour_charge,
           i.total, i.paid, i.status into d
      from public.invoices i
     where i.customer_id = c.id and i.invoice_no = p_no and i.kind = 'bill' and i.status <> 'Cancelled'
     order by i.created_at desc
     limit 1;
    if not found then
      return jsonb_build_object('found', false);
    end if;
    return jsonb_build_object(
      'found', true,
      'kind', 'bill',
      'invoice_no', d.invoice_no,
      'created_at', d.created_at,
      'site', d.site,
      'subtotal', d.subtotal,
      'gst_amount', d.gst_amount,
      'transport_labour_charge', d.transport_labour_charge,
      'total', d.total,
      'paid', d.paid,
      'status', d.status,
      -- Lines in the order they were saved, as the bill page lists them
      -- (ids are random, so ordering by id would shuffle them).
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('description', ii.description, 'qty', ii.qty, 'rate', ii.rate,
                                            'amount', ii.amount, 'gst_rate', ii.gst_rate, 'gst_amount', ii.gst_amount)
                         order by ii.ctid)
          from public.invoice_items ii
         where ii.invoice_id = d.id), '[]'::jsonb));
  end if;

  select q.id, q.quote_no, q.created_at, q.site, q.subtotal, q.gst_amount, q.transport_labour_charge,
         q.total, q.status into d
    from public.quotations q
   where q.customer_id = c.id and q.quote_no = p_no
   order by q.created_at desc
   limit 1;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'kind', 'estimate',
    'quote_no', d.quote_no,
    'created_at', d.created_at,
    'site', d.site,
    'subtotal', d.subtotal,
    'gst_amount', d.gst_amount,
    'transport_labour_charge', d.transport_labour_charge,
    'total', d.total,
    'status', d.status,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('description', qi.description, 'qty', qi.qty, 'rate', qi.rate,
                                          'amount', qi.amount, 'gst_rate', qi.gst_rate, 'gst_amount', qi.gst_amount)
                       order by qi.ctid)
        from public.quotation_items qi
       where qi.quotation_id = d.id), '[]'::jsonb));
end;
$$;

-- ── 5. Grants ────────────────────────────────────────────────────────────
-- `create or replace` keeps what a function already had; the two new helpers
-- have none yet, and are internal, so they get exactly what 024's helpers do.

revoke all on function public._price_items(uuid, jsonb, boolean) from public, anon;
grant execute on function public._price_items(uuid, jsonb, boolean) to authenticated, service_role;
revoke all on function public._items_gst(jsonb) from public, anon;
grant execute on function public._items_gst(jsonb) to authenticated, service_role;

commit;
