-- Checks for migration 051 (notifications and phone alerts). Run only against
-- a throwaway local database built from schema.sql + 002→051, never live:
--   psql -U supabase_admin -f 051_notifications_test.sql 2>&1 | grep -E 'PASS|FAIL'
-- Every check prints one PASS or FAIL line.

\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-4000-8000-000000000051'''
\set B '''bbbbbbbb-0000-4000-8000-000000000051'''
\set X '''eeeeeeee-0000-4000-8000-000000000051'''
\set U '''cccccccc-0000-4000-8000-000000000051'''
\set P '''dddddddd-0000-4000-8000-000000000051'''

-- No pings from a test copy.
update public.platform_settings set push_function_url = null;

-- ── Fixtures: two shops, the admin, a customer with a khata link and a
--    connected customer account, an applicant ────────────────────────────
insert into auth.users (id, email, aud, role) values
  (:A, 'shop-a-051@test.local', 'authenticated', 'authenticated'),
  (:B, 'shop-b-051@test.local', 'authenticated', 'authenticated'),
  (:X, 'admin-051@test.local', 'authenticated', 'authenticated'),
  (:U, null, 'authenticated', 'authenticated'),
  (:P, 'applicant-051@test.local', 'authenticated', 'authenticated')
on conflict (id) do nothing;
insert into public.suppliers (id, business_name, plan, order_link, ordering_enabled, subscription_expiry) values
  (:A, 'Shop A 051', 'pro', 'shop-a-051', true, (now() at time zone 'Asia/Kolkata')::date + 3),
  (:B, 'Shop B 051', 'pro', 'shop-b-051', true, (now() at time zone 'Asia/Kolkata')::date + 40)
on conflict (id) do nothing;
insert into public.suppliers (id, business_name, role) values (:X, 'Admin 051', 'admin') on conflict (id) do nothing;
insert into public.customers (id, supplier_id, name, phone, khata_token) values
  ('c0000000-0000-4000-8000-000000000051', :A, 'Ravi 051', '9800000051', 'aaaa0000bbbb1111cccc2222dddd0051'),
  ('c0000000-0000-4000-8000-0000000000b1', :B, 'Other 051', '9800000052', null);
insert into public.customer_accounts (user_id) values (:U);
insert into public.customer_connections (user_id, customer_id, supplier_id, method)
values (:U, 'c0000000-0000-4000-8000-000000000051', :A, 'khata_link');
insert into public.materials (id, supplier_id, name, rate, stock_qty, stock_unit, low_stock_threshold) values
  ('a1000000-0000-4000-8000-000000000051', :A, 'Cement 051', 350, 20, 'Bag', 10);

-- ── 1. A new order tells the shop ───────────────────────────────────────
insert into public.order_requests (id, supplier_id, request_id, customer_name, phone, items, public_token)
values ('0d000000-0000-4000-8000-000000000051', :A, gen_random_uuid(), 'Ravi 051', '9800000051',
        '[{"name":"Cement","qty":10},{"name":"Sand","qty":1}]', 'ord00000000000000000000000000051');
select case when count(*) = 1 and min(text->'en'->>'t') = 'New order from Ravi 051'
             and min(text->'hi'->>'t') = 'Ravi 051 का नया ऑर्डर' and min(link) = '/orders/0d000000-0000-4000-8000-000000000051'
             and min(text->'en'->>'b') like '2 materials%'
            then 'PASS 01 a new order notifies the shop, in three languages'
            else 'FAIL 01 ' || count(*) end
  from public.notifications where user_id = :A and kind = 'order_new';

-- ── 2–4. The shop's decision reaches the customer ───────────────────────
update public.order_requests set status = 'approved', decided_at = now(),
       customer_id = 'c0000000-0000-4000-8000-000000000051'
 where id = '0d000000-0000-4000-8000-000000000051';
select case when count(*) = 1 and min(customer_id::text) = 'c0000000-0000-4000-8000-000000000051'
             and min(order_id::text) = '0d000000-0000-4000-8000-000000000051' and min(text->'en'->>'t') = 'Shop A 051 accepted your order'
            then 'PASS 02 accepting tells the customer (order and customer)' else 'FAIL 02 ' || count(*) end
  from public.notifications where kind = 'order_accepted';

insert into public.quotations (id, supplier_id, quote_no, customer_id, total)
values ('9a000000-0000-4000-8000-000000000051', :A, 'EST-051', 'c0000000-0000-4000-8000-000000000051', 123456.4);
update public.order_requests set quotation_id = '9a000000-0000-4000-8000-000000000051'
 where id = '0d000000-0000-4000-8000-000000000051';
select case when count(*) = 1 and min(text->'en'->>'b') = '₹1,23,456 · tap to see it'
            then 'PASS 03 estimate ready, with the total in Indian grouping' else 'FAIL 03 ' || coalesce(min(text->'en'->>'b'), 'none') end
  from public.notifications where kind = 'estimate_ready';

update public.order_requests set customer_response = 'accepted', responded_at = now()
 where id = '0d000000-0000-4000-8000-000000000051';
select case when count(*) = 1 and min(link) = '/quotations/9a000000-0000-4000-8000-000000000051'
             and min(text->'en'->>'t') = 'Ravi 051 accepted the estimate'
            then 'PASS 04 the customer accepting tells the shop, opening the estimate' else 'FAIL 04 ' || count(*) end
  from public.notifications where user_id = :A and kind = 'estimate_answer';

-- ── 5. Blocking a number tells nobody ───────────────────────────────────
insert into public.order_requests (id, supplier_id, request_id, customer_name, phone, items)
values ('0d000000-0000-4000-8000-0000000000b2', :A, gen_random_uuid(), 'Spam 051', '9800000099', '[]');
update public.order_requests set status = 'rejected', reject_code = 'other', reject_reason = null
 where id = '0d000000-0000-4000-8000-0000000000b2';
select case when count(*) = 0 then 'PASS 05 a blocked spammer''s order is rejected silently' else 'FAIL 05 ' || count(*) end
  from public.notifications where kind = 'order_rejected';
update public.order_requests set status = 'pending' where id = '0d000000-0000-4000-8000-0000000000b2';
update public.order_requests set status = 'rejected', reject_code = 'no_stock' where id = '0d000000-0000-4000-8000-0000000000b2';
select case when count(*) = 1 then 'PASS 06 a real rejection tells that order''s link' else 'FAIL 06 ' || count(*) end
  from public.notifications where kind = 'order_rejected' and order_id = '0d000000-0000-4000-8000-0000000000b2';

-- ── 7–9. Bills: made, delivered, received ───────────────────────────────
insert into public.invoices (id, supplier_id, invoice_no, customer_id, quotation_id, total)
values ('1b000000-0000-4000-8000-000000000051', :A, 'INV-9051', 'c0000000-0000-4000-8000-000000000051',
        '9a000000-0000-4000-8000-000000000051', 5000);
select case when count(*) = 1 and min(order_id::text) = '0d000000-0000-4000-8000-000000000051'
             and min(text->'en'->>'b') = 'INV-9051 · ₹5,000'
            then 'PASS 07 a new bill tells the customer and the order it came from' else 'FAIL 07 ' || count(*) end
  from public.notifications where kind = 'bill_made' and supplier_id = :A;
update public.invoices set delivered = true, delivered_at = now() where id = '1b000000-0000-4000-8000-000000000051';
update public.invoices set delivered = true where id = '1b000000-0000-4000-8000-000000000051';
select case when count(*) = 1 then 'PASS 08 delivered tells the customer once' else 'FAIL 08 ' || count(*) end
  from public.notifications where kind = 'delivered' and supplier_id = :A;
update public.invoices set received_at = now() where id = '1b000000-0000-4000-8000-000000000051';
select case when count(*) = 1 and min(link) = '/invoices/1b000000-0000-4000-8000-000000000051'
            then 'PASS 09 material received tells the shop' else 'FAIL 09 ' || count(*) end
  from public.notifications where user_id = :A and kind = 'material_received';

-- ── 10. Cash + UPI in one save is one alert ─────────────────────────────
begin;
insert into public.payments (supplier_id, invoice_id, customer_id, amount, mode) values
  (:A, '1b000000-0000-4000-8000-000000000051', 'c0000000-0000-4000-8000-000000000051', 3000, 'Cash'),
  (:A, '1b000000-0000-4000-8000-000000000051', 'c0000000-0000-4000-8000-000000000051', 1500, 'UPI');
commit;
select case when count(*) = 1 and min(text->'en'->>'t') = 'Shop A 051 received ₹4,500' and min(params->>'mode') = 'Split'
            then 'PASS 10 a split payment is one alert with the whole amount' else 'FAIL 10 ' || count(*) || ' ' || coalesce(min(text->'en'->>'t'), '') end
  from public.notifications where kind = 'payment_received' and supplier_id = :A;

-- ── 11–12. Complaints both ways ─────────────────────────────────────────
insert into public.customer_complaints (id, supplier_id, customer_id, invoice_id, invoice_no, category, description)
values ('cc000000-0000-4000-8000-000000000051', :A, 'c0000000-0000-4000-8000-000000000051',
        '1b000000-0000-4000-8000-000000000051', 'INV-9051', 'quality', 'The cement was lumpy and wet.');
select case when count(*) = 1 and min(text->'en'->>'t') = 'Complaint from Ravi 051'
            then 'PASS 11 a complaint tells the shop' else 'FAIL 11 ' || count(*) end
  from public.notifications where user_id = :A and kind = 'complaint_new';
update public.customer_complaints set status = 'resolved', supplier_response = 'Replaced 2 bags.', responded_at = now(), resolved_at = now()
 where id = 'cc000000-0000-4000-8000-000000000051';
select case when count(*) = 1 then 'PASS 12 the shop''s reply tells the customer' else 'FAIL 12 ' || count(*) end
  from public.notifications where kind = 'complaint_reply' and customer_id = 'c0000000-0000-4000-8000-000000000051';

-- ── 13. Khata link requested ────────────────────────────────────────────
insert into public.khata_link_requests (supplier_id, customer_id) values (:A, 'c0000000-0000-4000-8000-000000000051');
select case when count(*) = 1 then 'PASS 13 a khata link request tells the shop' else 'FAIL 13 ' || count(*) end
  from public.notifications where user_id = :A and kind = 'khata_request';

-- ── 14. Low stock: once, on the way down ────────────────────────────────
update public.materials set stock_qty = 15 where id = 'a1000000-0000-4000-8000-000000000051';
update public.materials set stock_qty = 8 where id = 'a1000000-0000-4000-8000-000000000051';
update public.materials set stock_qty = 4 where id = 'a1000000-0000-4000-8000-000000000051';
select case when count(*) = 1 and min(text->'en'->>'b') = '8 Bag left'
            then 'PASS 14 low stock tells the shop once, as it crosses the line' else 'FAIL 14 ' || count(*) || ' ' || coalesce(min(text->'en'->>'b'), '') end
  from public.notifications where user_id = :A and kind = 'low_stock';

-- ── 15–17. Applications and KYC ─────────────────────────────────────────
insert into public.supplier_compliance (user_id, is_applicant, legal_name, requested_plan)
values (:P, true, 'New Shop 051', 'trial');
select case when count(*) = 1 and min(text->'en'->>'t') = 'New application: New Shop 051'
            then 'PASS 15 a new application tells the admin' else 'FAIL 15 ' || count(*) end
  from public.notifications where user_id = :X and kind = 'admin_application';
update public.supplier_compliance set status = 'UNDER_REVIEW', submitted_at = now() where user_id = :P;
select case when count(*) = 1 then 'PASS 16 KYC sent for review tells the admin' else 'FAIL 16 ' || count(*) end
  from public.notifications where user_id = :X and kind = 'admin_kyc_sent';
update public.supplier_compliance set status = 'APPROVED', is_applicant = false, decided_at = now() where user_id = :P;
select case when count(*) = 1 and min(link) = '/dashboard'
            then 'PASS 17 accepting an application welcomes the shop' else 'FAIL 17 ' || count(*) end
  from public.notifications where user_id = :P and kind = 'application_accepted';

-- ── 18. Plans ending ────────────────────────────────────────────────────
select public.notify_plans_ending();
select case when (select count(*) from public.notifications where user_id = :A and kind = 'plan_ending'
                    and text->'en'->>'t' = 'Your BuildSupply plan ends in 3 days') = 1
             and (select count(*) from public.notifications where user_id = :B and kind = 'plan_ending') = 0
             and (select count(*) from public.notifications where user_id = :X and kind = 'admin_renewals') = 1
            then 'PASS 18 plan reminders: the shop 3 days out and the admin, not the shop 40 days out'
            else 'FAIL 18' end;
select case when count(*) = 1 then 'PASS 19 the daily reminder job is scheduled' else 'FAIL 19' end
  from cron.job where jobname = 'buildsupply-plan-reminders';

-- ── 20–24. Who can read what ────────────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :A, 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', :A, true);
select case when count(*) > 0 and count(*) filter (where user_id is distinct from current_setting('request.jwt.claim.sub')::uuid) = 0
            then 'PASS 20 a shop reads its own notifications and nothing else' else 'FAIL 20' end
  from public.notifications;
select case when public.mark_notifications_read() > 0 then 'PASS 21 a shop can mark its own read' else 'FAIL 21' end;
commit;
select case when count(*) = 0 then 'PASS 22 marking read touched nobody else''s' else 'FAIL 22 ' || count(*) end
  from public.notifications where user_id is distinct from :A and read_at is not null;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :X, 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', :X, true);
select case when count(*) = 3 and bool_and(kind like 'admin_%')
            then 'PASS 23 the admin reads only the admin''s three (no shop or customer business)' else 'FAIL 23 ' || count(*) end
  from public.notifications;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :U, 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', :U, true);
select case when count(*) = 6 and bool_and(customer_id = 'c0000000-0000-4000-8000-000000000051')
            then 'PASS 24 a connected customer account reads that customer''s alerts only'
            else 'FAIL 24 ' || count(*) end
  from public.notifications;
commit;

begin;
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$ begin
  perform count(*) from public.notifications;
  raise notice 'FAIL 25 signed out can read notifications';
exception when insufficient_privilege then raise notice 'PASS 25 signed out cannot read notifications';
end $$;
do $$ begin
  perform public.claim_push_batch(10);
  raise notice 'FAIL 26 signed out can claim alerts';
exception when insufficient_privilege then raise notice 'PASS 26 signed out cannot claim alerts';
end $$;
-- Signed out with a khata code: allowed. Without one: refused.
select case when public.save_push_subscription('https://fcm.googleapis.com/fcm/send/khata051',
         'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
         'BTBZMqHH6r4Tts7J_aSIgg', 'hi', 'aaaa0000bbbb1111cccc2222dddd0051', null)->>'ok' = 'true'
            then 'PASS 27 a phone signs up for alerts through the khata link' else 'FAIL 27' end;
select case when public.save_push_subscription('https://fcm.googleapis.com/fcm/send/order051',
         'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
         'BTBZMqHH6r4Tts7J_aSIgg', 'en', null, 'ord00000000000000000000000000051')->>'ok' = 'true'
            then 'PASS 28 a phone signs up through an order status link' else 'FAIL 28' end;
select case when public.save_push_subscription('https://fcm.googleapis.com/fcm/send/x',
         'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
         'BTBZMqHH6r4Tts7J_aSIgg', 'en', 'ffff0000ffff0000ffff0000ffff0000', null)->>'error' = 'not_found'
             and public.save_push_subscription('https://fcm.googleapis.com/fcm/send/x',
         'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
         'BTBZMqHH6r4Tts7J_aSIgg', 'en', null, null)->>'error' = 'signed_out'
            then 'PASS 29 a guessed code or no link is refused' else 'FAIL 29' end;
do $$ begin
  perform count(*) from public.push_subscriptions;
  raise notice 'FAIL 30 signed out can read phone subscriptions';
exception when insufficient_privilege then raise notice 'PASS 30 signed out cannot read phone subscriptions';
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :A, 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', :A, true);
select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/shopA051',
         'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
         'BTBZMqHH6r4Tts7J_aSIgg', 'mr', null, null);
select case when public.push_subscribed('https://fcm.googleapis.com/fcm/send/shopA051') and count(*) = 1
            then 'PASS 31 a shop signs its phone up and sees only its own' else 'FAIL 31 ' || count(*) end
  from public.push_subscriptions;
do $$ begin
  perform public.claim_push_batch(10);
  raise notice 'FAIL 32 a shop can claim alerts';
exception when insufficient_privilege then raise notice 'PASS 32 a shop cannot claim alerts';
end $$;
do $$ begin
  insert into public.push_subscriptions (endpoint, p256dh, auth, user_id)
  values ('https://evil.example/x', 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
          'BTBZMqHH6r4Tts7J_aSIgg', current_setting('request.jwt.claim.sub')::uuid);
  raise notice 'FAIL 33 a shop wrote a subscription row directly';
exception when insufficient_privilege then raise notice 'PASS 33 subscriptions are written only through the function';
end $$;
commit;

-- ── 34–37. Claiming: one message per phone, in its language, once ───────
-- Something new for each phone, so the batch holds one of each.
update public.notifications set push_at = now() where push_at is null;
insert into public.order_requests (supplier_id, request_id, customer_name, phone, items)
values (:A, gen_random_uuid(), 'Meena 051', '9800000053', '[]');
insert into public.payments (supplier_id, invoice_id, customer_id, amount, mode)
values (:A, '1b000000-0000-4000-8000-000000000051', 'c0000000-0000-4000-8000-000000000051', 500, 'UPI');
update public.order_requests set status = 'approved' where id = '0d000000-0000-4000-8000-0000000000b2';

set role service_role;
create temp table claimed as select jsonb_array_elements(public.claim_push_batch(100)) as m;
reset role;
select case when exists (select 1 from claimed where m->>'endpoint' like '%shopA051'
                          and m->>'title' = 'Meena 051 यांची नवी ऑर्डर' and m->>'url' like '/orders/%')
            then 'PASS 34 the shop''s phone gets the new order in Marathi, opening the order' else 'FAIL 34' end;
select case when exists (select 1 from claimed where m->>'endpoint' like '%khata051'
                          and m->>'title' = 'Shop A 051 को ₹500 मिले' and m->>'url' = '/khata/aaaa0000bbbb1111cccc2222dddd0051')
            then 'PASS 35 the khata-link phone gets the payment in Hindi, opening the khata' else 'FAIL 35' end;
select case when not exists (select 1 from claimed where m->>'endpoint' like '%order051')
            then 'PASS 36 an order link hears only about its own order' else 'FAIL 36' end;
set role service_role;
select case when jsonb_array_length(public.claim_push_batch(100)) = 0
            then 'PASS 37 a second claim sends nothing again' else 'FAIL 37' end;
select public.push_results(array[(select (m->>'sub')::uuid from claimed where m->>'endpoint' like '%shopA051')],
                           array[(select (m->>'sub')::uuid from claimed where m->>'endpoint' like '%khata051')]);
reset role;
select case when (select last_sent_at is not null from public.push_subscriptions where endpoint like '%shopA051')
             and not exists (select 1 from public.push_subscriptions where endpoint like '%khata051')
            then 'PASS 38 a delivered phone is stamped, a gone one removed' else 'FAIL 38' end;

-- ── 39. Stopping the khata link stops its alerts ────────────────────────
select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/khata051b',
         'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
         'BTBZMqHH6r4Tts7J_aSIgg', 'en', 'aaaa0000bbbb1111cccc2222dddd0051', null);
update public.customers set khata_token = null where id = 'c0000000-0000-4000-8000-000000000051';
select case when count(*) = 0 then 'PASS 39 stopping a khata link removes its phones' else 'FAIL 39 ' || count(*) end
  from public.push_subscriptions where customer_id = 'c0000000-0000-4000-8000-000000000051';

-- ── 40. A broken ping never stops the business action ──────────────────
update public.platform_settings set push_function_url = 'not a url at all';
insert into public.order_requests (supplier_id, request_id, customer_name, phone, items)
values (:A, gen_random_uuid(), 'Still Works 051', '9800000054', '[]');
select case when count(*) = 1 then 'PASS 40 an order is still saved when the ping fails' else 'FAIL 40' end
  from public.order_requests where customer_name = 'Still Works 051';
update public.platform_settings set push_function_url = null;
