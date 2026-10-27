-- Checks for migrations 052 (audit fixes) and 053 (money write guard). Run
-- only against a throwaway local database built from schema.sql + 002→053,
-- never live:
--   psql -U postgres -f 052_audit_fixes_test.sql 2>&1 | grep -E 'PASS|FAIL'
-- Every check prints one PASS or FAIL line. Errors printed by the F-05
-- section are expected: those statements are meant to be refused, and the
-- check after each one looks at what is in the table.

\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

\set A '''aaaaaaaa-0000-4000-8000-000000000052'''
\set B '''bbbbbbbb-0000-4000-8000-000000000052'''
\set X '''eeeeeeee-0000-4000-8000-000000000052'''
\set U '''cccccccc-0000-4000-8000-000000000052'''
\set P '''dddddddd-0000-4000-8000-000000000052'''
\set Z '''ffffffff-0000-4000-8000-000000000052'''
\set C1 '''c1000000-0000-4000-8000-000000000052'''
\set C2 '''c2000000-0000-4000-8000-000000000052'''
\set C3 '''c3000000-0000-4000-8000-000000000052'''
\set C4 '''c4000000-0000-4000-8000-000000000052'''
\set CB '''cb000000-0000-4000-8000-000000000052'''

\set asA 'set local role authenticated; set local request.jwt.claim.sub = ''aaaaaaaa-0000-4000-8000-000000000052''; set local request.jwt.claims = ''{"sub":"aaaaaaaa-0000-4000-8000-000000000052","role":"authenticated"}'';'
\set asB 'set local role authenticated; set local request.jwt.claim.sub = ''bbbbbbbb-0000-4000-8000-000000000052''; set local request.jwt.claims = ''{"sub":"bbbbbbbb-0000-4000-8000-000000000052","role":"authenticated"}'';'
\set asX 'set local role authenticated; set local request.jwt.claim.sub = ''eeeeeeee-0000-4000-8000-000000000052''; set local request.jwt.claims = ''{"sub":"eeeeeeee-0000-4000-8000-000000000052","role":"authenticated"}'';'
\set asU 'set local role authenticated; set local request.jwt.claim.sub = ''cccccccc-0000-4000-8000-000000000052''; set local request.jwt.claims = ''{"sub":"cccccccc-0000-4000-8000-000000000052","role":"authenticated"}'';'
\set asP 'set local role authenticated; set local request.jwt.claim.sub = ''dddddddd-0000-4000-8000-000000000052''; set local request.jwt.claims = ''{"sub":"dddddddd-0000-4000-8000-000000000052","role":"authenticated"}'';'
\set asZ 'set local role authenticated; set local request.jwt.claim.sub = ''ffffffff-0000-4000-8000-000000000052''; set local request.jwt.claims = ''{"sub":"ffffffff-0000-4000-8000-000000000052","role":"authenticated"}'';'
\set asAnon 'set local role anon; set local request.jwt.claim.sub = ''''; set local request.jwt.claims = '''';'

-- No pings from a test copy.
update public.platform_settings set push_function_url = null;

-- A helper that runs one statement and reports whether it failed as
-- expected. Its statement runs inside a function, so it is NOT used for the
-- F-05 checks (the guard lets function-made writes through, by design).
create schema if not exists t052;
grant usage on schema t052 to authenticated, anon;
create or replace function t052.expect_error(p_sql text, p_pattern text, p_label text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return 'FAIL ' || p_label || ' (no error)';
exception when others then
  if sqlerrm ilike p_pattern then return 'PASS ' || p_label; end if;
  return 'FAIL ' || p_label || ' (' || sqlerrm || ')';
end $$;
grant execute on function t052.expect_error(text, text, text) to authenticated, anon;

-- ── Fixtures ────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role, is_anonymous) values
  (:A, 'shop-a-052@test.local', 'authenticated', 'authenticated', false),
  (:B, 'shop-b-052@test.local', 'authenticated', 'authenticated', false),
  (:X, 'admin-052@test.local', 'authenticated', 'authenticated', false),
  (:U, null, 'authenticated', 'authenticated', true),
  (:P, 'applicant-052@test.local', 'authenticated', 'authenticated', false),
  (:Z, 'shop-z-052@test.local', 'authenticated', 'authenticated', false)
on conflict (id) do nothing;
insert into public.suppliers (id, business_name, plan, order_link, ordering_enabled, order_show_prices, upi_id, khata_upi_enabled) values
  (:A, 'Shop A 052', 'pro', 'shop-a-052', true, true, 'shopa052@okicici', true),
  (:B, 'Shop B 052', 'pro', 'shop-b-052', true, true, null, false),
  (:Z, 'Shop Z 052', 'pro', 'shop-z-052', false, false, null, false);
insert into public.suppliers (id, business_name, role) values (:X, 'Admin 052', 'admin');
insert into public.customers (id, supplier_id, name, phone, khata_token) values
  (:C1, :A, 'Ravi 052', '9800000521', 'aaaa0000bbbb1111cccc2222dddd0052'),
  (:C2, :A, 'Meena 052', '9800000522', null),
  (:C3, :A, 'Kiran 052', '9800000523', null),
  (:C4, :A, 'Added by mistake 052', '9800000524', null),
  (:CB, :B, 'Other shop 052', '9800000529', null),
  ('cf000000-0000-4000-8000-000000000052', :Z, 'Z customer 052', '9800000520', null);
insert into public.materials (id, supplier_id, name, rate, gst_rate, unit_label, stock_qty, stock_unit, delivery_charge, available) values
  ('a1000000-0000-4000-8000-000000000052', :A, 'Cement 052', 400, 18, 'Bag', 100, 'Bag', 0, true),
  ('a2000000-0000-4000-8000-000000000052', :A, 'Sand 052', 1000, 5, 'Brass', 50, 'Brass', 0, true),
  ('a3000000-0000-4000-8000-000000000052', :A, 'Steel 052', 100, 18, 'Kg', 500, 'Kg', 0, true),
  ('a4000000-0000-4000-8000-000000000052', :A, 'Brick 052', 10, 5, 'Piece', 0, 'Piece', 0, false),
  ('af000000-0000-4000-8000-000000000052', :Z, 'Z cement 052', 400, 18, 'Bag', 10, 'Bag', 0, true);

-- ── F-01 · correcting a payment ─────────────────────────────────────────

