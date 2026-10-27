-- 053 — bills, payments and estimates change only through the app's own
-- functions (audit finding F-05), 2026-10-27. Paste after 052. Safe to run
-- twice. No row is changed by running it.
--
-- Until now a supplier's own login could also write these tables directly
-- through the database API — a request the app never makes, but any script
-- holding the login could: set a bill's total or paid amount by hand, delete
-- a bill (its lines and the record of which payments paid it went with it),
-- add a payment that no allocation knows about, or delete a customer and
-- leave their bills pointing at nobody. Row-level security only ever asked
-- "is it your row?", so none of that touched another shop — but it meant an
-- issued bill could change without the app's rules, which is exactly what a
-- khata has to be able to prove it can't.
--
-- How it works. Every money change the app makes runs inside one of its
-- functions (create_invoice, record_customer_payment, correct_payment,
-- cancel_invoice, …). A direct write through the API is a statement on its
-- own. A trigger tells the two apart by the call stack Postgres reports
-- (pg_context): inside a function it has more than one line. So no money
-- function had to change, and every one of them keeps running as the
-- signed-in supplier, under row-level security, as before.
--
-- Not affected:
--   * the SQL editor, service-role tools, cron jobs and the customer-side
--     functions (they run as other roles);
--   * cascades — the admin deleting a whole supplier account;
--   * the two direct writes the app does make: adding and editing a customer,
--     and marking an estimate Sent (plus its valid-until date, 052).
-- Payments and allocations were already never deleted (024's keep-triggers
-- quietly skip it); that is left exactly as it was.

begin;

create or replace function public.money_write_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_ctx text;
begin
  -- Only the app's API roles are ever stopped.
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- A cascade, or a write made inside one of the app's functions.
  if pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  get diagnostics v_ctx = pg_context;
  if position(E'\n' in v_ctx) > 0 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- The one direct money write the app makes: marking an estimate Sent, and
  -- its valid-until date. Every other column must stay as it was. (Nested:
  -- only quotations rows have a status to compare.)
  if tg_table_name = 'quotations' and tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'status' - 'valid_until') = (to_jsonb(old) - 'status' - 'valid_until')
       and (to_jsonb(new)->>'status' is not distinct from to_jsonb(old)->>'status'
            or (to_jsonb(old)->>'status' = 'Draft' and to_jsonb(new)->>'status' = 'Sent')) then
      return new;
    end if;
  end if;

  raise exception 'Bills, payments and estimates can only be changed through the BuildSupply app.'
    using errcode = '42501';
end;
$$;

revoke all on function public.money_write_guard() from public, anon, authenticated;

drop trigger if exists invoices_money_guard on public.invoices;
create trigger invoices_money_guard
  before insert or update or delete on public.invoices
  for each row execute function public.money_write_guard();

drop trigger if exists invoice_items_money_guard on public.invoice_items;
create trigger invoice_items_money_guard
  before insert or update or delete on public.invoice_items
  for each row execute function public.money_write_guard();

-- Deletes are left to 024's keep-trigger, which skips them quietly.
drop trigger if exists payments_money_guard on public.payments;
create trigger payments_money_guard
  before insert or update on public.payments
  for each row execute function public.money_write_guard();

drop trigger if exists payment_allocations_money_guard on public.payment_allocations;
create trigger payment_allocations_money_guard
  before insert or update on public.payment_allocations
  for each row execute function public.money_write_guard();

drop trigger if exists quotations_money_guard on public.quotations;
create trigger quotations_money_guard
  before insert or update or delete on public.quotations
  for each row execute function public.money_write_guard();

drop trigger if exists quotation_items_money_guard on public.quotation_items;
create trigger quotation_items_money_guard
  before insert or update or delete on public.quotation_items
  for each row execute function public.money_write_guard();

-- A customer with any bill, payment, estimate or order on record can't be
-- deleted: their bills would be left pointing at nobody (customer_id is set
-- to null on delete). One added by mistake, with nothing against them, still
-- can be. Cascades and the operator's own tools are not stopped.
create or replace function public.customers_delete_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or pg_trigger_depth() > 1 then
    return old;
  end if;
  if exists (select 1 from public.invoices where customer_id = old.id)
     or exists (select 1 from public.payments where customer_id = old.id)
     or exists (select 1 from public.quotations where customer_id = old.id)
     or exists (select 1 from public.order_requests where customer_id = old.id) then
    raise exception 'This customer has bills, payments or estimates on record, so they can''t be deleted.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function public.customers_delete_guard() from public, anon, authenticated;

drop trigger if exists customers_delete_guard on public.customers;
create trigger customers_delete_guard
  before delete on public.customers
  for each row execute function public.customers_delete_guard();

commit;
