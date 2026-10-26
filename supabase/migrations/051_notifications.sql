-- 051: notifications — a bell in the app, and alerts on the phone.
--
-- Until now the app told a supplier something had happened only while they
-- had the Dashboard open: a new order, an accepted estimate, a complaint, a
-- customer asking for their khata link. A customer heard nothing at all until
-- they opened their link again. This adds:
--
--   * `notifications`       one row per thing worth telling someone, written
--                           by triggers on the tables where it happens, so no
--                           code path can forget. Its text is written here in
--                           English, Hindi and Marathi (`text`), once: the
--                           bell shows the reader's language and the phone
--                           alert the language the phone asked for.
--   * `push_subscriptions`  a phone that agreed to alerts (Web Push — free,
--                           no SMS, no paid service). Keyed by who it is for:
--                           a login (a supplier, the admin, a 041 customer
--                           account), a customer through their khata link, or
--                           one order through its status link. The khata and
--                           status links need no account; the link is the
--                           proof, as everywhere else on the customer side.
--   * a ping to the `send-push` Edge Function after each new notification
--     (pg_net, after commit). Calling that function only ever sends alerts
--     already due, once, so it needs no secret.
--
-- Who hears what:
--   supplier   new order · estimate accepted / "call me" · complaint ·
--              khata link requested · material received · stock running
--              low · plan ending (7, 3, 1, 0 days) · KYC decisions
--   customer   order accepted / estimate ready / order rejected · new bill ·
--              delivered · payment received · reply to a complaint
--   admin      new application · KYC sent for review · shops to renew
--
-- What it never does: change a bill, a payment, stock, an order or a
-- balance. Every trigger here only adds a notification, and any failure in
-- doing so is swallowed with a warning — a notification can never stop a
-- bill being saved or an order being placed.
--
-- The admin boundary (019) holds: the admin is told only about applications,
-- KYC and renewals, never a supplier's customers, bills or payments. A
-- supplier's notifications are readable only by that supplier; a customer's
-- only by the accounts connected to that customer (041).
--
-- Safe to run twice.

begin;

create extension if not exists pg_net with schema extensions;

-- Where the ping goes. Null means no ping (a copy with no function deployed).
alter table public.platform_settings add column if not exists push_function_url text;
update public.platform_settings
   set push_function_url = 'https://pefarymejlfdsmwusbbq.supabase.co/functions/v1/send-push'
 where push_function_url is null
   and current_database() = 'postgres'
   and exists (select 1 from public.suppliers where id = '9b2dad72-c7b5-4d41-9e21-6df333fbbd87');

-- ── 1. The tables ───────────────────────────────────────────────────────

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  -- Exactly who it is for: a login, a customer, or one order's status link
  -- (an order of a known customer carries both).
  user_id uuid references auth.users (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete cascade,
  order_id uuid references public.order_requests (id) on delete cascade,
  -- The shop it is about, so a shop's deletion takes its notifications with it.
  supplier_id uuid references public.suppliers (id) on delete cascade,
  kind text not null check (kind in (
    'order_new', 'estimate_answer', 'complaint_new', 'khata_request', 'material_received', 'low_stock',
    'plan_ending', 'application_accepted', 'kyc_approved', 'kyc_correction', 'kyc_rejected', 'orders_suspended',
    'order_accepted', 'estimate_ready', 'order_rejected', 'bill_made', 'delivered', 'payment_received',
    'complaint_reply',
    'admin_application', 'admin_kyc_sent', 'admin_renewals')),
  params jsonb not null default '{}'::jsonb,
  -- {"en": {"t": title, "b": body}, "hi": {...}, "mr": {...}}
  text jsonb not null,
  -- Where tapping it goes, for a login's own notifications. A customer's is
  -- worked out per phone (their khata link, status link or /me).
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&%-]*$'),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- Set when the send-push function has taken it, whether or not any phone
  -- was listening.
  push_at timestamptz,
  constraint notifications_for_someone check (user_id is not null or customer_id is not null or order_id is not null)
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc) where user_id is not null;
create index if not exists notifications_customer on public.notifications (customer_id, created_at desc) where customer_id is not null;
create index if not exists notifications_due on public.notifications (created_at) where push_at is null;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- The phone's own push address and keys, as the browser gave them.
  endpoint text not null check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}={0,2}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}={0,2}$'),
  user_id uuid references auth.users (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete cascade,
  order_id uuid references public.order_requests (id) on delete cascade,
  lang text not null default 'en' check (lang in ('en', 'hi', 'mr')),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  constraint push_subscriptions_one_key check (num_nonnulls(user_id, customer_id, order_id) = 1),
  constraint push_subscriptions_once unique nulls not distinct (endpoint, user_id, customer_id, order_id)
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id) where user_id is not null;
create index if not exists push_subscriptions_customer on public.push_subscriptions (customer_id) where customer_id is not null;
create index if not exists push_subscriptions_order on public.push_subscriptions (order_id) where order_id is not null;

alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

-- A login reads its own notifications; a customer account also reads its
-- connected customers' (041). Never anyone else's — not the admin's either.
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select to authenticated
  using (
    user_id = auth.uid()
    or (customer_id is not null and exists (
      select 1 from public.customer_connections c
       where c.user_id = auth.uid() and c.customer_id = notifications.customer_id and c.revoked_at is null))
  );
drop policy if exists notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (
    user_id = auth.uid()
    or (customer_id is not null and exists (
      select 1 from public.customer_connections c
       where c.user_id = auth.uid() and c.customer_id = notifications.customer_id and c.revoked_at is null))
  )
  with check (true);

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

-- Supabase grants everything on a new table by default; take it back. The
-- only write a reader may make is marking something read.
revoke all on public.notifications, public.push_subscriptions from anon, authenticated;
grant select on public.notifications, public.push_subscriptions to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ── 2. The words ────────────────────────────────────────────────────────

-- ₹1,23,456 — India's grouping, whole rupees.
create or replace function public._inr(p numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select '₹' || case when length(r) <= 3 then r
    else regexp_replace(left(r, length(r) - 3), '(\d)(?=(\d\d)+$)', '\1,', 'g') || ',' || right(r, 3) end
  from (select round(abs(coalesce(p, 0)))::bigint::text as r) x
$$;

create or replace function public._notification_text(p_kind text, p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  n text := coalesce(p->>'name', '');
  s text := coalesce(p->>'shop', '');
  b text := coalesce(p->>'bill', '');
  en_t text; en_b text := ''; hi_t text; hi_b text := ''; mr_t text; mr_b text := '';
begin
  case p_kind
  when 'order_new' then
    en_t := 'New order from ' || n;  en_b := (p->>'items') || ' materials · tap to approve or reject';
    hi_t := n || ' का नया ऑर्डर';    hi_b := (p->>'items') || ' सामान · मंज़ूर या नामंज़ूर करने के लिए टैप करें';
    mr_t := n || ' यांची नवी ऑर्डर';  mr_b := (p->>'items') || ' साहित्य · मंजूर किंवा नामंजूर करण्यासाठी टॅप करा';
  when 'estimate_answer' then
    if p->>'response' = 'accepted' then
      en_t := n || ' accepted the estimate';      en_b := 'Make the bill when you''re ready';
      hi_t := n || ' ने एस्टिमेट मंज़ूर किया';      hi_b := 'तैयार हों तो बिल बनाइए';
      mr_t := n || ' यांनी एस्टिमेट मंजूर केले';    mr_b := 'तयार असाल तेव्हा बिल बनवा';
    else
      en_t := n || ' asked you to call';          en_b := 'About the estimate';
      hi_t := n || ' ने कॉल करने को कहा';          hi_b := 'एस्टिमेट के बारे में';
      mr_t := n || ' यांनी फोन करायला सांगितले';    mr_b := 'एस्टिमेटबद्दल';
    end if;
  when 'complaint_new' then
    en_t := 'Complaint from ' || n;  en_b := 'On bill ' || b;
    hi_t := n || ' की शिकायत';       hi_b := 'बिल ' || b || ' पर';
    mr_t := n || ' यांची तक्रार';     mr_b := 'बिल ' || b || ' बद्दल';
  when 'khata_request' then
    en_t := n || ' asked for their khata link';  en_b := 'Tap to send it on WhatsApp';
    hi_t := n || ' ने खाता लिंक माँगा';            hi_b := 'WhatsApp पर भेजने के लिए टैप करें';
    mr_t := n || ' यांनी खाते लिंक मागितली';       mr_b := 'WhatsApp वर पाठवण्यासाठी टॅप करा';
  when 'material_received' then
    en_t := n || ' confirmed the material arrived';  en_b := 'Bill ' || b;
    hi_t := n || ' ने माल मिलने की पुष्टि की';         hi_b := 'बिल ' || b;
    mr_t := n || ' यांनी माल मिळाल्याचे सांगितले';     mr_b := 'बिल ' || b;
  when 'low_stock' then
    en_t := n || ' is running low';   en_b := (p->>'qty') || ' ' || coalesce(p->>'unit', '') || ' left';
    hi_t := n || ' का स्टॉक कम है';    hi_b := (p->>'qty') || ' ' || coalesce(p->>'unit', '') || ' बचा है';
    mr_t := n || ' चा स्टॉक कमी आहे';  mr_b := (p->>'qty') || ' ' || coalesce(p->>'unit', '') || ' शिल्लक';
  when 'plan_ending' then
    if (p->>'days')::int = 0 then
      en_t := 'Your BuildSupply plan ends today';
      hi_t := 'आपका BuildSupply प्लान आज खत्म हो रहा है';
      mr_t := 'तुमचा BuildSupply प्लॅन आज संपत आहे';
    elsif (p->>'days')::int = 1 then
      en_t := 'Your BuildSupply plan ends tomorrow';
      hi_t := 'आपका BuildSupply प्लान कल खत्म होगा';
      mr_t := 'तुमचा BuildSupply प्लॅन उद्या संपेल';
    else
      en_t := 'Your BuildSupply plan ends in ' || (p->>'days') || ' days';
      hi_t := 'आपका BuildSupply प्लान ' || (p->>'days') || ' दिन में खत्म होगा';
      mr_t := 'तुमचा BuildSupply प्लॅन ' || (p->>'days') || ' दिवसांत संपेल';
    end if;
    en_b := 'Message us to renew.';  hi_b := 'रिन्यू के लिए हमें मैसेज करें।';  mr_b := 'नूतनीकरणासाठी आम्हाला मेसेज करा.';
  when 'application_accepted' then
    en_t := 'Welcome to BuildSupply';        en_b := 'Your application is accepted. Open the app to start.';
    hi_t := 'BuildSupply में स्वागत है';      hi_b := 'आपका आवेदन मंज़ूर हो गया। शुरू करने के लिए ऐप खोलें।';
    mr_t := 'BuildSupply मध्ये स्वागत आहे';   mr_b := 'तुमचा अर्ज मंजूर झाला. सुरू करण्यासाठी ॲप उघडा.';
  when 'kyc_approved' then
    en_t := 'Your KYC is approved';  hi_t := 'आपका KYC मंज़ूर हो गया';  mr_t := 'तुमचे KYC मंजूर झाले';
  when 'kyc_correction' then
    en_t := 'Please correct your KYC';  hi_t := 'कृपया अपना KYC ठीक करें';  mr_t := 'कृपया तुमचे KYC दुरुस्त करा';
    en_b := coalesce(p->>'reason', '');  hi_b := en_b;  mr_b := en_b;
  when 'kyc_rejected' then
    en_t := 'Your KYC was not approved';  hi_t := 'आपका KYC मंज़ूर नहीं हुआ';  mr_t := 'तुमचे KYC मंजूर झाले नाही';
    en_b := coalesce(p->>'reason', '');  hi_b := en_b;  mr_b := en_b;
  when 'orders_suspended' then
    en_t := 'Online orders are paused for your shop';        en_b := 'Open the app to see why';
    hi_t := 'आपकी दुकान के ऑनलाइन ऑर्डर रोके गए हैं';         hi_b := 'कारण देखने के लिए ऐप खोलें';
    mr_t := 'तुमच्या दुकानाच्या ऑनलाइन ऑर्डर थांबवल्या आहेत';  mr_b := 'कारण पाहण्यासाठी ॲप उघडा';
  when 'order_accepted' then
    en_t := s || ' accepted your order';        en_b := 'The price is on its way';
    hi_t := s || ' ने आपका ऑर्डर स्वीकार किया';  hi_b := 'कीमत जल्द भेजी जाएगी';
    mr_t := s || ' ने तुमची ऑर्डर स्वीकारली';    mr_b := 'किंमत लवकरच कळवली जाईल';
  when 'estimate_ready' then
    en_t := 'Your estimate from ' || s || ' is ready';  en_b := (p->>'total') || ' · tap to see it';
    hi_t := s || ' का एस्टिमेट तैयार है';               hi_b := (p->>'total') || ' · देखने के लिए टैप करें';
    mr_t := s || ' चे एस्टिमेट तयार आहे';               mr_b := (p->>'total') || ' · पाहण्यासाठी टॅप करा';
  when 'order_rejected' then
    en_t := s || ' couldn''t take your order';  en_b := 'Tap to see why';
    hi_t := s || ' आपका ऑर्डर नहीं ले सका';      hi_b := 'कारण देखने के लिए टैप करें';
    mr_t := s || ' तुमची ऑर्डर घेऊ शकले नाही';    mr_b := 'कारण पाहण्यासाठी टॅप करा';
  when 'bill_made' then
    en_t := 'New bill from ' || s;  hi_t := s || ' का नया बिल';  mr_t := s || ' चे नवे बिल';
    en_b := b || ' · ' || (p->>'total');  hi_b := en_b;  mr_b := en_b;
  when 'delivered' then
    en_t := s || ' delivered your material';  en_b := 'Bill ' || b || ' · tap once it has arrived';
    hi_t := s || ' ने आपका माल भेज दिया';      hi_b := 'बिल ' || b || ' · मिल जाए तो टैप करें';
    mr_t := s || ' ने तुमचा माल पाठवला';       mr_b := 'बिल ' || b || ' · मिळाल्यावर टॅप करा';
  when 'payment_received' then
    en_t := s || ' received ' || (p->>'amount');  en_b := 'By ' || (p->>'mode') || '. Thank you.';
    hi_t := s || ' को ' || (p->>'amount') || ' मिले';  hi_b := (p->>'mode') || ' से। धन्यवाद।';
    mr_t := s || ' ला ' || (p->>'amount') || ' मिळाले';  mr_b := (p->>'mode') || ' ने. धन्यवाद.';
  when 'complaint_reply' then
    en_t := s || ' replied to your complaint';       en_b := 'Bill ' || b;
    hi_t := s || ' ने आपकी शिकायत का जवाब दिया';     hi_b := 'बिल ' || b;
    mr_t := s || ' ने तुमच्या तक्रारीला उत्तर दिले';   mr_b := 'बिल ' || b;
  -- The admin's screens are English only.
  when 'admin_application' then
    en_t := 'New application: ' || n;  en_b := 'Asked for ' || coalesce(p->>'plan', 'a plan');
  when 'admin_kyc_sent' then
    en_t := 'KYC sent for review: ' || n;  en_b := 'Needs a decision';
  when 'admin_renewals' then
    en_t := case when (p->>'count')::int = 1 then '1 shop needs renewing'
                 else (p->>'count') || ' shops need renewing' end;
    en_b := 'Plans ending within 7 days';
  else
    en_t := 'BuildSupply';
  end case;
  return jsonb_build_object(
    'en', jsonb_build_object('t', en_t, 'b', en_b),
    'hi', jsonb_build_object('t', coalesce(hi_t, en_t), 'b', coalesce(hi_b, en_b)),
    'mr', jsonb_build_object('t', coalesce(mr_t, en_t), 'b', coalesce(mr_b, en_b)));
end;
$$;

-- ── 3. Writing one, and the ping ────────────────────────────────────────

create or replace function public._notify(
  p_kind text, p_params jsonb, p_user uuid, p_customer uuid, p_order uuid, p_supplier uuid, p_link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_params jsonb;
begin
  -- A payment taken in two modes in one save (cash + UPI) is one alert.
  -- now() is the transaction's start, the same for every row it writes.
  if p_kind = 'payment_received' then
    select id, params into v_id, v_params from public.notifications
     where kind = p_kind and customer_id is not distinct from p_customer
       and created_at = now() and push_at is null
     limit 1;
    if v_id is not null then
      v_params := v_params || jsonb_build_object(
        'rupees', (v_params->>'rupees')::numeric + (p_params->>'rupees')::numeric,
        'mode', case when v_params->>'mode' = p_params->>'mode' then v_params->>'mode' else 'Split' end);
      v_params := v_params || jsonb_build_object('amount', public._inr((v_params->>'rupees')::numeric));
      update public.notifications
         set params = v_params, text = public._notification_text(p_kind, v_params)
       where id = v_id;
      return;
    end if;
  end if;
  insert into public.notifications (kind, params, text, user_id, customer_id, order_id, supplier_id, link)
  values (p_kind, p_params, public._notification_text(p_kind, p_params), p_user, p_customer, p_order, p_supplier, p_link);
end;
$$;

create or replace function public._push_ping()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
begin
  select push_function_url into v_url from public.platform_settings limit 1;
  if v_url is not null and exists (select 1 from public.push_subscriptions) then
    perform net.http_post(url := v_url, body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 10000);
  end if;
  return null;
exception when others then
  raise warning 'push ping failed: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists notifications_push_ping on public.notifications;
create trigger notifications_push_ping
  after insert on public.notifications
  for each statement execute function public._push_ping();

-- ── 4. What happens, as it happens ──────────────────────────────────────
-- Every trigger below swallows its own failure: a notification can never
-- stop the thing it is about.

create or replace function public._notify_order_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop text;
  v_total numeric;
begin
  select business_name into v_shop from public.suppliers where id = new.supplier_id;

  if tg_op = 'INSERT' then
    perform public._notify('order_new',
      jsonb_build_object('name', new.customer_name, 'items', jsonb_array_length(new.items)),
      new.supplier_id, null, null, new.supplier_id, '/orders/' || new.id);
    return null;
  end if;

  -- The supplier: the customer answered the estimate.
  if new.customer_response is not null and new.customer_response is distinct from old.customer_response then
    perform public._notify('estimate_answer',
      jsonb_build_object('name', new.customer_name, 'response', new.customer_response),
      new.supplier_id, null, null, new.supplier_id,
      case when new.quotation_id is not null then '/quotations/' || new.quotation_id else '/orders/' || new.id end);
  end if;

  -- The customer: the shop decided.
  if new.quotation_id is not null and old.quotation_id is null then
    select total into v_total from public.quotations where id = new.quotation_id;
    perform public._notify('estimate_ready', jsonb_build_object('shop', v_shop, 'total', public._inr(v_total)),
      null, new.customer_id, new.id, new.supplier_id, null);
  elsif new.status = 'approved' and old.status = 'pending' then
    perform public._notify('order_accepted', jsonb_build_object('shop', v_shop),
      null, new.customer_id, new.id, new.supplier_id, null);
  elsif new.status = 'rejected' and old.status is distinct from 'rejected'
        -- Blocking a number rejects its orders with no reason: that is a
        -- spammer being turned away, not a customer to tell.
        and not (new.reject_code = 'other' and new.reject_reason is null) then
    perform public._notify('order_rejected', jsonb_build_object('shop', v_shop),
      null, new.customer_id, new.id, new.supplier_id, null);
  end if;
  return null;
exception when others then
  raise warning 'order notification skipped: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists order_requests_notify on public.order_requests;
create trigger order_requests_notify
  after insert or update of status, quotation_id, customer_response on public.order_requests
  for each row execute function public._notify_order_requests();

-- The order a bill came from, if any (its estimate's order).
create or replace function public._order_of_quotation(p_quotation uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.order_requests where quotation_id = p_quotation and p_quotation is not null
   order by created_at desc limit 1
$$;

create or replace function public._notify_invoices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop text;
  v_name text;
begin
  if new.kind is distinct from 'bill' or new.customer_id is null then
    return null;
  end if;
  select business_name into v_shop from public.suppliers where id = new.supplier_id;

  if tg_op = 'INSERT' then
    perform public._notify('bill_made',
      jsonb_build_object('shop', v_shop, 'bill', new.invoice_no, 'total', public._inr(new.total)),
      null, new.customer_id, public._order_of_quotation(new.quotation_id), new.supplier_id, null);
    return null;
  end if;

  if new.delivered and not coalesce(old.delivered, false) and new.status is distinct from 'Cancelled' then
    perform public._notify('delivered', jsonb_build_object('shop', v_shop, 'bill', new.invoice_no),
      null, new.customer_id, public._order_of_quotation(new.quotation_id), new.supplier_id, null);
  end if;

  if new.received_at is not null and old.received_at is null then
    select name into v_name from public.customers where id = new.customer_id;
    perform public._notify('material_received', jsonb_build_object('name', v_name, 'bill', new.invoice_no),
      new.supplier_id, null, null, new.supplier_id, '/invoices/' || new.id);
  end if;
  return null;
exception when others then
  raise warning 'bill notification skipped: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists invoices_notify on public.invoices;
create trigger invoices_notify
  after insert or update of delivered, received_at on public.invoices
  for each row execute function public._notify_invoices();

create or replace function public._notify_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_shop text;
begin
  v_customer := coalesce(new.customer_id, (select customer_id from public.invoices where id = new.invoice_id));
  if v_customer is null or new.amount <= 0 then
    return null;
  end if;
  select business_name into v_shop from public.suppliers where id = new.supplier_id;
  perform public._notify('payment_received',
    jsonb_build_object('shop', v_shop, 'rupees', new.amount, 'amount', public._inr(new.amount), 'mode', new.mode),
    null, v_customer, null, new.supplier_id, null);
  return null;
exception when others then
  raise warning 'payment notification skipped: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists payments_notify on public.payments;
create trigger payments_notify
  after insert on public.payments
  for each row execute function public._notify_payments();

create or replace function public._notify_complaints()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_shop text;
begin
  if tg_op = 'INSERT' then
    select name into v_name from public.customers where id = new.customer_id;
    perform public._notify('complaint_new', jsonb_build_object('name', v_name, 'bill', new.invoice_no),
      new.supplier_id, null, null, new.supplier_id, '/complaints');
  elsif new.supplier_response is not null and new.supplier_response is distinct from old.supplier_response then
    select business_name into v_shop from public.suppliers where id = new.supplier_id;
    perform public._notify('complaint_reply', jsonb_build_object('shop', v_shop, 'bill', new.invoice_no),
      null, new.customer_id, null, new.supplier_id, null);
  end if;
  return null;
exception when others then
  raise warning 'complaint notification skipped: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists customer_complaints_notify on public.customer_complaints;
create trigger customer_complaints_notify
  after insert or update of supplier_response on public.customer_complaints
  for each row execute function public._notify_complaints();

create or replace function public._notify_khata_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select name into v_name from public.customers where id = new.customer_id;
  perform public._notify('khata_request', jsonb_build_object('name', v_name),
    new.supplier_id, null, null, new.supplier_id, '/dashboard');
  return null;
exception when others then
  raise warning 'khata request notification skipped: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists khata_link_requests_notify on public.khata_link_requests;
create trigger khata_link_requests_notify
  after insert on public.khata_link_requests
  for each row execute function public._notify_khata_requests();

-- Stock crossing the low-stock line on the way down, once — the same line
-- the Dashboard's banner uses (5 when the shop set none).
create or replace function public._notify_low_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line numeric := coalesce(new.low_stock_threshold, 5);
begin
  if old.stock_qty > v_line and new.stock_qty <= v_line then
    perform public._notify('low_stock',
      jsonb_build_object('name', new.name, 'qty', trim(to_char(new.stock_qty, 'FM999999990.##'), '.'),
        'unit', coalesce(new.stock_unit, new.unit_label, '')),
      new.supplier_id, null, null, new.supplier_id, '/materials');
  end if;
  return null;
exception when others then
  raise warning 'low stock notification skipped: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists materials_notify_low_stock on public.materials;
create trigger materials_notify_low_stock
  after update of stock_qty on public.materials
  for each row execute function public._notify_low_stock();

create or replace function public._notify_compliance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(new.legal_name, new.contact_name, new.email, 'a shop');
  v_admin uuid;
begin
  if tg_op = 'INSERT' then
    if new.is_applicant then
      for v_admin in select id from public.suppliers where role = 'admin' loop
        perform public._notify('admin_application',
          jsonb_build_object('name', v_name, 'plan', new.requested_plan),
          v_admin, null, null, null, '/admin/compliance/' || new.user_id);
      end loop;
    end if;
    return null;
  end if;

  if new.status = 'UNDER_REVIEW' and old.status is distinct from 'UNDER_REVIEW' then
    for v_admin in select id from public.suppliers where role = 'admin' loop
      perform public._notify('admin_kyc_sent', jsonb_build_object('name', v_name),
        v_admin, null, null, null, '/admin/compliance/' || new.user_id);
    end loop;
  end if;

  if new.status = 'APPROVED' and old.status is distinct from 'APPROVED' then
    if old.is_applicant and not new.is_applicant then
      perform public._notify('application_accepted', '{}'::jsonb, new.user_id, null, null, null, '/dashboard');
    else
      perform public._notify('kyc_approved', '{}'::jsonb, new.user_id, null, null, null, '/settings?s=kyc');
    end if;
  elsif new.status = 'REJECTED' and old.status is distinct from 'REJECTED' then
    perform public._notify('kyc_rejected', jsonb_build_object('reason', new.decision_reason),
      new.user_id, null, null, null, case when new.is_applicant then '/application' else '/settings?s=kyc' end);
  elsif new.status = 'SUSPENDED' and old.status is distinct from 'SUSPENDED' then
    perform public._notify('orders_suspended', '{}'::jsonb, new.user_id, null, null, null, '/settings?s=kyc');
  elsif new.correction_reason is not null and new.correction_reason is distinct from old.correction_reason then
    perform public._notify('kyc_correction', jsonb_build_object('reason', new.correction_reason),
      new.user_id, null, null, null, case when new.is_applicant then '/application' else '/settings?s=kyc' end);
  end if;
  return null;
exception when others then
  raise warning 'compliance notification skipped: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists supplier_compliance_notify on public.supplier_compliance;
create trigger supplier_compliance_notify
  after insert or update of status, correction_reason, is_applicant on public.supplier_compliance
  for each row execute function public._notify_compliance();

-- A stopped khata link stops that link's alerts too.
create or replace function public._khata_link_push_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.khata_token is distinct from old.khata_token then
    delete from public.push_subscriptions where customer_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists customers_khata_push_cleanup on public.customers;
create trigger customers_khata_push_cleanup
  after update of khata_token on public.customers
  for each row execute function public._khata_link_push_cleanup();

-- ── 5. Plans ending: once a day, 10:00 India time ───────────────────────

create or replace function public.notify_plans_ending()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  r record;
  v_count integer;
  v_admin uuid;
  v_sent integer := 0;
begin
  for r in
    select id, subscription_expiry, subscription_expiry - v_today as days from public.suppliers
     where role = 'supplier' and status = 'active' and subscription_expiry is not null
       and subscription_expiry - v_today in (7, 3, 1, 0)
  loop
    perform public._notify('plan_ending',
      jsonb_build_object('days', r.days, 'date', to_char(r.subscription_expiry, 'DD Mon YYYY')),
      r.id, null, null, r.id, '/settings');
    v_sent := v_sent + 1;
  end loop;

  select count(*) into v_count from public.suppliers
   where role = 'supplier' and status = 'active'
     and subscription_expiry between v_today and v_today + 7;
  if v_count > 0 then
    for v_admin in select id from public.suppliers where role = 'admin' loop
      perform public._notify('admin_renewals', jsonb_build_object('count', v_count),
        v_admin, null, null, null, '/admin/suppliers');
    end loop;
  end if;
  return v_sent;
end;
$$;

select cron.schedule(
  'buildsupply-plan-reminders',
  '30 4 * * *',
  $cron$select public.notify_plans_ending();$cron$
);

-- ── 6. Phones agreeing to alerts ────────────────────────────────────────

-- A login's own phone (no link), a customer's phone through their khata link,
-- or through one order's status link.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_lang text default 'en',
  p_khata text default null, p_order text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_customer uuid;
  v_order uuid;
  v_lang text := case when p_lang in ('en', 'hi', 'mr') then p_lang else 'en' end;
begin
  if p_order is not null then
    select id into v_order from public.order_requests where public_token = p_order;
    if v_order is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  elsif p_khata is not null then
    select c.id into v_customer from public.customers c join public.suppliers s on s.id = c.supplier_id
     where c.khata_token = p_khata and s.status = 'active';
    if v_customer is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  else
    v_user := auth.uid();
    if v_user is null then return jsonb_build_object('ok', false, 'error', 'signed_out'); end if;
  end if;

  insert into public.push_subscriptions (endpoint, p256dh, auth, lang, user_id, customer_id, order_id)
  values (p_endpoint, p_p256dh, p_auth, v_lang, v_user, v_customer, v_order)
  on conflict on constraint push_subscriptions_once
  do update set p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang;

  -- Ten phones per person or link is plenty; the oldest go first.
  delete from public.push_subscriptions where id in (
    select id from public.push_subscriptions
     where user_id is not distinct from v_user and customer_id is not distinct from v_customer
       and order_id is not distinct from v_order
     order by created_at desc offset 10);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.remove_push_subscription(
  p_endpoint text, p_khata text default null, p_order text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_order is not null then
    delete from public.push_subscriptions s using public.order_requests o
     where s.endpoint = p_endpoint and s.order_id = o.id and o.public_token = p_order;
  elsif p_khata is not null then
    delete from public.push_subscriptions s using public.customers c
     where s.endpoint = p_endpoint and s.customer_id = c.id and c.khata_token = p_khata;
  elsif auth.uid() is not null then
    delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.push_subscribed(
  p_endpoint text, p_khata text default null, p_order text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_order is not null then exists (
      select 1 from public.push_subscriptions s join public.order_requests o on o.id = s.order_id
       where s.endpoint = p_endpoint and o.public_token = p_order)
    when p_khata is not null then exists (
      select 1 from public.push_subscriptions s join public.customers c on c.id = s.customer_id
       where s.endpoint = p_endpoint and c.khata_token = p_khata)
    else exists (
      select 1 from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid())
  end
$$;

-- ── 7. The bell ─────────────────────────────────────────────────────────

-- Runs as the caller: RLS decides which rows "all" means.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language sql
security invoker
set search_path = public
as $$
  with done as (
    update public.notifications set read_at = now()
     where read_at is null and (p_ids is null or id = any (p_ids))
    returning 1)
  select count(*)::integer from done
$$;

-- ── 8. For the send-push function only ──────────────────────────────────

-- Takes the alerts due (once — a second caller gets nothing) and returns one
-- message per phone, in that phone's language, with where tapping it goes.
create or replace function public.claim_push_batch(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  with due as (
    update public.notifications n set push_at = now()
     where n.id in (
       select id from public.notifications
        where push_at is null and created_at > now() - interval '1 day'
        order by created_at limit greatest(1, least(p_limit, 500))
        for update skip locked)
    returning n.id, n.kind, n.text, n.link, n.user_id, n.customer_id, n.order_id
  ), targets as (
    select distinct on (d.id, s.endpoint)
           d.id as nid, d.kind, d.text, d.link, d.user_id as n_user,
           s.id as sid, s.endpoint, s.p256dh, s.auth, s.lang,
           s.user_id as s_user, s.customer_id as s_customer, s.order_id as s_order
      from due d
      join public.push_subscriptions s on (
           (d.user_id is not null and s.user_id = d.user_id)
        or (d.order_id is not null and s.order_id = d.order_id)
        or (d.customer_id is not null and (
              s.customer_id = d.customer_id
           or s.user_id in (select c.user_id from public.customer_connections c
                             where c.customer_id = d.customer_id and c.revoked_at is null))))
     order by d.id, s.endpoint, (s.order_id is not null) desc
  ), addressed as (
    select t.*,
           case when t.n_user is not null then coalesce(t.link, '/dashboard')
                when t.s_order is not null then '/order-status/' || (select public_token from public.order_requests where id = t.s_order)
                when t.s_customer is not null then '/khata/' || (select khata_token from public.customers where id = t.s_customer)
                else '/me' end as url
      from targets t
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'sub', sid, 'endpoint', endpoint, 'p256dh', p256dh, 'auth', auth,
           'title', coalesce(text->lang->>'t', text->'en'->>'t'),
           'body', coalesce(text->lang->>'b', text->'en'->>'b'),
           'tag', kind || ':' || nid,
           'url', url)), '[]'::jsonb)
    into v
    from addressed
   where url is not null;
  return v;
end;
$$;

-- What the push services answered: delivered, or the phone has gone (404/410).
create or replace function public.push_results(p_sent uuid[], p_gone uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_subscriptions set last_sent_at = now() where id = any (coalesce(p_sent, '{}'));
  delete from public.push_subscriptions where id = any (coalesce(p_gone, '{}'));
$$;

-- ── 9. Who may call what ────────────────────────────────────────────────

revoke all on function public._inr(numeric) from public, anon, authenticated;
revoke all on function public._notification_text(text, jsonb) from public, anon, authenticated;
revoke all on function public._notify(text, jsonb, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public._push_ping() from public, anon, authenticated;
revoke all on function public._notify_order_requests() from public, anon, authenticated;
revoke all on function public._order_of_quotation(uuid) from public, anon, authenticated;
revoke all on function public._notify_invoices() from public, anon, authenticated;
revoke all on function public._notify_payments() from public, anon, authenticated;
revoke all on function public._notify_complaints() from public, anon, authenticated;
revoke all on function public._notify_khata_requests() from public, anon, authenticated;
revoke all on function public._notify_low_stock() from public, anon, authenticated;
revoke all on function public._notify_compliance() from public, anon, authenticated;
revoke all on function public._khata_link_push_cleanup() from public, anon, authenticated;
revoke all on function public.notify_plans_ending() from public, anon, authenticated;

revoke all on function public.save_push_subscription(text, text, text, text, text, text) from public;
grant execute on function public.save_push_subscription(text, text, text, text, text, text) to anon, authenticated;
revoke all on function public.remove_push_subscription(text, text, text) from public;
grant execute on function public.remove_push_subscription(text, text, text) to anon, authenticated;
revoke all on function public.push_subscribed(text, text, text) from public;
grant execute on function public.push_subscribed(text, text, text) to anon, authenticated;

revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

revoke all on function public.claim_push_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_push_batch(integer) to service_role;
revoke all on function public.push_results(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.push_results(uuid[], uuid[]) to service_role;

commit;