-- A ₹10,000 bill, and ₹50,000 typed for ₹5,000.
begin; :asA
select (public.create_invoice('52000000-0000-4000-8000-000000000001', :C1, 'Site 1',
  $j$[{"material_id":"a1000000-0000-4000-8000-000000000052","description":"Cement 052","qty":25,"rate":400}]$j$::jsonb,
  false, 0, null, null)->'invoice'->>'id') as inv1 \gset
select public.record_customer_payment('52000000-0000-4000-8000-000000000002', :C1, 50000, 'Cash') is not null as ok \gset
commit;
select id as pay1 from public.payments where customer_id = :C1 and amount = 50000 \gset

select case when i.paid = 10000 and i.status = 'Paid' and cb.advance = 40000 and cb.pending = 0
            then 'PASS 01 the mistyped ₹50,000 paid the bill and left ₹40,000 advance'
            else 'FAIL 01 paid=' || i.paid || ' advance=' || cb.advance end
  from public.invoices i, public.customer_balances cb where i.id = :'inv1' and cb.customer_id = :C1;

-- Corrected to ₹5,000.
begin; :asA
select public.correct_payment('52000000-0000-4000-8000-000000000003', :'pay1', 'Typed 50000 instead of 5000', 5000, null) as r1 \gset
commit;

select case when i.paid = 5000 and i.status = 'Partial' and cb.pending = 5000 and cb.advance = 0
            then 'PASS 02 after the correction the bill shows ₹5,000 paid, ₹5,000 due, no advance'
            else 'FAIL 02 paid=' || i.paid || ' status=' || i.status || ' pending=' || cb.pending || ' advance=' || cb.advance end
  from public.invoices i, public.customer_balances cb where i.id = :'inv1' and cb.customer_id = :C1;

select case when count(*) = 3
             and count(*) filter (where id = :'pay1' and amount = 50000 and corrects_payment_id is null) = 1
             and count(*) filter (where amount = 5000 and corrects_payment_id = :'pay1' and correction_reason = 'Typed 50000 instead of 5000') = 1
             and count(*) filter (where amount = -50000 and corrects_payment_id = :'pay1' and mode = 'Cash') = 1
            then 'PASS 03 the wrong entry stays; a reversal and the right amount are added beside it'
            else 'FAIL 03 rows=' || count(*) end
  from public.payments where customer_id = :C1;

select case when count(*) filter (where released_at is null) = 0 and count(*) filter (where released_reason = 'Payment corrected') >= 1
            then 'PASS 04 the wrong entry is no longer on any bill (released, not deleted)'
            else 'FAIL 04' end
  from public.payment_allocations where payment_id = :'pay1';

select case when (:'r1'::jsonb->>'reversed')::numeric = 50000 and (:'r1'::jsonb->>'corrected_to')::numeric = 5000
             and (:'r1'::jsonb->>'pending')::numeric = 5000 and (:'r1'::jsonb->>'advance_balance')::numeric = 0
            then 'PASS 05 the answer quotes the figures straight after the correction'
            else 'FAIL 05 ' || :'r1' end;

select case when total_collected = 5000 then 'PASS 06 the dashboard''s collected figure is ₹5,000'
            else 'FAIL 06 collected=' || total_collected end
  from public.dashboard_totals where supplier_id = :A;

select case when count(*) filter (where kind = 'payment_corrected') = 1
             and count(*) filter (where kind = 'payment_received') = 1
             and min(text->'en'->>'t') filter (where kind = 'payment_corrected') = 'Shop A 052 corrected a payment entry'
             and min(text->'en'->>'b') filter (where kind = 'payment_corrected') = '₹50,000 → ₹5,000'
             and min(text->'hi'->>'t') filter (where kind = 'payment_corrected') like 'Shop A 052 ने%'
            then 'PASS 07 the customer gets one correction alert and no second "received"'
            else 'FAIL 07 corrected=' || count(*) filter (where kind = 'payment_corrected')
                 || ' received=' || count(*) filter (where kind = 'payment_received') end
  from public.notifications where customer_id = :C1;

-- The same request again (a double tap, a retry after a lost answer).
begin; :asA
select public.correct_payment('52000000-0000-4000-8000-000000000003', :'pay1', 'Typed 50000 instead of 5000', 5000, null) as r1b \gset
commit;
select case when (:'r1b'::jsonb->>'duplicate')::boolean and (select count(*) from public.payments where customer_id = :C1) = 3
            then 'PASS 08 the same correction sent twice is recorded once'
            else 'FAIL 08 ' || :'r1b' end;

select id as rev1 from public.payments where corrects_payment_id = :'pay1' and amount < 0 \gset
select id as rep1 from public.payments where corrects_payment_id = :'pay1' and amount > 0 \gset

begin; :asA
select t052.expect_error(format('select public.correct_payment(%L, %L, %L, 5000, null)',
  '52000000-0000-4000-8000-000000000004', :'pay1', 'Again'), '%already been corrected%', '09 an entry can be corrected only once');
select t052.expect_error(format('select public.correct_payment(%L, %L, %L, null, null)',
  '52000000-0000-4000-8000-000000000005', :'rev1', 'Undo the undo'), '%correction itself%', '10 a reversal can''t be corrected');
select t052.expect_error(format('select public.correct_payment(%L, %L, %L, null, null)',
  '52000000-0000-4000-8000-000000000006', :'rep1', '  '), '%few words%', '11 a reason is required');
select t052.expect_error(format('select public.correct_payment(%L, %L, %L, 5000, %L)',
  '52000000-0000-4000-8000-000000000007', :'rep1', 'Same again', 'Cash'), '%nothing to correct%', '12 the same amount and mode is refused');
select t052.expect_error(format('select public.correct_payment(%L, %L, %L, -10, null)',
  '52000000-0000-4000-8000-000000000008', :'rep1', 'Negative'), '%negative%', '13 a negative right amount is refused');
commit;

-- The ₹5,000 was a mistake too: reversed outright.
begin; :asA
select public.correct_payment('52000000-0000-4000-8000-000000000009', :'rep1', 'Customer has not paid yet', null, null) is not null as ok \gset
commit;
select case when i.paid = 0 and i.status = 'Unpaid' and cb.pending = 10000 and cb.advance = 0
             and (select sum(amount) from public.payments where customer_id = :C1) = 0
            then 'PASS 14 a corrected entry can itself be reversed; the khata is back to ₹10,000 due'
            else 'FAIL 14 paid=' || i.paid || ' pending=' || cb.pending || ' advance=' || cb.advance end
  from public.invoices i, public.customer_balances cb where i.id = :'inv1' and cb.customer_id = :C1;
