-- Checks for migration 050 (how a material is sold). Run only against a
-- throwaway local database built from schema.sql + 002→050, never live:
--   psql -U supabase_admin -f 050_selling_types_test.sql 2>&1 | grep -E 'PASS|FAIL'
-- Every check prints one PASS or FAIL line.

\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-4000-8000-000000000050'''
\set B '''bbbbbbbb-0000-4000-8000-000000000050'''

-- ── Fixtures: two shops, one customer ───────────────────────────────────
insert into auth.users (id, email, aud, role) values
  (:A, 'shop-a-050@test.local', 'authenticated', 'authenticated'),
  (:B, 'shop-b-050@test.local', 'authenticated', 'authenticated')
on conflict (id) do nothing;
insert into public.suppliers (id, business_name, plan, order_link, ordering_enabled, order_show_prices) values
  (:A, 'Shop A 050', 'pro', 'shop-a-050', true, true),
  (:B, 'Shop B 050', 'pro', 'shop-b-050', true, true)
on conflict (id) do nothing;
insert into public.customers (supplier_id, name, phone) values (:A, 'Customer 050', '9800000050');

select set_config('t.a', :A, false), set_config('t.b', :B, false);

-- ── 1. The supplier writes a vehicle listing and direct-sale products ───
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :A, 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', :A, true);
insert into public.materials (supplier_id, name, category, rate, unit_label, stock_unit, sold_by, listing_name, vehicle, capacity, capacity_unit, delivery_charge, available)
values
  (:A, 'River Sand — Tractor • 100 CFT', 'Sand', 5000, 'Load', 'Load', 'vehicle', 'River Sand', 'Tractor', 100, 'CFT', 300, true),
  (:A, 'River Sand — Truck • 800 CFT', 'Sand', 20000, 'Load', 'Load', 'vehicle', 'River Sand', 'Truck', 800, 'CFT', 500, true),
  (:A, 'River Sand — Large truck • 1,600 CFT', 'Sand', 38000, 'Load', 'Load', 'vehicle', 'River Sand', 'Large truck', 1600, 'CFT', null, false);
insert into public.materials (supplier_id, name, category, rate, unit_label, sold_by, min_qty, qty_step)
values
  (:A, 'Cement — UltraTech — PPC • 50 KG', 'Cement', 350, 'Bag', 'unit', 10, 5),
  (:A, 'TMT Rod — 12mm • Fe500D • 12m', 'Steel', 700, 'Piece', 'unit', null, null),
  (:A, 'Red brick', 'Bricks', 8, 'Piece', 'unit', 500, 500);
-- A material from before 050: nothing set.
insert into public.materials (supplier_id, name, rate, unit_label) values (:A, 'Old gitti', 9000, 'Load');
commit;

select case when count(*) = 7 then 'PASS 01 supplier saved 3 vehicle options and 4 other materials'
            else 'FAIL 01 expected 7 materials, got ' || count(*) end
  from public.materials where supplier_id = :A;

select set_config('t.tractor', id::text, false) from public.materials where supplier_id = :A and vehicle = 'Tractor';
select set_config('t.truck', id::text, false) from public.materials where supplier_id = :A and capacity = 800;
select set_config('t.large', id::text, false) from public.materials where supplier_id = :A and capacity = 1600;
select set_config('t.cement', id::text, false) from public.materials where supplier_id = :A and name like 'Cement%';
select set_config('t.steel', id::text, false) from public.materials where supplier_id = :A and name like 'TMT%';
select set_config('t.brick', id::text, false) from public.materials where supplier_id = :A and name = 'Red brick';
select set_config('t.old', id::text, false) from public.materials where supplier_id = :A and name = 'Old gitti';

-- ── 2. What a vehicle option must say ──────────────────────────────────
do $$ begin
  begin
    insert into public.materials (supplier_id, name, rate, sold_by, listing_name, vehicle, capacity, capacity_unit)
    values (current_setting('t.a')::uuid, 'dup', 1, 'vehicle', 'river sand ', 'TRUCK', 800, 'cft');
    raise notice 'FAIL 02 the same vehicle and capacity was accepted twice';
  exception when unique_violation then raise notice 'PASS 02 the same vehicle and capacity is refused (any case/spacing)';
  end;
  begin
    insert into public.materials (supplier_id, name, rate, sold_by, listing_name, vehicle)
    values (current_setting('t.a')::uuid, 'no cap', 1, 'vehicle', 'Gravel', 'Truck');
    raise notice 'FAIL 03 a vehicle option without a capacity was accepted';
  exception when check_violation then raise notice 'PASS 03 a vehicle option needs a capacity and its unit';
  end;
  begin
    insert into public.materials (supplier_id, name, rate, sold_by, listing_name, vehicle, capacity, capacity_unit)
    values (current_setting('t.a')::uuid, 'zero', 1, 'vehicle', 'Gravel', 'Truck', 0, 'CFT');
    raise notice 'FAIL 04 a zero capacity was accepted';
  exception when check_violation then raise notice 'PASS 04 a capacity must be positive';
  end;
  begin
    update public.materials set sold_by = 'weight' where id = current_setting('t.old')::uuid;
    raise notice 'FAIL 05 an unknown selling type was accepted';
  exception when check_violation then raise notice 'PASS 05 only vehicle or unit';
  end;
  begin
    update public.materials set min_qty = -1 where id = current_setting('t.cement')::uuid;
    raise notice 'FAIL 06 a negative minimum was accepted';
  exception when check_violation then raise notice 'PASS 06 minimum, step and delivery must be positive';
  end;
end $$;

-- ── 3. Another shop cannot touch them ──────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :B, 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', :B, true);
do $$ declare n int; begin
  update public.materials set rate = 1, available = false where id = current_setting('t.truck')::uuid;
  get diagnostics n = row_count;
  raise notice '% 07 another shop updates % of shop A''s options', case when n = 0 then 'PASS' else 'FAIL' end, n;
  select count(*) into n from public.materials where supplier_id = current_setting('t.a')::uuid;
  raise notice '% 08 another shop reads % of shop A''s materials', case when n = 0 then 'PASS' else 'FAIL' end, n;
  begin
    insert into public.materials (supplier_id, name, rate) values (current_setting('t.a')::uuid, 'planted', 1);
    raise notice 'FAIL 09 another shop added a material to shop A';
  exception when insufficient_privilege then raise notice 'PASS 09 another shop cannot add to shop A';
  end;
end $$;
commit;

-- ── 4. The order page shows them ───────────────────────────────────────
begin;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ declare p jsonb; m jsonb; n int; begin
  p := public.order_page('shop-a-050');
  select x into m from jsonb_array_elements(p->'materials') x where x->>'id' = current_setting('t.truck');
  raise notice '% 10 order page: truck option is vehicle, 800 CFT, ₹20000, delivery 500',
    case when m->>'sold_by' = 'vehicle' and m->>'listing_name' = 'River Sand' and (m->>'capacity')::numeric = 800
              and m->>'capacity_unit' = 'CFT' and (m->>'price')::numeric = 20000 and (m->>'delivery_charge')::numeric = 500
              and (m->>'available')::boolean then 'PASS' else 'FAIL ' || m::text end;
  select x into m from jsonb_array_elements(p->'materials') x where x->>'id' = current_setting('t.large');
  raise notice '% 11 order page: a switched-off option is listed as not available',
    case when (m->>'available')::boolean = false then 'PASS' else 'FAIL' end;
  select x into m from jsonb_array_elements(p->'materials') x where x->>'id' = current_setting('t.cement');
  raise notice '% 12 order page: cement is by unit, Bag, min 10, step 5',
    case when m->>'sold_by' = 'unit' and m->>'unit' = 'Bag' and (m->>'min_qty')::numeric = 10 and (m->>'qty_step')::numeric = 5
              and m->>'capacity' is null then 'PASS' else 'FAIL ' || m::text end;
  select x into m from jsonb_array_elements(p->'materials') x where x->>'id' = current_setting('t.old');
  raise notice '% 13 order page: a material from before 050 reads exactly as before',
    case when m->>'sold_by' is null and m->>'unit' = 'Load' and (m->>'price')::numeric = 9000 and (m->>'available')::boolean
         then 'PASS' else 'FAIL ' || m::text end;
  select count(*) into n from jsonb_array_elements(p->'materials');
  raise notice '% 14 order page lists all 7 of shop A''s materials and none of shop B''s', case when n = 7 then 'PASS' else 'FAIL ' || n end;
end $$;
commit;

-- ── 5. Placing an order ────────────────────────────────────────────────
begin;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ declare r jsonb; begin
  -- Sand 2 loads of 800 CFT, 20 bags of cement, 50 rods — and a price the
  -- customer made up, which must not be kept.
  r := public.place_order('shop-a-050', gen_random_uuid(), 'Ravi Kumar', '9876500001', 'Plot 7', null, null,
         jsonb_build_array(
           jsonb_build_object('material_id', current_setting('t.truck'), 'qty', '2', 'rate', '1'),
           jsonb_build_object('material_id', current_setting('t.cement'), 'qty', '20'),
           jsonb_build_object('material_id', current_setting('t.steel'), 'qty', '50')));
  raise notice '% 15 sand + cement + steel order placed', case when (r->>'ok')::boolean and r->>'token' is not null then 'PASS' else 'FAIL ' || r::text end;
  perform set_config('t.token', r->>'token', false);
end $$;
commit;

select case when (i->>'qty')::numeric = 2 and i->>'unit' = 'Load' and (i->>'capacity')::numeric = 800
                 and i->>'capacity_unit' = 'CFT' and i->>'vehicle' = 'Truck' and i->>'listing_name' = 'River Sand'
                 and i->>'name' = 'River Sand — Truck • 800 CFT' and not (i ? 'rate') and not (i ? 'price')
            then 'PASS 16 the sand line keeps 2 loads × Truck 800 CFT, and no price'
            else 'FAIL 16 ' || i::text end
  from public.order_requests o, jsonb_array_elements(o.items) i
 where o.public_token = current_setting('t.token') and i->>'material_id' = current_setting('t.truck');
select case when (i->>'qty')::numeric = 20 and i->>'unit' = 'Bag' and not (i ? 'capacity')
            then 'PASS 17 the cement line keeps 20 Bag' else 'FAIL 17 ' || i::text end
  from public.order_requests o, jsonb_array_elements(o.items) i
 where o.public_token = current_setting('t.token') and i->>'material_id' = current_setting('t.cement');
select case when (i->>'qty')::numeric = 50 and i->>'unit' = 'Piece'
            then 'PASS 18 the steel line keeps 50 Piece' else 'FAIL 18 ' || i::text end
  from public.order_requests o, jsonb_array_elements(o.items) i
 where o.public_token = current_setting('t.token') and i->>'material_id' = current_setting('t.steel');

-- ── 6. What placing an order refuses ───────────────────────────────────
select count(*) as before from public.order_requests where supplier_id = :A \gset
begin;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$
declare
  cases jsonb := jsonb_build_array(
    jsonb_build_array('19 a part load (1.5)', 'how the shop sells it', current_setting('t.truck'), '1.5'),
    jsonb_build_array('20 a switched-off vehicle', 'not available right now', current_setting('t.large'), '1'),
    jsonb_build_array('21 cement below the minimum (7 of 10)', 'how the shop sells it', current_setting('t.cement'), '7'),
    jsonb_build_array('22 cement off its steps (12, steps of 5)', 'how the shop sells it', current_setting('t.cement'), '12'),
    jsonb_build_array('23 bricks off their steps (750, steps of 500)', 'how the shop sells it', current_setting('t.brick'), '750'));
  c jsonb;
begin
  for c in select * from jsonb_array_elements(cases) loop
    begin
      perform public.place_order('shop-a-050', gen_random_uuid(), 'Ravi Kumar', '9876500002', null, null, null,
                jsonb_build_array(jsonb_build_object('material_id', c->>2, 'qty', c->>3)));
      raise notice 'FAIL % was accepted', c->>0;
    exception when raise_exception then
      if sqlerrm ilike '%' || (c->>1) || '%' then raise notice 'PASS % is refused', c->>0;
      else raise notice 'FAIL % refused with the wrong words: %', c->>0, sqlerrm; end if;
    end;
  end loop;
end $$;
commit;
select case when count(*) = :before then 'PASS 24 a refused order keeps nothing' else 'FAIL 24 refused orders were kept' end
  from public.order_requests where supplier_id = :A;

begin;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ declare r jsonb; begin
  r := public.place_order('shop-a-050', gen_random_uuid(), 'Ravi Kumar', '9876500003', null, null, null,
         jsonb_build_array(
           jsonb_build_object('material_id', current_setting('t.cement'), 'qty', '15'),
           jsonb_build_object('material_id', current_setting('t.brick'), 'qty', '1000'),
           jsonb_build_object('material_id', current_setting('t.tractor'), 'qty', '3')));
  raise notice '% 25 cement 15 (min 10, steps of 5), bricks 1000, tractor 3 loads accepted',
    case when (r->>'ok')::boolean then 'PASS' else 'FAIL' end;
  r := public.place_order('shop-a-050', gen_random_uuid(), 'Ravi Kumar', '9876500004', null, null, null,
         jsonb_build_array(jsonb_build_object('material_id', current_setting('t.old'), 'qty', '1.5')));
  raise notice '% 26 a material from before 050 still takes 1.5 as before', case when (r->>'ok')::boolean then 'PASS' else 'FAIL' end;
  r := public.place_order('shop-b-050', gen_random_uuid(), 'Ravi Kumar', '9876500005', null, null, null,
         jsonb_build_array(jsonb_build_object('material_id', current_setting('t.truck'), 'qty', '1')));
  raise notice 'FAIL 27 shop A''s material was ordered from shop B';
exception when raise_exception then
  raise notice '% 27 shop A''s material cannot be ordered from shop B (%)', case when sqlerrm ilike '%at least one material%' then 'PASS' else 'FAIL' end, sqlerrm;
end $$;
commit;

-- ── 7. History: the order keeps what one load was ──────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :A, 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', :A, true);
update public.materials set capacity = 900, rate = 22000, name = 'River Sand — Truck • 900 CFT'
 where id = current_setting('t.truck')::uuid;
commit;
select case when (i->>'capacity')::numeric = 800 and i->>'name' = 'River Sand — Truck • 800 CFT'
            then 'PASS 28 after the shop changes the truck to 900 CFT, the order still says 800'
            else 'FAIL 28 ' || i::text end
  from public.order_requests o, jsonb_array_elements(o.items) i
 where o.public_token = current_setting('t.token') and i->>'material_id' = current_setting('t.truck');

-- ── 8. A bill from a vehicle option keeps its words ────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :A, 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', :A, true);
select set_config('t.bill', (public.create_invoice(
  gen_random_uuid(), (select id from public.customers where phone = '9800000050'), 'Plot 7',
  jsonb_build_array(jsonb_build_object('material_id', current_setting('t.truck'), 'description', 'River Sand — Truck • 900 CFT', 'qty', 2, 'rate', 22000)),
  false, 1000, '[]'::jsonb, null)->>'id'), false);
commit;
select case when count(*) = 1 and min(i.description) = 'River Sand — Truck • 900 CFT' and min(i.qty) = 2 and min(i.amount) = 44000
             and min(v.total) = 45000 and min(v.transport_labour_charge) = 1000
            then 'PASS 29 a bill of 2 loads: line 44,000, delivery 1,000 apart, total 45,000'
            else 'FAIL 29 ' || count(*) || ' ' || coalesce(min(v.total)::text, '-') end
  from public.invoice_items i join public.invoices v on v.id = i.invoice_id
 where i.material_id = current_setting('t.truck')::uuid;
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :A, 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', :A, true);
update public.materials set capacity = 1000, rate = 25000, name = 'River Sand — Truck • 1,000 CFT'
 where id = current_setting('t.truck')::uuid;
commit;
select case when min(i.description) = 'River Sand — Truck • 900 CFT' and min(i.rate) = 22000
            then 'PASS 30 changing the option again leaves the bill line as it was billed'
            else 'FAIL 30' end
  from public.invoice_items i where i.material_id = current_setting('t.truck')::uuid;

-- ── 9. Prices stay private when the shop hides them ────────────────────
update public.suppliers set order_show_prices = false where id = :A;
begin;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ declare m jsonb; begin
  select x into m from jsonb_array_elements(public.order_page('shop-a-050')->'materials') x where x->>'id' = current_setting('t.truck');
  raise notice '% 31 prices hidden: no price and no delivery charge, capacity still shown',
    case when m->>'price' is null and m->>'delivery_charge' is null and (m->>'capacity')::numeric = 1000 then 'PASS' else 'FAIL ' || m::text end;
end $$;
commit;
update public.suppliers set order_show_prices = true where id = :A;

-- ── 10. Signed out, the table stays shut ───────────────────────────────
begin;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ declare n int; begin
  select count(*) into n from public.materials;
  raise notice '% 32 signed out reads % materials', case when n = 0 then 'PASS' else 'FAIL' end, n;
exception when insufficient_privilege then raise notice 'PASS 32 signed out cannot read materials at all';
end $$;
commit;

-- ── 11. Both functions keep their grants and their security ────────────
select case when count(*) = 2 and bool_and(p.prosecdef) and bool_and(has_function_privilege('anon', p.oid, 'execute'))
            then 'PASS 33 order_page and place_order: one version each, security definer, callable by the public'
            else 'FAIL 33' end
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('order_page', 'place_order');

-- Leave nothing behind (a throwaway database, but tidy all the same).
delete from public.suppliers where id in (:A, :B);
delete from auth.users where id in (:A, :B);
