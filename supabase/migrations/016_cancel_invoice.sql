-- Lets a supplier void a bill that was entered wrong.
--
-- Until now a mistyped invoice was permanent: the customer's khata balance
-- stayed wrong and the stock it consumed never came back. Cancelling is the
-- paper-khata behaviour — strike the entry out and write a fresh one — so a
-- cancelled bill keeps its record but drops out of every total.
alter table public.invoices drop constraint invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('Unpaid', 'Partial', 'Paid', 'Cancelled'));

-- Both money views must ignore cancelled bills, or the dashboard and the
-- customer khata would still count them.
create or replace view public.dashboard_totals as
  select supplier_id,
    coalesce(sum(total), 0::numeric) as total_sales,
    coalesce(sum(paid), 0::numeric) as total_collected,
    coalesce(sum(total - paid), 0::numeric) as total_pending
  from invoices
  where status <> 'Cancelled'
  group by supplier_id;

create or replace view public.customer_balances as
  select c.id as customer_id,
    c.supplier_id,
    coalesce(sum(i.total), 0::numeric) as sales,
    coalesce(sum(i.total), 0::numeric) - coalesce(sum(i.paid), 0::numeric) as pending
  from customers c
    left join invoices i on i.customer_id = c.id and i.status <> 'Cancelled'
  group by c.id, c.supplier_id;