select case when count(*) = 1 then 'PASS 15 the alert for a cancelled entry says so'
            else 'FAIL 15 ' || count(*) end
  from public.notifications where customer_id = :C1 and kind = 'payment_corrected' and text->'en'->>'b' = '₹5,000 entry cancelled';

-- An advance for the next bill, used by a bill, then corrected.
begin; :asA
select public.record_advance('52000000-0000-4000-8000-000000000010', :C2, 3000, 'UPI') is not null as ok \gset
commit;
-- A separate save, as in the app: an advance only pays bills made after it.
begin; :asA
select (public.create_invoice('52000000-0000-4000-8000-000000000011', :C2, 'Site 2',
  $j$[{"material_id":"a3000000-0000-4000-8000-000000000052","description":"Steel 052","qty":20,"rate":100}]$j$::jsonb,
  false, 0, null, null)->'invoice'->>'id') as inv2 \gset
commit;
select id as adv1 from public.payments where customer_id = :C2 and is_advance and amount = 3000 \gset
select case when i.paid = 2000 and cb.advance = 1000 then 'PASS 16 the ₹3,000 advance paid the new ₹2,000 bill'
            else 'FAIL 16 paid=' || i.paid || ' advance=' || cb.advance end
  from public.invoices i, public.customer_balances cb where i.id = :'inv2' and cb.customer_id = :C2;
begin; :asA
select public.correct_payment('52000000-0000-4000-8000-000000000012', :'adv1', 'It was 1500, not 3000', 1500, null) is not null as ok \gset
commit;
select case when i.paid = 1500 and i.status = 'Partial' and cb.advance = 0 and cb.pending = 500
             and (select is_advance from public.payments where corrects_payment_id = :'adv1' and amount > 0)
            then 'PASS 17 the right advance goes onto the same bill; ₹500 still due, nothing left over'
            else 'FAIL 17 paid=' || i.paid || ' advance=' || cb.advance || ' pending=' || cb.pending end
  from public.invoices i, public.customer_balances cb where i.id = :'inv2' and cb.customer_id = :C2;

-- Cash + UPI at the counter; the UPI part was never received.
begin; :asA
select (public.create_invoice('52000000-0000-4000-8000-000000000013', :C3, 'Site 3',
  $j$[{"material_id":"a2000000-0000-4000-8000-000000000052","description":"Sand 052","qty":6,"rate":1000}]$j$::jsonb,
  false, 0, $j$[{"amount":5000,"mode":"Cash"},{"amount":1000,"mode":"UPI"}]$j$::jsonb, null)->'invoice'->>'id') as inv3 \gset
commit;
select id as upi3 from public.payments where customer_id = :C3 and mode = 'UPI' and amount = 1000 \gset
begin; :asA
select public.correct_payment('52000000-0000-4000-8000-000000000014', :'upi3', 'UPI never came through', null, null) is not null as ok \gset
commit;
select case when i.paid = 5000 and i.status = 'Partial'
             and (select count(*) from public.payment_allocations a join public.payments p on p.id = a.payment_id
                   where a.invoice_id = :'inv3' and a.released_at is null and p.mode = 'Cash') = 1
            then 'PASS 18 one part of a split payment can be taken back; the cash part stays on the bill'
            else 'FAIL 18 paid=' || i.paid end
  from public.invoices i where i.id = :'inv3';

-- A payment on a bill that is then cancelled, then found to be a mistake.
begin; :asA
select (public.create_invoice('52000000-0000-4000-8000-000000000015', :C3, 'Site 3',
  $j$[{"material_id":"a1000000-0000-4000-8000-000000000052","description":"Cement 052","qty":2,"rate":400}]$j$::jsonb,
  false, 0, null, null)->'invoice'->>'id') as inv4 \gset
select public.record_payment('52000000-0000-4000-8000-000000000016', :'inv4', $j$[{"amount":800,"mode":"Cash"}]$j$::jsonb) is not null as ok \gset
select public.cancel_invoice(:'inv4') is not null as ok \gset
commit;
select id as pay4 from public.payments where customer_id = :C3 and amount = 800 \gset
begin; :asA
select public.correct_payment('52000000-0000-4000-8000-000000000017', :'pay4', 'Entered on the wrong customer', null, null) is not null as ok \gset
commit;
select case when cb.pending = 1000 and cb.advance = 0
            then 'PASS 19 money freed by a cancelled bill, then reversed, leaves only the real ₹1,000 due'
            else 'FAIL 19 pending=' || cb.pending || ' advance=' || cb.advance end
  from public.customer_balances cb where cb.customer_id = :C3;

-- Nobody but the shop itself can correct its payments.
select id as cashpay3 from public.payments where customer_id = :C3 and mode = 'Cash' and amount = 5000 \gset
begin; :asB
select t052.expect_error(format('select public.correct_payment(%L, %L, %L, null, null)',
  '52000000-0000-4000-8000-000000000018', :'cashpay3', 'Not mine'), '%Payment not found%', '20 another shop can''t correct this shop''s payment');
commit;
begin; :asX
select t052.expect_error(format('select public.correct_payment(%L, %L, %L, null, null)',
  '52000000-0000-4000-8000-000000000019', :'cashpay3', 'Admin'), '%shop''s own login%', '21 the admin can''t correct a shop''s payment');
commit;
begin; :asU
select t052.expect_error(format('select public.correct_payment(%L, %L, %L, null, null)',
  '52000000-0000-4000-8000-000000000020', :'cashpay3', 'Customer'), '%shop''s own login%', '22 a customer''s login can''t correct a payment');
commit;
begin; :asAnon
select t052.expect_error(format('select public.correct_payment(%L, %L, %L, null, null)',
  '52000000-0000-4000-8000-000000000021', :'cashpay3', 'Anon'), '%permission denied%', '23 signed out, the function can''t even be called');
commit;

