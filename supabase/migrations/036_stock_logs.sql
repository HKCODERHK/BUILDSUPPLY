-- 036: date-wise stock logs.
--
-- Asked for 2026-09-22: a supplier should be able to see exactly when and why
-- a material's stock changed. Today nothing records it. `activity_log` catches
-- a manual top-up and a material edit, but the three movements that matter
-- most — the goods leaving on a delivery, a delivered bill being corrected,
-- and a delivered bill being cancelled — all happen inside the database and
-- are written nowhere. "Why does the app say 120 bags when I counted 170" has
-- no answer at all.
--
-- **This needs migration 034 first.** 034 and this one both re-issue
-- `mark_invoice_delivered`, and whichever is pasted second wins — so pasting
-- 034 afterwards would quietly take the logging back out of deliveries. The
-- guard below refuses to run until 034 is in, rather than leaving that to
-- chance.
--
-- How it works: one trigger on `materials` catches **every** change to
-- `stock_qty`, whatever caused it, so there is no way to move stock without a
-- line in the history. The four functions that move it say why by setting a
-- transaction-local setting the trigger reads; anything else that ever moves
-- it is recorded as 'other' rather than going unrecorded.
--
-- The history is immutable: no insert, update or delete is granted to anyone,
-- and a trigger refuses both anyway. It cascades away with the supplier when
-- the admin deletes an account, as every other table does.
--
-- Nothing about money, balances or a bill's total changes. Safe to run twice.

begin;

-- ── 0. This one has an order ────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'invoices' and column_name = 'delivered_at') then
    raise exception 'Paste migration 034 (034_delivered_at.sql) before this one. Both re-issue mark_invoice_delivered, so running them the other way round would silently remove the stock logging from deliveries.';
  end if;
end $$;

-- ── 1. The history ──────────────────────────────────────────────────────

create table if not exists public.stock_logs (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  -- What it read before and after, so a supplier can follow the running
  -- figure down the page rather than adding deltas up in their head.
  qty_before numeric(12, 2) not null,
  qty_after numeric(12, 2) not null,
  delta numeric(12, 2) not null,
  -- Where the change came from. 'other' is anything that moved stock without
  -- saying why — a hand-written statement in the SQL editor, say. It is not a
  -- gap in the history, only in the explanation.
  reason text not null check (reason in ('added', 'delivered', 'bill_edited', 'bill_cancelled', 'other')),
  invoice_id uuid references public.invoices (id) on delete set null,
  -- Who was signed in. Null for anything not done through the app.
  actor uuid,
  created_at timestamptz not null default now()
);

create index if not exists stock_logs_supplier_time on public.stock_logs (supplier_id, created_at desc, id desc);
create index if not exists stock_logs_material_time on public.stock_logs (material_id, created_at desc, id desc);

comment on table public.stock_logs is
  'Every change to a material''s stock, with what it read before and after and where the change came from (036). Written only by the _log_stock trigger; nobody can insert, edit or remove a line. History starts the day 036 was applied — earlier movements were never recorded anywhere and are not invented here.';

alter table public.stock_logs enable row level security;

-- A supplier reads their own, and that is the whole of it. No admin access,
-- as for every business table since 019: it holds what a supplier stocks and
-- how fast it moves.
drop policy if exists stock_logs_select_own on public.stock_logs;
create policy stock_logs_select_own on public.stock_logs
  for select using (supplier_id = auth.uid());

revoke all on public.stock_logs from anon, authenticated;
grant select on public.stock_logs to authenticated;

-- ── 2. Nothing can be changed or removed ────────────────────────────────

create or replace function public.stock_logs_keep()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- A cascade — the admin deleting a whole supplier account — still works;
  -- it arrives at a trigger depth below the statement that caused it.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  -- Otherwise the row simply does not change: returning null from a BEFORE
  -- trigger skips the statement for that row, quietly, the way
  -- keep_money_rows does for receipts.
  return null;
end;
$$;

drop trigger if exists stock_logs_keep_delete on public.stock_logs;
create trigger stock_logs_keep_delete
  before delete on public.stock_logs
  for each row execute function public.stock_logs_keep();

drop trigger if exists stock_logs_keep_update on public.stock_logs;
create trigger stock_logs_keep_update
  before update on public.stock_logs
  for each row execute function public.stock_logs_keep();

-- ── 3. The one place a line is written ──────────────────────────────────
-- On the table, not in the four functions, so a movement can never escape it.

create or replace function public._log_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(current_setting('buildsupply.stock_reason', true), '');
  v_invoice text := nullif(current_setting('buildsupply.stock_invoice', true), '');
begin
  insert into public.stock_logs
    (supplier_id, material_id, qty_before, qty_after, delta, reason, invoice_id, actor)
  values
    (new.supplier_id, new.id, old.stock_qty, new.stock_qty, new.stock_qty - old.stock_qty,
     -- An unknown setting must never stop the stock move itself.
     case when v_reason in ('added', 'delivered', 'bill_edited', 'bill_cancelled') then v_reason else 'other' end,
     case when v_invoice ~ '^[0-9a-f-]{36}$' then v_invoice::uuid else null end,
     auth.uid());
  return null;
end;
$$;

revoke all on function public._log_stock() from public, anon;
grant execute on function public._log_stock() to authenticated, service_role;

drop trigger if exists materials_log_stock on public.materials;
create trigger materials_log_stock
  after update of stock_qty on public.materials
  for each row
  when (old.stock_qty is distinct from new.stock_qty)
  execute function public._log_stock();

-- ── 4. The four functions that move stock, each saying why ──────────────
-- Otherwise byte for byte the versions this repo already had: adjust_stock
-- and cancel_invoice from 024, mark_invoice_delivered from 034, update_invoice
-- from 035. Only the set_config line is new in each.

create or replace function public.adjust_stock(p_material_id uuid, p_delta numeric)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_qty numeric;
begin
  perform set_config('buildsupply.stock_reason', 'added', true);
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

create or replace function public.mark_invoice_delivered(p_invoice_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
begin
  update public.invoices
     set delivered = true, delivered_at = now()
   where id = p_invoice_id and delivered = false and status <> 'Cancelled' and kind = 'bill';
  if not found then
    return false;
  end if;

  perform set_config('buildsupply.stock_reason', 'delivered', true);
  perform set_config('buildsupply.stock_invoice', p_invoice_id::text, true);
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
    perform set_config('buildsupply.stock_reason', 'bill_cancelled', true);
    perform set_config('buildsupply.stock_invoice', p_invoice_id::text, true);
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
    perform set_config('buildsupply.stock_reason', 'bill_edited', true);
    perform set_config('buildsupply.stock_invoice', p_invoice_id::text, true);
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

-- No grant changes: `create or replace` keeps what each function already had.

commit;
