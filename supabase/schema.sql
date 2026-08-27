-- BuildSupply database schema
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query) on a fresh project.
-- Free tier is sufficient for this schema.

-- ============================================================
-- 1. Suppliers (one row per login: both admins and suppliers)
-- ============================================================

create table public.suppliers (
  id uuid primary key references auth.users (id) on delete cascade,
  business_name text not null,
  phone text,
  gst_number text,
  logo_url text,
  role text not null default 'supplier' check (role in ('admin', 'supplier')),
  plan text not null default 'starter' check (plan in ('starter', 'pro')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  created_at timestamptz not null default now()
);

-- Bypasses RLS internally (security definer), so policies that call it don't recurse.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.suppliers where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.suppliers enable row level security;

create policy "suppliers_select" on public.suppliers
  for select using (id = auth.uid() or public.is_admin());

create policy "suppliers_update" on public.suppliers
  for update using (id = auth.uid() or public.is_admin());

create policy "suppliers_insert_admin_only" on public.suppliers
  for insert with check (public.is_admin());

-- ============================================================
-- 2. Tenant-scoped business tables
-- ============================================================

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  name text not null,
  phone text,
  site text,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now()
);

create table public.customer_sites (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  site_name text not null,
  pending_amount numeric(12, 2) not null default 0
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  name text not null,
  category text,
  rate numeric(12, 2) not null default 0,
  unit_label text,
  per_label text,
  stock_qty numeric(12, 2) not null default 0,
  stock_unit text,
  created_at timestamptz not null default now()
);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  quote_no text not null,
  customer_id uuid references public.customers (id) on delete set null,
  total numeric(12, 2) not null default 0,
  status text not null default 'Open' check (status in ('Open', 'Converted', 'Expired')),
  converted_invoice_id uuid,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  invoice_no text not null,
  customer_id uuid references public.customers (id) on delete set null,
  quotation_id uuid references public.quotations (id) on delete set null,
  subtotal numeric(12, 2) not null default 0,
  gst_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0, -- subtotal + gst_amount
  paid numeric(12, 2) not null default 0,
  status text not null default 'Unpaid' check (status in ('Unpaid', 'Partial', 'Paid')),
  created_at timestamptz not null default now()
);

alter table public.quotations
  add constraint quotations_converted_invoice_fk
  foreign key (converted_invoice_id) references public.invoices (id) on delete set null;

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  material_id uuid references public.materials (id) on delete set null,
  description text not null,
  qty numeric(12, 2) not null default 1,
  rate numeric(12, 2) not null default 0,
  amount numeric(12, 2) not null default 0
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount numeric(12, 2) not null,
  mode text not null default 'Cash' check (mode in ('Cash', 'UPI', 'Wallet', 'Split')),
  created_at timestamptz not null default now()
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete set null,
  challan_no text not null,
  driver_name text,
  vehicle_no text,
  status text not null default 'Pending' check (status in ('Pending', 'Delivered')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. Row-level security: every tenant table is scoped to
--    supplier_id = auth.uid(), with a full bypass for admins.
-- ============================================================

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'customers', 'customer_sites', 'materials', 'quotations',
      'invoices', 'invoice_items', 'payments', 'deliveries'
    ])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%1$s_tenant_isolation" on public.%1$I
         for all
         using (supplier_id = auth.uid() or public.is_admin())
         with check (supplier_id = auth.uid() or public.is_admin())',
      t
    );
  end loop;
end $$;

-- ============================================================
-- 4. Aggregate views (security_invoker so they respect the
--    querying user's RLS instead of the view owner's).
-- ============================================================

create view public.customer_balances
with (security_invoker = true) as
select
  c.id as customer_id,
  c.supplier_id,
  coalesce(sum(i.total), 0) as sales,
  coalesce(sum(i.total), 0) - coalesce(sum(i.paid), 0) as pending
from public.customers c
left join public.invoices i on i.customer_id = c.id
group by c.id, c.supplier_id;

create view public.dashboard_totals
with (security_invoker = true) as
select
  supplier_id,
  coalesce(sum(total), 0) as total_sales,
  coalesce(sum(paid), 0) as total_collected,
  coalesce(sum(total - paid), 0) as total_pending
from public.invoices
group by supplier_id;

-- ============================================================
-- 5. Storage bucket for business logos
--    Each supplier can only read/write files under a path
--    prefixed with their own user id.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "logo_read_public" on storage.objects
  for select using (bucket_id = 'logos');

create policy "logo_write_own_folder" on storage.objects
  for insert with check (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "logo_update_own_folder" on storage.objects
  for update using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "logo_delete_own_folder" on storage.objects
  for delete using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- 6. One-time bootstrap: create yourself as the first admin.
--    Steps (see README.md "Onboarding a new supplier" for the
--    repeatable version of this for suppliers):
--      1. Dashboard -> Authentication -> Add user -> create
--         your own admin login (email + password).
--      2. Copy that user's UUID from the Authentication table.
--      3. Run the statement below with that UUID substituted in.
-- ============================================================

-- insert into public.suppliers (id, business_name, role)
-- values ('PASTE-YOUR-ADMIN-AUTH-USER-UUID-HERE', 'BuildSupply Admin', 'admin');