-- What the customer's khata link shows.
begin; :asAnon
select public.customer_khata('aaaa0000bbbb1111cccc2222dddd0052') as k1 \gset
commit;
select case when jsonb_array_length(k->'payments') = 4
             and (select count(*) from jsonb_array_elements(k->'payments') p where (p->>'reversal')::boolean) = 2
             and (select count(*) from jsonb_array_elements(k->'payments') p where (p->>'reversed')::boolean) = 2
             and (select count(*) from jsonb_array_elements(k->'payments') p where (p->>'correction')::boolean) = 1
             and (select sum((p->>'amount')::numeric) from jsonb_array_elements(k->'payments') p) = 0
             and (select count(*) from jsonb_array_elements(k->'payments') p where p->>'reason' is not null) = 3
             and (k->>'pending')::numeric = 10000 and (k->>'advance')::numeric = 0
            then 'PASS 24 the khata link marks reversals, reversed and corrected entries, with reasons'
            else 'FAIL 24 ' || (k->'payments')::text end
  from (select :'k1'::jsonb as k) x;

-- The commit-time backstops.
begin;
set constraints all immediate;
select t052.expect_error(format(
  'insert into public.payment_allocations (supplier_id, payment_id, invoice_id, amount) values (%L, %L, %L, 100)',
  'aaaaaaaa-0000-4000-8000-000000000052', :'pay1', :'inv1'), '%corrected can''t be put on a bill%', '25 money from a reversed entry can''t go onto a bill');
select t052.expect_error(format(
  'insert into public.payment_allocations (supplier_id, payment_id, invoice_id, amount) values (%L, %L, %L, 100)',
  'aaaaaaaa-0000-4000-8000-000000000052', :'rev1', :'inv1'), '%more than was received%', '26 a reversal can''t pay a bill');
select t052.expect_error(format(
  'insert into public.payments (supplier_id, customer_id, amount, mode) values (%L, %L, -5, %L)',
  'aaaaaaaa-0000-4000-8000-000000000052', 'c1000000-0000-4000-8000-000000000052', 'Cash'), '%payments_amount_sign%', '27 a negative payment must be a reversal');
select t052.expect_error(format(
  'insert into public.payments (supplier_id, customer_id, amount, mode, corrects_payment_id, correction_reason) values (%L, %L, -50000, %L, %L, %L)',
  'aaaaaaaa-0000-4000-8000-000000000052', 'c1000000-0000-4000-8000-000000000052', 'Cash', :'pay1', 'Second reversal'),
  '%payments_one_reversal%', '28 an entry can''t be reversed twice, even by hand');
rollback;

-- ── F-02 · an order never silently loses a line ─────────────────────────
begin; :asAnon
select t052.expect_error($q$select public.place_order('shop-a-052', '52000000-0000-4000-8000-000000000030', 'Ravi', '9811100001', null, null, null,
  '[{"material_id":"a1000000-0000-4000-8000-000000000052","qty":2},{"material_id":"99999999-0000-4000-8000-000000000052","qty":1}]'::jsonb)$q$,
  '%no longer sold%', '30 a material the shop no longer has is refused, not dropped');
select t052.expect_error($q$select public.place_order('shop-a-052', '52000000-0000-4000-8000-000000000031', 'Ravi', '9811100001', null, null, null,
  '[{"material_id":"a1000000-0000-4000-8000-000000000052","qty":1.555}]'::jsonb)$q$,
  '%could not be read%', '31 a quantity with three decimals is refused, not dropped');
select t052.expect_error($q$select public.place_order('shop-a-052', '52000000-0000-4000-8000-000000000032', 'Ravi', '9811100001', null, null, null,
  '[{"material_id":"a1000000-0000-4000-8000-000000000052","qty":100001}]'::jsonb)$q$,
  '%too large%', '32 a quantity over 1,00,000 is refused, not dropped');
select t052.expect_error($q$select public.place_order('shop-a-052', '52000000-0000-4000-8000-000000000033', 'Ravi', '9811100001', null, null, null,
  '[{"material_id":"a4000000-0000-4000-8000-000000000052","qty":10}]'::jsonb)$q$,
  '%not available right now%', '33 a switched-off material is still refused as before');
select public.place_order('shop-a-052', '52000000-0000-4000-8000-000000000034', 'Ravi', '9811100002', null, null, null,
  '[{"material_id":"a1000000-0000-4000-8000-000000000052","qty":2,"price":380}]'::jsonb) as o_stale \gset
select public.place_order('shop-a-052', '52000000-0000-4000-8000-000000000035', 'Ravi', '9811100003', null, null, null,
  '[{"material_id":"a1000000-0000-4000-8000-000000000052","qty":2,"price":400,"delivery":null}]'::jsonb) as o_fresh \gset
select public.place_order('shop-a-052', '52000000-0000-4000-8000-000000000036', 'Ravi', '9811100004', null, null, null,
  '[{"material_id":"a1000000-0000-4000-8000-000000000052","qty":2}]'::jsonb) as o_old \gset
commit;
select case when (:'o_stale'::jsonb->>'ok')::boolean = false and (:'o_stale'::jsonb->>'changed')::boolean
             and not exists (select 1 from public.order_requests where request_id = '52000000-0000-4000-8000-000000000034')
            then 'PASS 34 a page showing an old price is told, and nothing is kept'
            else 'FAIL 34 ' || :'o_stale' end;
select case when (:'o_fresh'::jsonb->>'ok')::boolean and :'o_fresh'::jsonb->>'token' is not null
             and (select (items->0->>'listed_price')::numeric from public.order_requests where request_id = '52000000-0000-4000-8000-000000000035') = 400
            then 'PASS 35 the current price goes through and is kept with the line'
            else 'FAIL 35 ' || :'o_fresh' end;
select case when (:'o_old'::jsonb->>'ok')::boolean and :'o_old'::jsonb->>'token' is not null
            then 'PASS 36 an older page that says nothing about prices still orders as before'
            else 'FAIL 36 ' || :'o_old' end;

update public.materials set delivery_charge = 200 where id = 'a1000000-0000-4000-8000-000000000052';
begin; :asAnon
select public.place_order('shop-a-052', '52000000-0000-4000-8000-000000000037', 'Ravi', '9811100005', null, null, null,
  '[{"material_id":"a1000000-0000-4000-8000-000000000052","qty":2,"price":400,"delivery":150}]'::jsonb) as o_deliv \gset
commit;
select case when (:'o_deliv'::jsonb->>'changed')::boolean then 'PASS 37 a changed delivery charge is caught too'
            else 'FAIL 37 ' || :'o_deliv' end;

