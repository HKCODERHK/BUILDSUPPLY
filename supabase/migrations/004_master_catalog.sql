-- BuildSupply — Master Material Catalog restructure
-- Run this in the Supabase SQL editor AFTER 003_phase2_completion.sql.
--
-- Replaces the flat `master_materials` table with a proper two-tier model:
--   material_types (what it is: "River Sand", "TMT Rod", "Cement")
--     -> master_material_variants (the sellable combination: River Sand + Truck 400 CFT)
-- so each category's very different attribute shape (vehicle+capacity vs
-- diameter+grade+length vs type+packaging) lives in one flexible `attributes`
-- jsonb column instead of needing a schema migration per category.

create extension if not exists pg_trgm;

-- ============================================================
-- 1. Slugs on existing tables (cheap, used for stable lookups/URLs later)
-- ============================================================

alter table public.material_categories add column slug text;
update public.material_categories set slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'));
alter table public.material_categories alter column slug set not null;
alter table public.material_categories add constraint material_categories_slug_unique unique (slug);

alter table public.brands add column slug text;
update public.brands set slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'));
alter table public.brands alter column slug set not null;
alter table public.brands add constraint brands_slug_unique unique (slug);

-- ============================================================
-- 2. material_types
-- ============================================================

create table public.material_types (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.material_categories (id) on delete cascade,
  name text not null,
  slug text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category_id, name)
);

alter table public.material_types enable row level security;

create policy "material_types_select" on public.material_types
  for select using (auth.uid() is not null);
create policy "material_types_admin_write" on public.material_types
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 3. master_material_variants — replaces master_materials
-- ============================================================

create table public.master_material_variants (
  id uuid primary key default gen_random_uuid(),
  material_type_id uuid not null references public.material_types (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  name text not null,
  attributes jsonb not null default '{}'::jsonb,
  unit text,
  search_keywords text,
  search_text text,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- `nulls not distinct` matters here: Sand/Gitti variants always have a
  -- null brand_id, and plain UNIQUE treats every null as distinct from
  -- every other null — which would silently let duplicate Sand/Gitti
  -- variants through. This makes two nulls count as equal for dedup.
  unique nulls not distinct (material_type_id, brand_id, attributes)
);

alter table public.master_material_variants enable row level security;

create policy "master_material_variants_select" on public.master_material_variants
  for select using (auth.uid() is not null);
create policy "master_material_variants_admin_write" on public.master_material_variants
  for all using (public.is_admin()) with check (public.is_admin());

-- Denormalized, trigger-maintained search text: name + type + category + brand
-- + unit + admin-entered aliases + every attribute value, lowercased, so a
-- single ILIKE '%term%' against one column covers everything the spec asks
-- search to cover.
create or replace function public.refresh_master_variant_search_text()
returns trigger
language plpgsql
as $$
declare
  v_category_name text;
  v_type_name text;
  v_brand_name text;
  v_attr_text text;
begin
  select mc.name, mt.name
    into v_category_name, v_type_name
  from public.material_types mt
  join public.material_categories mc on mc.id = mt.category_id
  where mt.id = new.material_type_id;

  if new.brand_id is not null then
    select b.name into v_brand_name from public.brands b where b.id = new.brand_id;
  end if;

  -- Also include the unit-suffixed form of each attribute value (e.g. "12mm",
  -- "400 cft") alongside the bare value, so search matches whichever form the
  -- supplier types — the suffix mirrors the display formatting in
  -- frontend/src/lib/catalogAttributes.ts's ATTRIBUTE_LABELS and must be kept
  -- in sync with it.
  select string_agg(
      value || ' ' || case key
        when 'diameter_mm' then value || 'mm'
        when 'length_m' then value || 'm'
        when 'capacity_cft' then value || ' cft'
        when 'pack_size_kg' then value || ' kg'
        else value
      end,
      ' '
    ) into v_attr_text
  from jsonb_each_text(coalesce(new.attributes, '{}'::jsonb));

  new.search_text := lower(
    coalesce(new.name, '') || ' ' ||
    coalesce(v_type_name, '') || ' ' ||
    coalesce(v_category_name, '') || ' ' ||
    coalesce(v_brand_name, '') || ' ' ||
    coalesce(new.unit, '') || ' ' ||
    coalesce(new.search_keywords, '') || ' ' ||
    coalesce(v_attr_text, '')
  );
  return new;
end;
$$;

create trigger master_material_variants_search_text
before insert or update on public.master_material_variants
for each row execute function public.refresh_master_variant_search_text();

-- Keep search_text in sync if an admin later renames a material type or
-- brand — otherwise existing variants would silently go stale in search.
create or replace function public.touch_variants_on_type_rename()
returns trigger
language plpgsql
as $$
begin
  update public.master_material_variants set name = name where material_type_id = new.id;
  return new;
end;
$$;

create trigger material_types_touch_variants
after update of name on public.material_types
for each row execute function public.touch_variants_on_type_rename();

create or replace function public.touch_variants_on_brand_rename()
returns trigger
language plpgsql
as $$
begin
  update public.master_material_variants set name = name where brand_id = new.id;
  return new;
end;
$$;

create trigger brands_touch_variants
after update of name on public.brands
for each row execute function public.touch_variants_on_brand_rename();

-- Fast, typo/partial-match-tolerant search.
create index master_material_variants_search_trgm
  on public.master_material_variants using gin (search_text gin_trgm_ops);

-- ============================================================
-- 4. Supplier materials: add low-stock threshold, repoint the catalog
--    link at the new variants table, and drop the old flat table.
-- ============================================================

alter table public.materials add column low_stock_threshold numeric(12, 2);

alter table public.materials
  drop constraint if exists materials_master_material_id_fkey;

-- The only existing master_materials row is test data from Phase 2
-- development — nothing production depends on it. Null out any dangling
-- reference so the supplier keeps their own material (name/price/stock)
-- fully intact, just unlinked from the (now-removed) old catalog table.
update public.materials set master_material_id = null;

alter table public.materials
  add constraint materials_master_material_id_fkey
  foreign key (master_material_id) references public.master_material_variants (id) on delete set null;

drop table public.master_materials;
