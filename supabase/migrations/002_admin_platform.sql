-- BuildSupply Phase 2 — Admin platform
-- Run this in the Supabase SQL editor AFTER supabase/schema.sql on the same project.

-- ============================================================
-- 1. Supplier account + subscription fields
-- ============================================================

alter table public.suppliers
  add column owner_name text,
  add column email text,
  add column address text,
  add column status text not null default 'active' check (status in ('active', 'suspended', 'inactive')),
  add column suspension_reason text,
  add column subscription_start date,
  add column subscription_expiry date,
  add column subscription_status text not null default 'active' check (subscription_status in ('active', 'expired', 'cancelled'));

-- Backfill email for existing rows (best-effort; auth.users is readable here
-- because migrations run with elevated SQL-editor privileges).
update public.suppliers s
set email = u.email
from auth.users u
where u.id = s.id and s.email is null;

-- ============================================================
-- 2. Activity log — shared by supplier actions and admin actions
-- ============================================================

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text not null check (actor_role in ('admin', 'supplier')),
  supplier_id uuid references public.suppliers (id) on delete cascade,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.activity_log enable row level security;

create policy "activity_log_select" on public.activity_log
  for select using (supplier_id = auth.uid() or public.is_admin());

create policy "activity_log_insert" on public.activity_log
  for insert with check (actor_id = auth.uid());

-- ============================================================
-- 3. Global material catalog (admin-owned master data)
-- ============================================================

create table public.material_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.master_materials (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.material_categories (id) on delete set null,
  brand_id uuid references public.brands (id) on delete set null,
  name text not null,
  default_unit_label text,
  default_per_label text,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.material_categories enable row level security;
alter table public.brands enable row level security;
alter table public.master_materials enable row level security;

create policy "material_categories_select" on public.material_categories
  for select using (auth.uid() is not null);
create policy "material_categories_admin_write" on public.material_categories
  for all using (public.is_admin()) with check (public.is_admin());

create policy "brands_select" on public.brands
  for select using (auth.uid() is not null);
create policy "brands_admin_write" on public.brands
  for all using (public.is_admin()) with check (public.is_admin());

create policy "master_materials_select" on public.master_materials
  for select using (auth.uid() is not null);
create policy "master_materials_admin_write" on public.master_materials
  for all using (public.is_admin()) with check (public.is_admin());

-- Supplier materials can optionally point at a master catalog item; if null,
-- it's still a fully custom supplier-typed material exactly like before.
alter table public.materials
  add column master_material_id uuid references public.master_materials (id) on delete set null;

-- ============================================================
-- 4. Platform settings (single row)
-- ============================================================

create table public.platform_settings (
  id boolean primary key default true check (id),
  platform_name text not null default 'BuildSupply',
  default_currency text not null default 'INR',
  default_gst_rate numeric(5, 2) not null default 18,
  default_subscription_days integer not null default 30,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

create policy "platform_settings_select" on public.platform_settings
  for select using (auth.uid() is not null);
create policy "platform_settings_admin_write" on public.platform_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 5. Admin-only reporting functions
--    security definer: bypass RLS internally, but ALWAYS re-check
--    is_admin() in the body first — a non-admin caller gets an
--    empty result, never an error that could leak existence.
-- ============================================================

create function public.admin_list_suppliers()
returns table (
  id uuid,
  business_name text,
  owner_name text,
  email text,
  phone text,
  address text,
  status text,
  role text,
  plan text,
  subscription_start date,
  subscription_expiry date,
  subscription_status text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id, s.business_name, s.owner_name, s.email, s.phone, s.address,
    s.status, s.role, s.plan, s.subscription_start, s.subscription_expiry,
    s.subscription_status, s.created_at, u.last_sign_in_at
  from public.suppliers s
  join auth.users u on u.id = s.id
  where public.is_admin()
  order by s.created_at desc;
$$;

create function public.admin_dashboard_stats()
returns table (
  total_suppliers bigint,
  active_suppliers bigint,
  suspended_suppliers bigint,
  inactive_suppliers bigint,
  expired_subscriptions bigint,
  expiring_soon bigint,
  never_logged_in bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where s.role = 'supplier'),
    count(*) filter (where s.role = 'supplier' and s.status = 'active'),
    count(*) filter (where s.role = 'supplier' and s.status = 'suspended'),
    count(*) filter (where s.role = 'supplier' and s.status = 'inactive'),
    count(*) filter (where s.role = 'supplier' and s.subscription_expiry < current_date),
    count(*) filter (
      where s.role = 'supplier'
        and s.subscription_expiry >= current_date
        and s.subscription_expiry < current_date + interval '7 days'
    ),
    count(*) filter (where s.role = 'supplier' and u.last_sign_in_at is null)
  from public.suppliers s
  join auth.users u on u.id = s.id
  where public.is_admin();
$$;