-- Prices hidden: a page still showing a price is out of date; one showing
-- none is fine.
update public.suppliers set order_show_prices = false where id = :A;
begin; :asAnon
select public.place_order('shop-a-052', '52000000-0000-4000-8000-000000000038', 'Ravi', '9811100006', null, null, null,
  '[{"material_id":"a1000000-0000-4000-8000-000000000052","qty":2,"price":null,"delivery":null}]'::jsonb) as o_hidden \gset
select public.place_order('shop-a-052', '52000000-0000-4000-8000-000000000039', 'Ravi', '9811100007', null, null, null,
  '[{"material_id":"a1000000-0000-4000-8000-000000000052","qty":2,"price":400}]'::jsonb) as o_hidden_stale \gset
commit;
select case when (:'o_hidden'::jsonb->>'ok')::boolean
             and (select items->0->'listed_price' from public.order_requests where request_id = '52000000-0000-4000-8000-000000000038') = 'null'::jsonb
             and (:'o_hidden_stale'::jsonb->>'changed')::boolean
            then 'PASS 38 with prices hidden nothing is listed, and a page still showing them is told'
            else 'FAIL 38 ' || :'o_hidden' || ' / ' || :'o_hidden_stale' end;
update public.suppliers set order_show_prices = true where id = :A;
update public.materials set delivery_charge = 0 where id = 'a1000000-0000-4000-8000-000000000052';

-- A retry of an order that went through gets the same order back, even if
-- the price moved in between.
update public.materials set rate = 420 where id = 'a1000000-0000-4000-8000-000000000052';
begin; :asAnon
select public.place_order('shop-a-052', '52000000-0000-4000-8000-000000000035', 'Ravi', '9811100003', null, null, null,
  '[{"material_id":"a1000000-0000-4000-8000-000000000052","qty":2,"price":400}]'::jsonb) as o_retry \gset
commit;
select case when (:'o_retry'::jsonb->>'duplicate')::boolean and :'o_retry'::jsonb->>'token' = :'o_fresh'::jsonb->>'token'
            then 'PASS 39 a retry returns the order already placed' else 'FAIL 39 ' || :'o_retry' end;
update public.materials set rate = 400 where id = 'a1000000-0000-4000-8000-000000000052';

-- ── F-03 · estimates are valid until a date ─────────────────────────────
begin; :asA
select (public.create_quotation('52000000-0000-4000-8000-000000000040', :C2, 'Site 2',
  $j$[{"material_id":"a1000000-0000-4000-8000-000000000052","description":"Cement 052","qty":10,"rate":400}]$j$::jsonb,
  false, 0)->>'id') as q40 \gset
commit;
select case when valid_until = (now() at time zone 'Asia/Kolkata')::date + 15
            then 'PASS 40 a new estimate holds for 15 days' else 'FAIL 40 ' || coalesce(valid_until::text, 'null') end
  from public.quotations where id = :'q40';

-- An estimate saved before 052 has no date and never expires.
insert into public.quotations (id, supplier_id, quote_no, customer_id, status, subtotal, total, valid_until, created_at)
values ('9a000000-0000-4000-8000-000000000041', :A, 'EST-052-OLD', :C2, 'Sent', 1000, 1000, null, now() - interval '200 days');
select case when not public._estimate_expired(status, valid_until, null)
            then 'PASS 41 an estimate saved before this change never expires' else 'FAIL 41' end
  from public.quotations where id = '9a000000-0000-4000-8000-000000000041';

select case when public._estimate_expired('Sent', (now() at time zone 'Asia/Kolkata')::date - 1, null)
             and not public._estimate_expired('Sent', (now() at time zone 'Asia/Kolkata')::date, null)
             and not public._estimate_expired('Converted', (now() at time zone 'Asia/Kolkata')::date - 5, null)
             and not public._estimate_expired('Draft', (now() at time zone 'Asia/Kolkata')::date - 5, 'accepted')
             and public._estimate_expired('Draft', (now() at time zone 'Asia/Kolkata')::date - 5, 'call_me')
            then 'PASS 42 expired = open, past its date, and not accepted in time' else 'FAIL 42' end;

-- An online order with an estimate that ran out yesterday.
insert into public.quotations (id, supplier_id, quote_no, customer_id, status, subtotal, total, valid_until)
values ('9a000000-0000-4000-8000-000000000043', :A, 'EST-052-EXP', :C1, 'Sent', 4000, 4000, (now() at time zone 'Asia/Kolkata')::date - 1);
insert into public.quotation_items (supplier_id, quotation_id, material_id, description, qty, rate, amount)
values (:A, '9a000000-0000-4000-8000-000000000043', 'a1000000-0000-4000-8000-000000000052', 'Cement 052', 10, 400, 4000);
insert into public.order_requests (id, supplier_id, request_id, customer_name, phone, items, public_token, status, quotation_id, customer_id, payment_method)
values ('0d000000-0000-4000-8000-000000000043', :A, gen_random_uuid(), 'Ravi 052', '9800000521',
        '[{"name":"Cement 052","qty":10}]', 'abcd0000000000000000000000000052', 'approved',
        '9a000000-0000-4000-8000-000000000043', :C1, 'online');
begin; :asAnon
select t052.expect_error($q$select public.respond_to_estimate('abcd0000000000000000000000000052', 'accepted')$q$,
  '%has expired%', '43 an expired estimate can''t be accepted from an old link');
select public.respond_to_estimate('abcd0000000000000000000000000052', 'call_me') as r44 \gset
select public.order_status('abcd0000000000000000000000000052') as s45 \gset
commit;
select case when (:'r44'::jsonb->>'ok')::boolean then 'PASS 44 "please call me" still works on an expired estimate'
            else 'FAIL 44 ' || :'r44' end;
select case when (:'s45'::jsonb->'estimate'->>'expired')::boolean
             and :'s45'::jsonb->'estimate'->>'valid_until' = ((now() at time zone 'Asia/Kolkata')::date - 1)::text
             and :'s45'::jsonb->'estimate'->>'created_at' is not null
             and not (:'s45'::jsonb ? 'upi_id')
            then 'PASS 45 the status link says it expired and no longer asks for its total by UPI'
            else 'FAIL 45 ' || (:'s45'::jsonb->'estimate')::text end;

