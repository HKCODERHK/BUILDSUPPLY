-- BuildSupply — Master Catalog seed data
-- Run this in the Supabase SQL editor AFTER 004_master_catalog.sql.
-- Safe to run more than once — every insert is keyed to a natural unique
-- constraint (slug, or the type+brand+attributes combo) with ON CONFLICT
-- DO NOTHING, so re-running never creates duplicates.

-- ============================================================
-- 1. Categories
-- ============================================================

insert into public.material_categories (name, slug) values
  ('Sand', 'sand'),
  ('Metal / Gitti', 'metal-gitti'),
  ('Steel / TMT Rods', 'steel-tmt-rods'),
  ('Cement', 'cement')
on conflict (slug) do nothing;

-- ============================================================
-- 2. Material types (what the product fundamentally is)
-- ============================================================

insert into public.material_types (category_id, name, slug)
select (select id from public.material_categories where slug = 'sand'), t.name, t.slug
from (values
  ('River Sand', 'river-sand'),
  ('M-Sand', 'm-sand'),
  ('Plaster Sand', 'plaster-sand'),
  ('Manufactured Sand', 'manufactured-sand'),
  ('Other', 'sand-other')
) as t(name, slug)
on conflict (category_id, name) do nothing;

insert into public.material_types (category_id, name, slug)
select (select id from public.material_categories where slug = 'metal-gitti'), t.name, t.slug
from (values
  ('10mm Metal / Gitti', '10mm-metal-gitti'),
  ('20mm Metal / Gitti', '20mm-metal-gitti'),
  ('40mm Metal / Gitti', '40mm-metal-gitti'),
  ('Other', 'metal-gitti-other')
) as t(name, slug)
on conflict (category_id, name) do nothing;

insert into public.material_types (category_id, name, slug)
values ((select id from public.material_categories where slug = 'steel-tmt-rods'), 'TMT Rod', 'tmt-rod')
on conflict (category_id, name) do nothing;

insert into public.material_types (category_id, name, slug)
values ((select id from public.material_categories where slug = 'cement'), 'Cement', 'cement')
on conflict (category_id, name) do nothing;

-- ============================================================
-- 3. Brands (global — not scoped to a category)
-- ============================================================

do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'Tata Tiscon', 'JSW Steel', 'SAIL', 'Jindal Panther', 'Kamdhenu',
    'Vizag Steel / RINL', 'Shyam Steel', 'SRMB', 'Rashmi Steel', 'Maan Shakti',
    'Electrosteel', 'Jindal', 'Radha TMT', 'Agni Steels', 'Captain TMT', 'Other'
  ]
  loop
    insert into public.brands (name, slug)
    values (v_name, lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')))
    on conflict (slug) do nothing;
  end loop;
end $$;

do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'UltraTech', 'ACC', 'Ambuja', 'Dalmia', 'Shree Cement', 'JK Cement',
    'JK Lakshmi', 'Ramco', 'India Cements', 'Coromandel', 'Birla Corporation',
    'Orient Cement', 'Nuvoco', 'Mycem', 'Prism Cement', 'Wonder Cement',
    'Bangur', 'Sanghi Cement', 'JSW Cement', 'Zuari Cement', 'Chettinad Cement',
    'Deccan Cement', 'Star Cement', 'KCP Cement', 'Penna Cement', 'Priya Cement'
  ]
  loop
    insert into public.brands (name, slug)
    values (v_name, lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')))
    on conflict (slug) do nothing;
  end loop;
end $$;

-- ============================================================
-- 4. Variants — fully seeded for Sand and Metal/Gitti (the spec
--    enumerates every type x vehicle combination explicitly and the
--    count is small). Steel and Cement get NO pre-seeded variants —
--    the brands/types above give the admin's smart form its dropdown
--    data, but specific products (e.g. "Tata Tiscon 12mm Fe500D") are
--    added by the admin on demand, per "do not manually create
--    thousands of duplicate products".
-- ============================================================

do $$
declare
  v_type record;
  v_vehicle record;
begin
  for v_type in
    select id, name from public.material_types
    where category_id = (select id from public.material_categories where slug = 'sand')
      and name <> 'Other'
  loop
    for v_vehicle in
      select * from (values
        ('Tractor', null::int, 'Tractor Load'),
        ('Truck', 400, 'Truck – 400 CFT'),
        ('Truck', 600, 'Truck – 600 CFT')
      ) as v(vehicle, capacity_cft, label)
    loop
      insert into public.master_material_variants
        (material_type_id, name, attributes, unit)
      values (
        v_type.id,
        v_type.name || ' — ' || v_vehicle.label,
        case when v_vehicle.capacity_cft is null
          then jsonb_build_object('vehicle', v_vehicle.vehicle)
          else jsonb_build_object('vehicle', v_vehicle.vehicle, 'capacity_cft', v_vehicle.capacity_cft)
        end,
        'Load'
      )
      on conflict (material_type_id, brand_id, attributes) do nothing;
    end loop;
  end loop;
end $$;

do $$
declare
  v_type record;
  v_vehicle record;
begin
  for v_type in
    select id, name from public.material_types
    where category_id = (select id from public.material_categories where slug = 'metal-gitti')
      and name <> 'Other'
  loop
    for v_vehicle in
      select * from (values
        ('Tractor', null::int, 'Tractor Load'),
        ('Truck', 400, 'Truck – 400 CFT'),
        ('Truck', 600, 'Truck – 600 CFT')
      ) as v(vehicle, capacity_cft, label)
    loop
      insert into public.master_material_variants
        (material_type_id, name, attributes, unit)
      values (
        v_type.id,
        v_type.name || ' — ' || v_vehicle.label,
        case when v_vehicle.capacity_cft is null
          then jsonb_build_object('vehicle', v_vehicle.vehicle)
          else jsonb_build_object('vehicle', v_vehicle.vehicle, 'capacity_cft', v_vehicle.capacity_cft)
        end,
        'Load'
      )
      on conflict (material_type_id, brand_id, attributes) do nothing;
    end loop;
  end loop;
end $$;
