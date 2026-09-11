-- 029: UPI, only where the supplier chooses.
--
-- The supplier's UPI ID, and a switch — off by default — that puts "Pay by
-- UPI" for the balance due on their customers' khata links. The "Show UPI
-- QR" screen on the customer page needs only the UPI ID. Bills, orders and
-- estimates get nothing new.
--
-- Payments are never recorded automatically: the money goes straight to the
-- supplier's account, and the supplier checks it and uses Receive payment as
-- always. Nothing about bills, payments, stock or balances changes.
--
-- Safe to paste twice. Needs 028.

begin;

-- ── 1. The supplier's UPI settings ─────────────────────────────────────
-- Editable by the supplier on their own row: the 025 guard only stops the
-- admin-only columns it lists, and these are not among them.

alter table public.suppliers add column if not exists upi_id text;
alter table public.suppliers add column if not exists khata_upi_enabled boolean not null default false;

-- Postgres regular expressions allow at most 255 repeats, so the counts here
-- stay well under it — a {2,256} is accepted when the constraint is made and
-- then refuses every save. Real UPI IDs are far shorter than 64 + 64.
alter table public.suppliers drop constraint if exists suppliers_upi_id_format;
alter table public.suppliers add constraint suppliers_upi_id_format
  check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,63}$');

-- ── 2. The khata link: as in 028, plus the UPI ID when switched on ─────

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
       where p.customer_id = c.id), '[]'::jsonb))
    -- "Pay by UPI" only when the supplier has switched it on and set an ID.
    || case when s.khata_upi_enabled and s.upi_id is not null
            then jsonb_build_object('upi_id', s.upi_id)
            else '{}'::jsonb end;
end;
$$;

-- ── 3. Who may call what (unchanged from 028, restated) ────────────────

revoke all on function public.customer_khata(text) from public;
grant execute on function public.customer_khata(text) to anon, authenticated, service_role;

commit;