-- Accepted in time: it stays agreed after the date passes.
update public.quotations set valid_until = (now() at time zone 'Asia/Kolkata')::date + 3 where id = '9a000000-0000-4000-8000-000000000043';
begin; :asAnon
select public.respond_to_estimate('abcd0000000000000000000000000052', 'accepted') as r46 \gset
commit;
update public.quotations set valid_until = (now() at time zone 'Asia/Kolkata')::date - 1 where id = '9a000000-0000-4000-8000-000000000043';
begin; :asAnon
select public.order_status('abcd0000000000000000000000000052') as s46 \gset
select public.customer_khata('aaaa0000bbbb1111cccc2222dddd0052') as k46 \gset
select public.khata_document('aaaa0000bbbb1111cccc2222dddd0052', 'estimate', 'EST-052-EXP') as d46 \gset
commit;
select case when (:'r46'::jsonb->>'ok')::boolean and not (:'s46'::jsonb->'estimate'->>'expired')::boolean
             and (:'s46'::jsonb->>'due')::numeric = 4000
            then 'PASS 46 an estimate accepted in time stays agreed after its date' else 'FAIL 46 ' || :'s46' end;
select case when (select count(*) from jsonb_array_elements(:'k46'::jsonb->'estimates') e
                   where e->>'quote_no' = 'EST-052-EXP' and e ? 'valid_until' and not (e->>'expired')::boolean) = 1
             and :'d46'::jsonb->>'valid_until' = ((now() at time zone 'Asia/Kolkata')::date - 1)::text
            then 'PASS 47 the khata link and the estimate PDF carry the date' else 'FAIL 47' end;

-- ── F-04 · a converted estimate keeps its GST ───────────────────────────
begin; :asA
select (public.create_quotation('52000000-0000-4000-8000-000000000050', :C2, 'Site 2',
  $j$[{"material_id":"a1000000-0000-4000-8000-000000000052","description":"Cement 052","qty":10,"rate":400},
      {"material_id":"a2000000-0000-4000-8000-000000000052","description":"Sand 052","qty":2,"rate":1000}]$j$::jsonb,
  true, 0)->>'id') as q50 \gset
commit;
select gst_amount as q50_gst, total as q50_total from public.quotations where id = :'q50' \gset
-- Cement's GST goes from 18% to 28% before the bill is made.
update public.materials set gst_rate = 28 where id = 'a1000000-0000-4000-8000-000000000052';
begin; :asA
select (public.create_invoice('52000000-0000-4000-8000-000000000051', :C2, 'Site 2',
  $j$[{"material_id":"a2000000-0000-4000-8000-000000000052","description":"Sand 052","qty":2,"rate":1000},
      {"material_id":"a1000000-0000-4000-8000-000000000052","description":"Cement 052","qty":10,"rate":400}]$j$::jsonb,
  true, 0, null, :'q50')->'invoice'->>'id') as inv50 \gset
commit;
select case when i.gst_amount = :'q50_gst'::numeric and i.total = :'q50_total'::numeric and :'q50_gst'::numeric = 820
             and (select gst_rate from public.invoice_items where invoice_id = :'inv50' and description = 'Cement 052') = 18
            then 'PASS 50 the bill charges the estimate''s 18%, not today''s 28%, whatever order the lines come in'
            else 'FAIL 50 bill gst=' || i.gst_amount || ' total=' || i.total || ' estimate gst=' || :'q50_gst' end
  from public.invoices i where i.id = :'inv50';

begin; :asA
select (public.create_invoice('52000000-0000-4000-8000-000000000052', :C2, 'Site 2',
  $j$[{"material_id":"a1000000-0000-4000-8000-000000000052","description":"Cement 052","qty":10,"rate":400}]$j$::jsonb,
  true, 0, null, null)->'invoice'->>'gst_amount') as g51 \gset
commit;
select case when :'g51'::numeric = 1120 then 'PASS 51 a new bill, not from an estimate, uses today''s 28%'
            else 'FAIL 51 ' || :'g51' end;

begin; :asA
select (public.create_quotation('52000000-0000-4000-8000-000000000053', :C2, 'Site 2',
  $j$[{"material_id":"a3000000-0000-4000-8000-000000000052","description":"Steel 052","qty":10,"rate":100},
      {"material_id":"a2000000-0000-4000-8000-000000000052","description":"Sand 052","qty":1,"rate":1000}]$j$::jsonb,
  true, 0)->>'id') as q52 \gset
commit;
update public.materials set gst_rate = 12 where id = 'a3000000-0000-4000-8000-000000000052';
begin; :asA
select (public.create_invoice('52000000-0000-4000-8000-000000000054', :C2, 'Site 2',
  $j$[{"material_id":"a3000000-0000-4000-8000-000000000052","description":"Steel 052","qty":10,"rate":110},
      {"material_id":"a2000000-0000-4000-8000-000000000052","description":"Sand 052","qty":1,"rate":1000}]$j$::jsonb,
  true, 0, null, :'q52')->'invoice'->>'id') as inv52 \gset
commit;
select case when (select gst_rate from public.invoice_items where invoice_id = :'inv52' and description = 'Steel 052') = 12
             and (select gst_rate from public.invoice_items where invoice_id = :'inv52' and description = 'Sand 052') = 5
            then 'PASS 52 a line the shop changed is taxed as a new line; the unchanged one keeps the estimate''s rate'
            else 'FAIL 52' end;

-- An estimate saved before 035: one 18% on the whole estimate, ₹1 of it from
-- rounding the whole rather than each line.
insert into public.quotations (id, supplier_id, quote_no, customer_id, status, subtotal, gst_amount, total, valid_until)
values ('9a000000-0000-4000-8000-000000000053', :A, 'EST-052-035', :C3, 'Sent', 5, 1, 6, null);
insert into public.quotation_items (supplier_id, quotation_id, material_id, description, qty, rate, amount) values
  (:A, '9a000000-0000-4000-8000-000000000053', 'a3000000-0000-4000-8000-000000000052', 'Steel 052', 1, 2.5, 2.5),
  (:A, '9a000000-0000-4000-8000-000000000053', 'a1000000-0000-4000-8000-000000000052', 'Cement 052', 1, 2.5, 2.5);
