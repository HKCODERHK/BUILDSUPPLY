-- 028: the customer's khata link — a private, read-only page with their
-- bills, payments and balance.
--
-- The supplier shares it from the customer page (⋯ → Share khata link). The
-- code is random, one per customer, and made only when the supplier first
-- shares it. "Stop this link" clears it; sharing again makes a new one.
--
-- The public page reads through one function, customer_khata(code). It
-- returns that one customer's statement and nothing else: no other customer,
-- no ids, notes, rates, stock or link codes. Its balance comes from the same
-- customer_balances view the customer page uses, so the two always agree.
--
-- Nothing about bills, payments, stock or balances changes.
--
-- Safe to paste twice. Needs 024.

begin;

-- ── 1. The link code ───────────────────────────────────────────────────

alter table public.customers add column if not exists khata_token text;

alter table public.customers drop constraint if exists customers_khata_token_format;
alter table public.customers add constraint customers_khata_token_format
  check (khata_token is null or khata_token ~ '^[0-9a-f]{32}$');

create unique index if not exists customers_khata_token_key
  on public.customers (khata_token) where khata_token is not null;

-- ── 2. The supplier's side: get the link, or stop it ───────────────────
-- Runs as the caller, so RLS finds only the supplier's own customers — any
-- other customer (or the admin asking) is simply "not found".

create or replace function public.khata_link(p_customer_id uuid, p_stop boolean default false)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_token text;
begin
  select khata_token into v_token from public.customers where id = p_customer_id for no key update;
  if not found then
    raise exception 'Customer not found.';
  end if;
  if p_stop then
    update public.customers set khata_token = null where id = p_customer_id;
    return null;
  end if;
  if v_token is null then
    v_token := replace(gen_random_uuid()::text, '-', '');
    update public.customers set khata_token = v_token where id = p_customer_id;
  end if;
  return v_token;
end;
$$;

-- ── 3. The customer's page ─────────────────────────────────────────────
-- Exactly what the statement is built from (buildCustomerLedger and the
-- ledger PDF): live bills, every payment with the bills it is still on, and
-- the business and customer details the PDF prints.

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
  select sp.business_name, sp.address, sp.phone, sp.gst_number, sp.logo_url, sp.status into s
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
                                          'total', i.total, 'paid', i.paid, 'created_at', i.created_at)
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
       where p.customer_id = c.id), '[]'::jsonb));
end;
$$;

-- ── 4. Who may call what ───────────────────────────────────────────────

revoke all on function public.khata_link(uuid, boolean) from public, anon;
grant execute on function public.khata_link(uuid, boolean) to authenticated, service_role;

revoke all on function public.customer_khata(text) from public;
grant execute on function public.customer_khata(text) to anon, authenticated, service_role;

commit;