begin; :asA
select (public.create_invoice('52000000-0000-4000-8000-000000000055', :C3, null,
  $j$[{"material_id":"a1000000-0000-4000-8000-000000000052","description":"Cement 052","qty":1,"rate":2.5},
      {"material_id":"a3000000-0000-4000-8000-000000000052","description":"Steel 052","qty":1,"rate":2.5}]$j$::jsonb,
  true, 0, null, '9a000000-0000-4000-8000-000000000053')->'invoice'->>'id') as inv53 \gset
commit;
select case when i.gst_amount = 1 and i.total = 6
             and (select count(*) from public.invoice_items where invoice_id = :'inv53' and gst_rate is null) = 2
            then 'PASS 53 a pre-035 estimate becomes a bill with exactly its GST figure'
            else 'FAIL 53 gst=' || i.gst_amount || ' total=' || i.total end
  from public.invoices i where i.id = :'inv53';
update public.materials set gst_rate = 18 where id in ('a1000000-0000-4000-8000-000000000052', 'a3000000-0000-4000-8000-000000000052');

-- ── F-05 · money tables change only through the app's functions ─────────
\set ON_ERROR_STOP 0
select total as inv1_total, paid as inv1_paid from public.invoices where id = :'inv1' \gset
begin; :asA
update public.invoices set total = 1, paid = 1 where id = :'inv1';
rollback;
select case when total = :'inv1_total'::numeric and paid = :'inv1_paid'::numeric
            then 'PASS 60 a bill''s total and paid can''t be set directly' else 'FAIL 60' end
  from public.invoices where id = :'inv1';

begin; :asA
delete from public.invoices where id = :'inv1';
rollback;
select case when count(*) = 1 then 'PASS 61 a bill can''t be deleted directly' else 'FAIL 61' end
  from public.invoices where id = :'inv1';

begin; :asA
insert into public.invoices (supplier_id, invoice_no, customer_id, subtotal, total, paid, status, kind)
values ('aaaaaaaa-0000-4000-8000-000000000052', 'INV-9999', 'c1000000-0000-4000-8000-000000000052', 1, 1, 0, 'Unpaid', 'bill');
rollback;
select case when count(*) = 0 then 'PASS 62 a bill can''t be inserted directly' else 'FAIL 62' end
  from public.invoices where invoice_no = 'INV-9999';

select count(*) as items_before from public.invoice_items where invoice_id = :'inv1' \gset
begin; :asA
update public.invoice_items set rate = 1 where invoice_id = :'inv1';
rollback;
begin; :asA
delete from public.invoice_items where invoice_id = :'inv1';
rollback;
begin; :asA
insert into public.invoice_items (supplier_id, invoice_id, description, qty, rate, amount)
values ('aaaaaaaa-0000-4000-8000-000000000052', :'inv1', 'Free extra', 1, 1, 1);
rollback;
select case when count(*) = :'items_before'::int and min(rate) = 400
            then 'PASS 63 bill lines can''t be added, changed or deleted directly' else 'FAIL 63' end
  from public.invoice_items where invoice_id = :'inv1';

select count(*) as pays_before from public.payments where supplier_id = :A \gset
begin; :asA
insert into public.payments (supplier_id, customer_id, amount, mode)
values ('aaaaaaaa-0000-4000-8000-000000000052', 'c1000000-0000-4000-8000-000000000052', 999, 'Cash');
rollback;
begin; :asA
update public.payments set amount = 1 where id = :'cashpay3';
rollback;
begin; :asA
delete from public.payments where id = :'cashpay3';
commit;
select case when (select count(*) from public.payments where supplier_id = :A) = :'pays_before'::int
             and (select amount from public.payments where id = :'cashpay3') = 5000
            then 'PASS 64 payments can''t be added or changed directly, and a delete is still skipped'
            else 'FAIL 64' end;

begin; :asA
update public.payment_allocations set amount = 1 where payment_id = :'cashpay3';
rollback;
begin; :asA
insert into public.payment_allocations (supplier_id, payment_id, invoice_id, amount)
values ('aaaaaaaa-0000-4000-8000-000000000052', :'cashpay3', :'inv1', 1);
rollback;
select case when (select sum(amount) from public.payment_allocations where payment_id = :'cashpay3' and released_at is null) = 5000
             and not exists (select 1 from public.payment_allocations where payment_id = :'cashpay3' and invoice_id = :'inv1')
            then 'PASS 65 which bills a payment paid can''t be changed directly' else 'FAIL 65' end;

-- Estimates: Sent and the date are the app's own direct writes; the rest is not.
begin; :asA
update public.quotations set status = 'Sent' where id = :'q40' and status = 'Draft';
update public.quotations set valid_until = (now() at time zone 'Asia/Kolkata')::date + 30 where id = :'q40';
commit;
begin; :asA
update public.quotations set total = 1 where id = :'q40';
rollback;
begin; :asA
update public.quotations set status = 'Converted' where id = :'q40';
rollback;
begin; :asA
delete from public.quotations where id = :'q40';
rollback;
begin; :asA
update public.quotation_items set rate = 1 where quotation_id = :'q40';
rollback;
select case when q.status = 'Sent' and q.valid_until = (now() at time zone 'Asia/Kolkata')::date + 30 and q.total = 4000
             and (select min(rate) from public.quotation_items where quotation_id = :'q40') = 400
            then 'PASS 66 marking Sent and moving the date work; total, Converted, delete and lines are refused'
            else 'FAIL 66 status=' || q.status || ' total=' || q.total end
  from public.quotations q where q.id = :'q40';

begin; :asA
delete from public.customers where id = :C1;
rollback;
begin; :asA
delete from public.customers where id = :C4;
commit;
select case when exists (select 1 from public.customers where id = :C1)
             and not exists (select 1 from public.customers where id = :C4)
            then 'PASS 67 a customer with bills can''t be deleted; one added by mistake still can'
            else 'FAIL 67' end;

begin; :asA
insert into public.customers (supplier_id, name, phone) values ('aaaaaaaa-0000-4000-8000-000000000052', 'New 052', '9800000525');
update public.customers set name = 'Ravi Kumar 052' where id = 'c1000000-0000-4000-8000-000000000052';
commit;
select case when exists (select 1 from public.customers where phone = '9800000525' and supplier_id = :A)
             and (select name from public.customers where id = :C1) = 'Ravi Kumar 052'
            then 'PASS 68 adding and editing customers works as before' else 'FAIL 68' end;
update public.customers set name = 'Ravi 052' where id = :C1;
\set ON_ERROR_STOP 1

-- The app's own functions, and the customer side, still write.
begin; :asA
select public.mark_invoice_delivered(:'inv3') is not null as ok \gset
select public.set_invoice_print_options(:'inv3', '{"gstin": false}'::jsonb);
select (public.update_invoice(:'inv2', 'Site 2', $j$[{"material_id":"a3000000-0000-4000-8000-000000000052","description":"Steel 052","qty":21,"rate":100}]$j$::jsonb, false, 0)->>'id') is not null as ok \gset
commit;
update public.customers set khata_token = 'cccc0000bbbb1111cccc2222dddd0052' where id = :C3;
select invoice_no as inv3_no from public.invoices where id = :'inv3' \gset
begin; :asAnon
select public.confirm_received('cccc0000bbbb1111cccc2222dddd0052', :'inv3_no') as cr \gset
commit;
select case when i.delivered and i.received_at is not null and i.print_options is not null
             and (select total from public.invoices where id = :'inv2') = 2100
            then 'PASS 69 delivery, print options, editing a bill and the customer''s "received" all still work'
            else 'FAIL 69 ' || :'cr' end
  from public.invoices i where i.id = :'inv3';

-- The admin deleting a whole shop still takes everything with it.
begin; :asZ
select (public.create_invoice('52000000-0000-4000-8000-000000000070', 'cf000000-0000-4000-8000-000000000052', null,
  $j$[{"material_id":"af000000-0000-4000-8000-000000000052","description":"Z cement 052","qty":1,"rate":400}]$j$::jsonb,
  false, 0, $j$[{"amount":400,"mode":"Cash"}]$j$::jsonb, null)->'invoice'->>'id') as invz \gset
commit;
select id as payz from public.payments where supplier_id = :Z \gset
begin; :asZ
select public.correct_payment('52000000-0000-4000-8000-000000000071', :'payz', 'Test reversal', 300, null) is not null as ok \gset
commit;
delete from auth.users where id = :Z;
select case when not exists (select 1 from public.suppliers where id = :Z)
             and not exists (select 1 from public.invoices where supplier_id = :Z)
             and not exists (select 1 from public.payments where supplier_id = :Z)
            then 'PASS 70 deleting a shop still removes its bills and payments, corrections included'
            else 'FAIL 70' end;

-- ── F-08 · the nightly job's function ───────────────────────────────────
select case when not has_function_privilege('authenticated', 'public.expire_lapsed_subscriptions()', 'execute')
             and not has_function_privilege('anon', 'public.expire_lapsed_subscriptions()', 'execute')
             and public.expire_lapsed_subscriptions() >= 0
            then 'PASS 80 only the cron job (postgres) can run the subscription job' else 'FAIL 80' end;

-- ── F-15 · a suspended shop stops at once ───────────────────────────────
update public.suppliers set status = 'suspended' where id = :A;
begin; :asA
select t052.expect_error(format($q$select public.record_customer_payment(%L, %L, 100, 'Cash')$q$,
  '52000000-0000-4000-8000-000000000090', 'c3000000-0000-4000-8000-000000000052'), '%account is paused%',
  '90 a suspended shop can''t record a payment with a login that has not run out');
select t052.expect_error(format($q$select public.create_invoice(%L, %L, null, '[{"description":"x","qty":1,"rate":1}]'::jsonb)$q$,
  '52000000-0000-4000-8000-000000000091', 'c3000000-0000-4000-8000-000000000052'), '%account is paused%',
  '91 or make a bill');
commit;
update public.suppliers set status = 'active' where id = :A;
begin; :asA
select public.record_customer_payment('52000000-0000-4000-8000-000000000092', :C3, 100, 'Cash') is not null as ok \gset
commit;
select case when :'ok' then 'PASS 92 reactivated, it works again at once' else 'FAIL 92' end;
begin; :asP
select t052.expect_error(format($q$select public.record_customer_payment(%L, %L, 100, 'Cash')$q$,
  '52000000-0000-4000-8000-000000000093', 'c3000000-0000-4000-8000-000000000052'), '%shop''s own login%',
  '93 an applicant''s login is told it isn''t a shop');
commit;

-- ── Concurrency: two phones correct the same payment at once ────────────
-- (Run by the separate shell step in the audit-fix report; see there.)

-- ── Everything still adds up ────────────────────────────────────────────
-- (This suite's shops only: another suite's fixtures may write rows by hand.)
select case when count(*) = 0 then 'PASS 95 every live bill''s paid equals what is on it'
            else 'FAIL 95 ' || count(*) end
  from public.invoices i
 where i.status <> 'Cancelled' and i.supplier_id in (:A, :B)
   and abs(i.paid - coalesce((select sum(a.amount) from public.payment_allocations a
                               where a.invoice_id = i.id and a.released_at is null), 0)) > 0.005;
select case when count(*) = 0 then 'PASS 96 no bill paid past its total' else 'FAIL 96' end
  from public.invoices where paid > total + 0.005 and supplier_id in (:A, :B);
select case when count(*) = 0 then 'PASS 97 no reversed entry or reversal is on any bill' else 'FAIL 97 ' || count(*) end
  from public.payment_allocations a join public.payments p on p.id = a.payment_id
 where a.released_at is null
   and (p.amount < 0 or exists (select 1 from public.payments r where r.corrects_payment_id = p.id and r.amount < 0));
select case when count(*) = 0 then 'PASS 98 no customer holds a negative advance' else 'FAIL 98 ' || count(*) end
  from public.customer_balances where advance < -0.005 and supplier_id in (:A, :B);
select case when d.total_collected = (select sum(amount) from public.payments where supplier_id = :A)
            then 'PASS 99 the dashboard''s collected figure is the sum of every entry' else 'FAIL 99' end
  from public.dashboard_totals d where d.supplier_id = :A;
select case when (select count(*) from public.payment_allocations a join public.invoices i on i.id = a.invoice_id
                   join public.payments p on p.id = a.payment_id where p.supplier_id <> i.supplier_id) = 0
             and (select count(*) from public.invoices i join public.customers c on c.id = i.customer_id
                   where c.supplier_id <> i.supplier_id) = 0
            then 'PASS 100 nothing crosses from one shop to another' else 'FAIL 100' end;

drop schema t052 cascade;
