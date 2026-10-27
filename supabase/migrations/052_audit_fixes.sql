-- 052 — fixes from the pre-onboarding audit (docs/BUILDSUPPLY_FULL_SYSTEM_AUDIT.md),
-- 2026-10-27. Paste after 051. Safe to run twice. Nothing existing is
-- deleted, and no bill, payment, estimate or order already stored is
-- changed by running it.
--
--   F-01  A payment entered by mistake can be corrected. Nothing is edited
--         or deleted: a correction adds a REVERSAL entry (the wrong amount,
--         negative) and, if there was a right amount, a new receipt for it.
--         Every total in the app — the khata, the dashboard, statements,
--         reports — already adds payments up, so they all come out right by
--         themselves. The wrong entry stays on record with its reason.
--   F-02  An online order never silently drops a line. A material the shop
--         no longer sells, a quantity that can't be read or is too large, is
--         refused with a clear message instead of disappearing from the
--         order. An open order page that still shows old prices is told so
--         before anything is sent (only when the page says what it showed).
--         Each line keeps the price the shop listed when it was ordered.
--   F-03  Estimates have a "valid until" date. New ones get 15 days (the
--         shop can change or clear it); every estimate saved before this
--         keeps none, so nothing already sent expires. A customer can't
--         accept an expired estimate from an old link; "call me" still works.
--   F-04  Turning an estimate into a bill keeps the GST the estimate was
--         made with, line by line, instead of today's percentage.
--   F-08  The nightly subscription job's function is the cron job's only.
--   F-15  A shop the admin has suspended can't record bills, payments or
--         stock the moment it is suspended, even on a phone whose login has
--         not run out yet.

begin;

-- ── 1. F-01 — correcting a payment ──────────────────────────────────────

-- A correction points at the entry it corrects. The reversal (amount < 0)
-- and the right amount (amount > 0) both carry the reason.
alter table public.payments add column if not exists corrects_payment_id uuid
  references public.payments (id) on delete cascade;
alter table public.payments add column if not exists correction_reason text;

alter table public.payments drop constraint if exists payments_amount_sign;
alter table public.payments add constraint payments_amount_sign
  check (amount > 0 or (amount < 0 and corrects_payment_id is not null));
alter table public.payments drop constraint if exists payments_correction_reason_length;
alter table public.payments add constraint payments_correction_reason_length
  check (correction_reason is null or char_length(correction_reason) between 3 and 200);

-- One reversal and at most one right amount per entry.
create unique index if not exists payments_one_reversal
  on public.payments (corrects_payment_id) where amount < 0;
create unique index if not exists payments_one_replacement
  on public.payments (corrects_payment_id) where amount > 0;

-- What part of a receipt is not on any bill. A reversal holds no money, and
-- neither does an entry that has been reversed — so neither can ever be put
-- onto a bill, here or by _apply_advance.
create or replace function public._receipt_remaining(p_payment_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select case
           when p.amount <= 0 then 0
           when exists (select 1 from public.payments r
                         where r.corrects_payment_id = p.id and r.amount < 0) then 0
           else p.amount - coalesce((select sum(a.amount) from public.payment_allocations a
                                      where a.payment_id = p.id and a.released_at is null), 0)
         end
    from public.payments p
   where p.id = p_payment_id
$$;

-- The commit-time backstop, now also refusing money on a reversed entry.
create or replace function public._check_allocation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_total numeric;
  v_on_bill numeric;
  v_received numeric;
  v_used numeric;
begin
  select total into v_total from public.invoices where id = new.invoice_id;
  select coalesce(sum(amount), 0) into v_on_bill
    from public.payment_allocations where invoice_id = new.invoice_id and released_at is null;
  if v_on_bill > v_total + 0.005 then
    raise exception 'A bill can''t be paid more than its total.';
  end if;

  select amount into v_received from public.payments where id = new.payment_id;
  select coalesce(sum(amount), 0) into v_used
    from public.payment_allocations where payment_id = new.payment_id and released_at is null;
  if v_used > v_received + 0.005 then
    raise exception 'A payment can''t be used for more than was received.';
  end if;
  if v_used > 0.005 and exists (select 1 from public.payments r
                                 where r.corrects_payment_id = new.payment_id and r.amount < 0) then
    raise exception 'A payment that was corrected can''t be put on a bill.';
  end if;
  return null;
end;
$$;

-- Corrects one payment, in one step, under the customer's lock.
--   p_new_amount null or 0: the entry was a mistake — it is reversed.
--   p_new_amount > 0:       the right amount (and mode) replaces it. It goes
--                           onto the bills the wrong one paid, in the same
--                           order, and what is left follows the usual rule.
-- Money the customer holds as advance then moves onto any bill that owes
-- again, as it does when a new bill is made.
create or replace function public.correct_payment(
  p_request_id uuid,
  p_payment_id uuid,
  p_reason text,
  p_new_amount numeric default null,
  p_new_mode text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_prior jsonb;
  v_reason text := nullif(btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g')), '');
  v_new_amount numeric := round(coalesce(p_new_amount, 0), 2);
  v_new_mode text;
  p public.payments%rowtype;
  v_now timestamptz := clock_timestamp();
  v_bills uuid[];
  v_bill uuid;
  v_new uuid;
  v_remaining numeric;
  v_take numeric;
  b record;
  v_part jsonb;
  v_applied jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  v_prior := public._claim_request(v_supplier, p_request_id, 'payment_correction');
  if v_prior is not null then
    return v_prior;
  end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'Write a few words on why this entry is wrong.';
  end if;
  if char_length(v_reason) > 200 then
    raise exception 'Keep the reason under 200 characters.';
  end if;
  if v_new_amount < 0 then
    raise exception 'The right amount can''t be negative.';
  end if;

  select * into p from public.payments where id = p_payment_id;
  if not found or p.supplier_id <> v_supplier then
    raise exception 'Payment not found.';
  end if;
  if p.customer_id is null then
    raise exception 'This payment is not linked to a customer, so it can''t be corrected here.';
  end if;
  perform public._lock_customer(p.customer_id);
  -- Read again under the lock: another phone may have corrected it just now.
  select * into p from public.payments where id = p_payment_id for no key update;
  if p.amount <= 0 then
    raise exception 'This is a correction itself and can''t be corrected again.';
  end if;
  if exists (select 1 from public.payments r where r.corrects_payment_id = p.id and r.amount < 0) then
    raise exception 'This payment has already been corrected.';
  end if;
  v_new_mode := coalesce(nullif(btrim(coalesce(p_new_mode, '')), ''), p.mode);
  if v_new_amount = p.amount and v_new_mode = p.mode then
    raise exception 'That is the same amount and mode as the entry, so there is nothing to correct.';
  end if;

  -- 1. Off the bills it paid, remembering the order it went onto them.
  select array_agg(x.invoice_id order by x.first_at, x.invoice_id) into v_bills
    from (select a.invoice_id, min(a.created_at) as first_at
            from public.payment_allocations a
           where a.payment_id = p.id and a.released_at is null
           group by a.invoice_id) x;
  update public.payment_allocations
     set released_at = v_now, released_reason = 'Payment corrected'
   where payment_id = p.id and released_at is null;
  if v_bills is not null then
    foreach v_bill in array v_bills loop
      perform public._refresh_paid(v_bill);
    end loop;
  end if;

  -- 2. The right amount, if there is one. Written before the reversal so the
  --    customer's alert can say both figures.
  if v_new_amount > 0 then
    insert into public.payments (supplier_id, customer_id, amount, mode, is_advance, corrects_payment_id, correction_reason)
    values (v_supplier, p.customer_id, v_new_amount, v_new_mode, p.is_advance, p.id, v_reason)
    returning id into v_new;
  end if;

  -- 3. The reversal: the whole wrong amount, back. The wrong entry itself is
  --    neither edited nor deleted.
  insert into public.payments (supplier_id, customer_id, amount, mode, is_advance, corrects_payment_id, correction_reason)
  values (v_supplier, p.customer_id, -p.amount, p.mode, p.is_advance, p.id, v_reason);

  -- 4. The right amount goes where the wrong one went.
  if v_new is not null then
    v_remaining := v_new_amount;
    if v_bills is not null then
      foreach v_bill in array v_bills loop
        exit when v_remaining <= 0;
        select id, invoice_no, total, paid into b
          from public.invoices
         where id = v_bill and status <> 'Cancelled'
           for no key update;
        continue when not found or b.paid >= b.total;
        v_take := least(b.total - b.paid, v_remaining);
        insert into public.payment_allocations (supplier_id, payment_id, invoice_id, amount)
        values (v_supplier, v_new, b.id, v_take);
        perform public._refresh_paid(b.id);
        v_applied := v_applied || jsonb_build_array(jsonb_build_object('invoice_id', b.id, 'invoice_no', b.invoice_no, 'amount', v_take));
        v_remaining := v_remaining - v_take;
      end loop;
    end if;
    if v_remaining > 0 then
      v_part := public._allocate_receipt(v_supplier, p.customer_id, v_new, null);
      v_applied := v_applied || (v_part->'applied');
    end if;
  end if;

  -- 5. Advance the customer already holds moves onto bills owing again.
  perform public._apply_advance(p.customer_id);

  v_result := jsonb_build_object(
                'reversed', p.amount,
                'corrected_to', case when v_new is null then null else v_new_amount end,
                'mode', v_new_mode,
                'applied', v_applied,
                'advance', case when v_new is null then 0 else public._receipt_remaining(v_new) end)
              || public._customer_position(p.customer_id);
  perform public._finish_request(v_supplier, p_request_id, v_result);
  return v_result;
end;
$$;

revoke all on function public.correct_payment(uuid, uuid, text, numeric, text) from public, anon;
grant execute on function public.correct_payment(uuid, uuid, text, numeric, text) to authenticated, service_role;

-- The customer hears about a correction once, from the reversal: what the
-- entry was and what it is now. The right amount's own "received" alert is
-- not sent — it is the same money, not new money.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'order_new', 'estimate_answer', 'complaint_new', 'khata_request', 'material_received', 'low_stock',
  'plan_ending', 'application_accepted', 'kyc_approved', 'kyc_correction', 'kyc_rejected', 'orders_suspended',
  'order_accepted', 'estimate_ready', 'order_rejected', 'bill_made', 'delivered', 'payment_received',
  'complaint_reply', 'payment_corrected',
  'admin_application', 'admin_kyc_sent', 'admin_renewals'));

-- 051's _notification_text, with the correction alert added (052). The
-- rest is exactly as 051 wrote it.
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
  when 'payment_corrected' then
    en_t := s || ' corrected a payment entry';
    hi_t := s || ' ने एक भुगतान एंट्री ठीक की';
    mr_t := s || ' ने एक पेमेंट नोंद दुरुस्त केली';
    if p->>'new' is not null then
      en_b := (p->>'old') || ' → ' || (p->>'new');  hi_b := en_b;  mr_b := en_b;
    else
      en_b := (p->>'old') || ' entry cancelled';
      hi_b := (p->>'old') || ' की एंट्री रद्द की गई';
      mr_b := (p->>'old') || ' ची नोंद रद्द केली';
    end if;
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

revoke all on function public._notification_text(text, jsonb) from public, anon, authenticated;

create or replace function public._notify_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_shop text;
  v_new numeric;
begin
  v_customer := coalesce(new.customer_id, (select customer_id from public.invoices where id = new.invoice_id));
  if v_customer is null then
    return null;
  end if;
  -- A correction (052): one alert, from the reversal, naming both figures.
  if new.corrects_payment_id is not null then
    if new.amount < 0 then
      select business_name into v_shop from public.suppliers where id = new.supplier_id;
      select amount into v_new from public.payments
       where corrects_payment_id = new.corrects_payment_id and amount > 0;
      perform public._notify('payment_corrected',
        jsonb_build_object('shop', v_shop, 'old', public._inr(-new.amount),
                           'new', case when v_new is null then null else public._inr(v_new) end),
        null, v_customer, null, new.supplier_id, null);
    end if;
    return null;
  end if;
  if new.amount <= 0 then
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

revoke all on function public._notify_payments() from public, anon, authenticated;

-- ── 2. F-02 — an order never silently loses a line ──────────────────────
-- 050's place_order. What changed:
--   * an item that can't be read, a material this shop no longer has, or a
--     quantity above 1,00,000 is refused, never dropped;
--   * a line may say what price the page showed ('price', and 'delivery' for
--     the delivery charge). If the shop has changed it since, nothing is
--     kept and the answer is {ok: false, changed: true}, so the page can
--     show the new prices and the customer can send again. A page that does
--     not say (an older one) is not checked, exactly as before;
--   * each line keeps the price the shop listed at that moment
--     ('listed_price', null when prices are hidden) for the shop to see.
-- The price a customer sees is still only an indication: nothing here is
-- ever used to price an estimate or a bill.
create or replace function public.place_order(
  p_link text,
  p_request_id uuid,
  p_name text,
  p_phone text,
  p_site text,
  p_delivery_date date,
  p_note text,
  p_items jsonb,
  p_trap text default null,
  p_payment_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  c record;
  v_id uuid;
  v_token text;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := public._normalize_phone(p_phone);
  v_site text := nullif(btrim(coalesce(p_site, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_items jsonb;
  v_count int;
  v_pay text;
begin
  -- A hidden field only bots fill in: they are told it worked, and nothing is kept.
  if btrim(coalesce(p_trap, '')) <> '' then
    return jsonb_build_object('ok', true, 'token', null);
  end if;

  select id, ordering_enabled, order_show_prices, status, upi_id, khata_upi_enabled into s
    from public.suppliers
   where order_link = lower(btrim(coalesce(p_link, ''))) and role = 'supplier';
  if not found or not s.ordering_enabled or s.status <> 'active' then
    raise exception 'Online ordering is currently unavailable.';
  end if;
  if p_request_id is null then
    raise exception 'Something went wrong. Please try again.';
  end if;

  -- The same form sent twice (a double tap, a retry): the first order.
  select public_token into v_token
    from public.order_requests where supplier_id = s.id and request_id = p_request_id;
  if found then
    return jsonb_build_object('ok', true, 'token', v_token, 'duplicate', true);
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'Please enter your name.';
  end if;
  if v_phone !~ '^[0-9]{10}$' then
    raise exception 'Please enter a 10-digit mobile number.';
  end if;

  -- A number this supplier blocked: told it worked, like the bot trap, and
  -- nothing is kept — so there is nothing to learn by trying again.
  if exists (select 1 from public.order_blocked_phones where supplier_id = s.id and phone = v_phone) then
    return jsonb_build_object('ok', true, 'token', null);
  end if;

  if p_delivery_date is not null and (p_delivery_date < v_today or p_delivery_date > v_today + 90) then
    raise exception 'Please choose a delivery date within the next 90 days.';
  end if;
  if char_length(coalesce(v_site, '')) > 120 then
    raise exception 'The site or address is too long.';
  end if;
  if char_length(coalesce(v_note, '')) > 300 then
    raise exception 'The note is too long.';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 60 then
    raise exception 'Please send fewer items in one order.';
  end if;

  -- Every line must be readable: a material id and a quantity with at most
  -- two decimals. Before 052 an unreadable line was simply left out.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as a(e)
     where jsonb_typeof(e) <> 'object'
        or coalesce(e->>'material_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or coalesce(e->>'qty', '') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$'
  ) then
    raise exception 'A quantity in your cart could not be read. Please check your cart and send again.';
  end if;

  -- A material the shop has removed: refused, so the customer is never told
  -- an order went through without it.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as a(e)
     where (e->>'qty')::numeric > 0
       and not exists (select 1 from public.materials m
                        where m.id = (e->>'material_id')::uuid and m.supplier_id = s.id)
  ) then
    raise exception 'Something in your cart is no longer sold by this shop. Please check your cart and send again.';
  end if;

  if exists (
    with grouped as (
      select (e->>'material_id')::uuid as mid, sum(round((e->>'qty')::numeric, 2)) as qty
        from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as a(e)
       where (e->>'qty')::numeric > 0
       group by 1
    )
    select 1 from grouped where qty > 100000
  ) then
    raise exception 'A quantity is too large. Please call the shop for an order this big.';
  end if;

  -- What the customer chose, against what the shop sells today.
  if exists (
    with grouped as (
      select (e->>'material_id')::uuid as mid, sum(round((e->>'qty')::numeric, 2)) as qty
        from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as a(e)
       where (e->>'qty')::numeric > 0
       group by 1
    )
    select 1 from grouped g
      join public.materials m on m.id = g.mid and m.supplier_id = s.id
     where not m.available
  ) then
    raise exception 'Something you chose is not available right now. Please remove it and send again.';
  end if;

  if exists (
    with grouped as (
      select (e->>'material_id')::uuid as mid, sum(round((e->>'qty')::numeric, 2)) as qty
        from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as a(e)
       where (e->>'qty')::numeric > 0
       group by 1
    )
    select 1 from grouped g
      join public.materials m on m.id = g.mid and m.supplier_id = s.id
     where (m.sold_by = 'vehicle' and g.qty <> trunc(g.qty))
        or (m.sold_by is distinct from 'vehicle' and m.min_qty is not null and g.qty < m.min_qty)
        or (m.sold_by is distinct from 'vehicle' and m.qty_step is not null and mod(g.qty, m.qty_step) <> 0)
  ) then
    raise exception 'A quantity does not match how the shop sells it. Vehicle loads are whole numbers; check the minimum and steps shown.';
  end if;

  -- The page showed a price (or a delivery charge) the shop has changed
  -- since: nothing is kept, and the page shows the new one first.
  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as a(e)
      join public.materials m on m.id = (e->>'material_id')::uuid and m.supplier_id = s.id
     where (e->>'qty')::numeric > 0
       and ((e ? 'price'
             and (case when jsonb_typeof(e->'price') = 'number' then (e->>'price')::numeric end)
                 is distinct from (case when s.order_show_prices and m.rate > 0 then m.rate end))
         or (e ? 'delivery'
             and (case when jsonb_typeof(e->'delivery') = 'number' then (e->>'delivery')::numeric end)
                 is distinct from (case when s.order_show_prices and m.delivery_charge > 0 then m.delivery_charge end)))
  ) then
    return jsonb_build_object('ok', false, 'changed', true);
  end if;

  -- Only this supplier's own materials, positive quantities, and the name and
  -- unit as the supplier has them. A price sent by the page is never kept.
  with raw as (
    select (e->>'material_id')::uuid as mid, round((e->>'qty')::numeric, 2) as qty, ord
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(e, ord)
  ), grouped as (
    select mid, sum(qty) as qty, min(ord) as ord
      from raw where qty > 0 group by mid
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'material_id', m.id,
           'name', m.name,
           'unit', coalesce(nullif(btrim(m.unit_label), ''), nullif(btrim(m.per_label), ''), nullif(btrim(m.stock_unit), ''), ''),
           'qty', g.qty,
           -- What the shop listed when this was ordered (052), for the shop's
           -- own reference. Null while prices are hidden.
           'listed_price', case when s.order_show_prices and m.rate > 0 then m.rate end)
           -- What one load was when it was ordered, kept with the order.
           || case when m.sold_by = 'vehicle' then jsonb_build_object(
                'listing_name', btrim(m.listing_name),
                'vehicle', btrim(m.vehicle),
                'capacity', m.capacity,
                'capacity_unit', btrim(m.capacity_unit))
              else '{}'::jsonb end
           order by g.ord), '[]'::jsonb),
         count(*)
    into v_items, v_count
    from grouped g
    join public.materials m on m.id = g.mid and m.supplier_id = s.id;
  if v_count = 0 then
    raise exception 'Please add at least one material.';
  end if;

  -- Paying online is only real where the shop takes UPI; anything else the
  -- form might send becomes cash, and where the question was never asked at
  -- all the order simply carries nothing.
  v_pay := case
             when lower(coalesce(p_payment_method, '')) = 'online'
                  and s.khata_upi_enabled and s.upi_id is not null then 'online'
             when lower(coalesce(p_payment_method, '')) in ('cash', 'online') then 'cash'
             else null
           end;

  -- Plain spam limits. A genuine customer never meets them.
  if (select count(*) from public.order_requests
       where supplier_id = s.id and phone = v_phone and status = 'pending'
         and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'You already have orders waiting with this supplier. Please call them instead.';
  end if;
  select * into c from public._order_client(s.id);
  if c.client_hash is not null and (select count(*) from public.order_request_clients
       where supplier_id = s.id and client_hash = c.client_hash
         and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many orders from this phone just now. Please try again later, or call the shop.';
  end if;
  if (select count(*) from public.order_requests
       where supplier_id = s.id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many orders right now. Please try again in a while.';
  end if;

  insert into public.order_requests (supplier_id, request_id, customer_name, phone, site, delivery_date, note, items, payment_method)
  values (s.id, p_request_id, v_name, v_phone, v_site, p_delivery_date, v_note, v_items, v_pay)
  on conflict (supplier_id, request_id) do nothing
  returning id, public_token into v_id, v_token;
  if v_token is null then
    -- Two taps arriving at the same instant: the other one got in first.
    select public_token into v_token
      from public.order_requests where supplier_id = s.id and request_id = p_request_id;
    return jsonb_build_object('ok', true, 'token', v_token, 'duplicate', true);
  end if;

  if c.client_hash is not null then
    insert into public.order_request_clients (order_id, supplier_id, client_hash, source)
    values (v_id, s.id, c.client_hash, c.source);
  end if;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

-- ── 3. F-03 — an estimate is valid until a date ─────────────────────────
-- Added WITHOUT a default first, so every estimate already saved keeps none
-- (it never expires); only estimates made from now on get 15 days.
alter table public.quotations add column if not exists valid_until date;
alter table public.quotations alter column valid_until
  set default ((now() at time zone 'Asia/Kolkata')::date + 15);

-- The one rule, shared by everything that shows or answers an estimate: an
-- open estimate past its date — unless the customer accepted it in time.
create or replace function public._estimate_expired(p_status text, p_valid_until date, p_response text)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_status in ('Draft', 'Sent')
                  and p_valid_until is not null
                  and p_valid_until < (now() at time zone 'Asia/Kolkata')::date
                  and p_response is distinct from 'accepted', false)
$$;

revoke all on function public._estimate_expired(text, date, text) from public, anon;
grant execute on function public._estimate_expired(text, date, text) to authenticated, service_role;

-- 030's respond_to_estimate: an expired estimate can't be accepted. "Call
-- me" still can — that is how a customer asks for a fresh price.
create or replace function public.respond_to_estimate(p_token text, p_response text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('found', false);
  end if;
  if p_response is null or p_response not in ('accepted', 'call_me') then
    raise exception 'Please choose Accept or Please call me.';
  end if;
  select o.id, o.status, o.customer_response, qt.status as quote_status, qt.valid_until,
         s.status as supplier_status into r
    from public.order_requests o
    join public.suppliers s on s.id = o.supplier_id
    left join public.quotations qt on qt.id = o.quotation_id
   where o.public_token = p_token
     for no key update of o;
  if not found or r.supplier_status <> 'active' then
    return jsonb_build_object('found', false);
  end if;
  if r.status <> 'approved' or r.quote_status is null then
    raise exception 'There is no estimate to answer yet.';
  end if;
  if r.quote_status not in ('Draft', 'Sent') then
    raise exception 'This estimate can no longer be changed.';
  end if;
  if r.customer_response = p_response then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if p_response = 'accepted' and public._estimate_expired(r.quote_status, r.valid_until, r.customer_response) then
    raise exception 'This estimate has expired. Please ask the shop for a fresh price.';
  end if;
  update public.order_requests set customer_response = p_response, responded_at = now() where id = r.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- 047's order_status: the estimate also says when it was made, until when
-- it holds and whether it has expired. An expired estimate is not owed, so
-- it is not offered as a UPI amount either.
create or replace function public.order_status(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o record;
  q record;
  b record;
  v jsonb;
  v_due numeric := 0;
  v_expired boolean;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('found', false);
  end if;
  select r.status, r.created_at, r.decided_at, r.delivery_date, r.items, r.reject_code, r.reject_reason,
         r.quotation_id, r.customer_response, r.responded_at, r.payment_method,
         s.business_name, s.order_link, s.ordering_enabled, s.status as supplier_status,
         s.upi_id, s.khata_upi_enabled into o
    from public.order_requests r
    join public.suppliers s on s.id = r.supplier_id
   where r.public_token = p_token;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  v := jsonb_build_object(
    'found', true,
    'status', o.status,
    'business_name', o.business_name,
    'created_at', o.created_at,
    'decided_at', o.decided_at,
    'delivery_date', o.delivery_date,
    'payment_method', o.payment_method,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', i->>'name', 'unit', i->>'unit', 'qty', (i->>'qty')::numeric) order by n)
        from jsonb_array_elements(o.items) with ordinality as x(i, n)), '[]'::jsonb));
  -- "Order more": only while the supplier takes orders.
  if o.ordering_enabled and o.supplier_status = 'active' and o.order_link is not null then
    v := v || jsonb_build_object('order_link', o.order_link);
  end if;
  if o.status = 'rejected' then
    v := v || jsonb_build_object('reject_code', o.reject_code, 'reject_reason', o.reject_reason);
  end if;
  -- Approved: the estimate the supplier made from it, the customer's answer,
  -- and the bill once the estimate became one.
  if o.status = 'approved' and o.quotation_id is not null then
    select qt.id, qt.quote_no, qt.status, qt.subtotal, qt.gst_amount, qt.transport_labour_charge, qt.total,
           qt.created_at, qt.valid_until into q
      from public.quotations qt
     where qt.id = o.quotation_id;
    if found then
      v_expired := public._estimate_expired(q.status, q.valid_until, o.customer_response);
      -- The estimate is owed only while it is still open (047, #10) and has
      -- not expired (052, F-03).
      v_due := case when q.status in ('Draft', 'Sent') and not v_expired then coalesce(q.total, 0) else 0 end;
      v := v || jsonb_build_object(
        'estimate', jsonb_build_object(
          'quote_no', q.quote_no,
          'status', q.status,
          'subtotal', q.subtotal,
          'gst_amount', q.gst_amount,
          'transport_labour_charge', q.transport_labour_charge,
          'total', q.total,
          'created_at', q.created_at,
          'valid_until', q.valid_until,
          'expired', v_expired,
          'items', coalesce((
            select jsonb_agg(jsonb_build_object('description', qi.description, 'qty', qi.qty, 'rate', qi.rate, 'amount', qi.amount)
                             -- The order they were saved in (047, #28), as
                             -- khata_document and the estimate PDF show them;
                             -- the ids are random uuids.
                             order by qi.ctid)
              from public.quotation_items qi
             where qi.quotation_id = q.id), '[]'::jsonb)),
        'response', o.customer_response,
        'responded_at', o.responded_at);
      select i.invoice_no, i.created_at, i.delivered, i.delivered_at, i.received_at, i.total, i.paid into b
        from public.invoices i
       where i.quotation_id = q.id and i.kind = 'bill' and i.status <> 'Cancelled'
       order by i.created_at desc, i.id desc
       limit 1;
      if found then
        -- Once there is a bill it is the bill that is owed, not the estimate.
        v_due := greatest(0, coalesce(b.total, 0) - coalesce(b.paid, 0));
        v := v || jsonb_build_object('bill', jsonb_build_object(
          'invoice_no', b.invoice_no, 'created_at', b.created_at, 'delivered', b.delivered,
          'delivered_at', b.delivered_at, 'received_at', b.received_at,
          'total', b.total, 'paid', b.paid));
      end if;
    end if;
  end if;
  -- Only for the customer who said they would pay online, and only while
  -- there is an amount and the shop still takes UPI.
  if o.payment_method = 'online' and o.khata_upi_enabled and o.upi_id is not null and v_due > 0.005 then
    v := v || jsonb_build_object('upi_id', o.upi_id, 'due', v_due);
  end if;
  return v;
end;
$$;

-- 047's customer_khata. What changed (052):
--   * each payment says whether it is a reversal ('reversal'), whether it was
--     reversed later ('reversed'), whether it is the right amount replacing a
--     wrong one ('correction'), and the shop's reason;
--   * each estimate says until when it holds and whether it has expired.
-- Nothing else moved.
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
         sp.upi_id, sp.khata_upi_enabled, sp.order_link, sp.ordering_enabled into s
    from public.suppliers sp
   where sp.id = c.supplier_id;
  -- Like the order page: nothing while the account is not active. But say
  -- it is paused (047, #11): the link itself is still good, so the phone
  -- must not forget it, and the customer is not told to ask for a new one.
  -- Nothing of the shop or the account is returned.
  if not found then
    return jsonb_build_object('found', false);
  end if;
  if s.status <> 'active' then
    return jsonb_build_object('found', false, 'paused', true);
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
                                          'total', i.total, 'paid', i.paid, 'created_at', i.created_at,
                                          'delivered', i.delivered, 'delivered_at', i.delivered_at, 'received_at', i.received_at,
                                          -- False means the shop took this order by phone or at
                                          -- the counter: no order_request ever stood behind it.
                                          'from_order', i.quotation_id is not null and exists (
                                            select 1 from public.order_requests o
                                             where o.supplier_id = c.supplier_id
                                               and o.quotation_id = i.quotation_id))
                       order by i.created_at, i.id)
        from public.invoices i
       where i.customer_id = c.id and i.status <> 'Cancelled'), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'amount', p.amount, 'mode', p.mode, 'created_at', p.created_at,
               -- Corrections (052): a reversal takes a wrong entry back; the
               -- wrong entry stays, marked; a corrected entry replaces it.
               'reversal', p.amount < 0,
               'reversed', exists (select 1 from public.payments r
                                    where r.corrects_payment_id = p.id and r.amount < 0),
               'correction', p.corrects_payment_id is not null and p.amount > 0,
               'reason', p.correction_reason,
               'payment_allocations', coalesce((
                 select jsonb_agg(jsonb_build_object('amount', a.amount, 'released_at', null,
                                                     'invoices', jsonb_build_object('invoice_no', i2.invoice_no, 'kind', i2.kind, 'site', i2.site)))
                   from public.payment_allocations a
                   join public.invoices i2 on i2.id = a.invoice_id
                  where a.payment_id = p.id and a.released_at is null), '[]'::jsonb))
             order by p.created_at, p.id)
        from public.payments p
       where p.customer_id = c.id), '[]'::jsonb),
    -- Their estimates, newest 20: number, status, site, total, until when it
    -- holds — the lines come through khata_document when they download one.
    'estimates', coalesce((
      select jsonb_agg(jsonb_build_object('quote_no', x.quote_no, 'status', x.status, 'site', x.site,
                                          'total', x.total, 'created_at', x.created_at,
                                          'valid_until', x.valid_until,
                                          'expired', public._estimate_expired(x.status, x.valid_until, x.response))
                       order by x.created_at desc, x.id desc)
        from (select q.id, q.quote_no, q.status, q.site, q.total, q.created_at, q.valid_until,
                     (select o.customer_response from public.order_requests o
                       where o.quotation_id = q.id
                       order by o.created_at desc limit 1) as response
                from public.quotations q
               where q.customer_id = c.id
               order by q.created_at desc, q.id desc
               limit 20) x), '[]'::jsonb),
    -- Their online orders, newest 10: made into this customer, or placed from
    -- their phone and not yet decided. 'code' opens the order's status link.
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object('code', x.public_token, 'status', x.status, 'created_at', x.created_at,
                                          'delivery_date', x.delivery_date, 'item_count', jsonb_array_length(x.items),
                                          -- Whether the shop has priced it yet (047, #2): an
                                          -- approved order without one is "accepted", not
                                          -- "estimate ready".
                                          'has_estimate', x.quotation_id is not null,
                                          -- The bill this order turned into, once one exists —
                                          -- the same link order_status already reports.
                                          'bill', (select i.invoice_no
                                                     from public.invoices i
                                                    where i.quotation_id = x.quotation_id
                                                      and i.status <> 'Cancelled'
                                                    order by i.created_at, i.id
                                                    limit 1))
                       order by x.created_at desc, x.id desc)
        from (select o.id, o.public_token, o.status, o.created_at, o.delivery_date, o.items, o.quotation_id
                from public.order_requests o
               where o.supplier_id = c.supplier_id
                 and (o.customer_id = c.id or (o.customer_id is null and c.phone is not null and o.phone = c.phone))
               order by o.created_at desc, o.id desc
               limit 10) x), '[]'::jsonb))
    -- "Pay by UPI" only when the supplier has switched it on and set an ID.
    || case when s.khata_upi_enabled and s.upi_id is not null
            then jsonb_build_object('upi_id', s.upi_id)
            else '{}'::jsonb end
    -- "Order materials" only while the supplier takes orders.
    || case when s.ordering_enabled and s.order_link is not null
            then jsonb_build_object('order_link', s.order_link)
            else '{}'::jsonb end;
end;
$$;

-- 043's khata_document: an estimate also says until when it holds, so the
-- customer's PDF prints it as the shop's does.
create or replace function public.khata_document(p_token text, p_kind text, p_no text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  d record;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' or coalesce(p_kind, '') not in ('bill', 'estimate') then
    return jsonb_build_object('found', false);
  end if;
  select cu.id, s.status as supplier_status into c
    from public.customers cu
    join public.suppliers s on s.id = cu.supplier_id
   where cu.khata_token = p_token;
  if not found or c.supplier_status <> 'active' then
    return jsonb_build_object('found', false);
  end if;

  if p_kind = 'bill' then
    select i.id, i.invoice_no, i.created_at, i.site, i.subtotal, i.gst_amount, i.transport_labour_charge,
           i.total, i.paid, i.status, i.issuer, i.print_options into d
      from public.invoices i
     where i.customer_id = c.id and i.invoice_no = p_no and i.kind = 'bill' and i.status <> 'Cancelled'
     order by i.created_at desc
     limit 1;
    if not found then
      return jsonb_build_object('found', false);
    end if;
    return jsonb_build_object(
      'found', true,
      'kind', 'bill',
      'invoice_no', d.invoice_no,
      'created_at', d.created_at,
      'site', d.site,
      'subtotal', d.subtotal,
      'gst_amount', d.gst_amount,
      'transport_labour_charge', d.transport_labour_charge,
      'total', d.total,
      'paid', d.paid,
      'status', d.status,
      'issuer', d.issuer,
      'print_options', d.print_options,
      -- Lines in the order they were saved, as the bill page lists them
      -- (ids are random, so ordering by id would shuffle them).
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('description', ii.description, 'qty', ii.qty, 'rate', ii.rate,
                                            'amount', ii.amount, 'gst_rate', ii.gst_rate, 'gst_amount', ii.gst_amount)
                         order by ii.ctid)
          from public.invoice_items ii
         where ii.invoice_id = d.id), '[]'::jsonb));
  end if;

  select q.id, q.quote_no, q.created_at, q.site, q.subtotal, q.gst_amount, q.transport_labour_charge,
         q.total, q.status, q.valid_until into d
    from public.quotations q
   where q.customer_id = c.id and q.quote_no = p_no
   order by q.created_at desc
   limit 1;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'kind', 'estimate',
    'quote_no', d.quote_no,
    'created_at', d.created_at,
    'site', d.site,
    'subtotal', d.subtotal,
    'gst_amount', d.gst_amount,
    'transport_labour_charge', d.transport_labour_charge,
    'total', d.total,
    'status', d.status,
    'valid_until', d.valid_until,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('description', qi.description, 'qty', qi.qty, 'rate', qi.rate,
                                          'amount', qi.amount, 'gst_rate', qi.gst_rate, 'gst_amount', qi.gst_amount)
                       order by qi.ctid)
        from public.quotation_items qi
       where qi.quotation_id = d.id), '[]'::jsonb));
end;
$$;

-- ── 4. F-04 — a converted estimate keeps its GST ────────────────────────

-- The bill's lines priced with the GST the estimate was made with. Each bill
-- line is matched to an estimate line with the same material, quantity and
-- rate (duplicates in turn), so the order they arrive in does not matter.
-- A matched line takes the estimate's percentage — 18 for an estimate saved
-- before 035, which charged one 18% on the whole estimate. A line with no
-- match (the shop changed it) is priced as any new line is.
create or replace function public._price_items_from_estimate(
  p_supplier uuid, p_quotation uuid, p_items jsonb, p_gst boolean)
returns jsonb
language sql
stable
set search_path = public
as $$
  with bill as (
    select e.x, e.ord,
           nullif(e.x->>'material_id', '')::uuid as mid,
           coalesce((e.x->>'qty')::numeric, 0) as qty,
           coalesce((e.x->>'rate')::numeric, 0) as rate
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as e(x, ord)
  ), bill_n as (
    select b.*, row_number() over (partition by b.mid, b.qty, b.rate order by b.ord) as k
      from bill b
  ), est as (
    select qi.material_id as mid, qi.qty, qi.rate, qi.gst_rate,
           row_number() over (partition by qi.material_id, qi.qty, qi.rate order by qi.ctid) as k
      from public.quotation_items qi
     where qi.quotation_id = p_quotation
  )
  select coalesce(jsonb_agg(
           b.x || jsonb_build_object('gst_rate', v.rate,
                                     'gst_amount', round(b.qty * b.rate * v.rate / 100))
           order by b.ord), '[]'::jsonb)
    from bill_n b
    left join est on est.mid is not distinct from b.mid and est.qty = b.qty and est.rate = b.rate and est.k = b.k
    left join public.materials m on m.id = b.mid and m.supplier_id = p_supplier
   cross join lateral (
     select case
              when not p_gst then 0
              when est.k is not null then coalesce(est.gst_rate, 18)
              else coalesce(m.gst_rate, 18)
            end as rate) v
$$;

-- True when the bill is exactly a pre-035 estimate's lines (same materials,
-- quantities and rates, nothing added or left out). Such an estimate showed
-- one GST figure for the whole estimate; the bill then charges exactly that
-- figure, so it can't differ by a rupee of rounding.
create or replace function public._is_legacy_estimate_copy(p_quotation uuid, p_items jsonb)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.quotation_items where quotation_id = p_quotation)
     and not exists (select 1 from public.quotation_items where quotation_id = p_quotation and gst_rate is not null)
     and (select array_agg(k order by k)
            from (select coalesce(qi.material_id::text, '') || '|' || trim_scale(qi.qty)::text || '|' || trim_scale(qi.rate)::text as k
                    from public.quotation_items qi where qi.quotation_id = p_quotation) e)
       = (select array_agg(k order by k)
            from (select coalesce(nullif(x->>'material_id', ''), '') || '|' || trim_scale((x->>'qty')::numeric)::text
                         || '|' || trim_scale(coalesce((x->>'rate')::numeric, 0))::text as k
                    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
                   where coalesce((x->>'qty')::numeric, 0) > 0) b)
$$;

revoke all on function public._price_items_from_estimate(uuid, uuid, jsonb, boolean) from public, anon;
grant execute on function public._price_items_from_estimate(uuid, uuid, jsonb, boolean) to authenticated, service_role;
revoke all on function public._is_legacy_estimate_copy(uuid, jsonb) from public, anon;
grant execute on function public._is_legacy_estimate_copy(uuid, jsonb) to authenticated, service_role;

-- 035's create_invoice. What changed: a bill made from an estimate is taxed
-- as the estimate was (above). Nothing else moved.
create or replace function public.create_invoice(
  p_request_id uuid,
  p_customer_id uuid,
  p_site text,
  p_items jsonb,
  p_gst boolean default false,
  p_transport numeric default 0,
  p_payments jsonb default null,
  p_quotation_id uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_prior jsonb;
  v_items jsonb;
  v_subtotal numeric;
  v_gst numeric;
  v_transport numeric := coalesce(p_transport, 0);
  v_total numeric;
  v_seq bigint;
  v_id uuid;
  v_split jsonb;
  v_amount numeric;
  v_receipt uuid;
  v_part jsonb;
  v_applied jsonb := '[]'::jsonb;
  v_advance numeric := 0;
  v_took boolean := false;
  v_payment jsonb := null;
  v_result jsonb;
  v_quote_gst numeric;
begin
  v_prior := public._claim_request(v_supplier, p_request_id, 'invoice');
  if v_prior is not null then
    return v_prior;
  end if;
  if p_customer_id is null then
    raise exception 'Pick a customer for this bill.';
  end if;
  if v_transport < 0 then
    raise exception 'Transport and labour can''t be negative.';
  end if;

  perform public._lock_customer(p_customer_id);
  v_subtotal := public._check_items(p_items);
  if p_quotation_id is null then
    v_items := public._price_items(v_supplier, p_items, p_gst);
    v_gst := public._items_gst(v_items);
  else
    -- Made from an estimate: the GST it was quoted with (052, F-04).
    v_items := public._price_items_from_estimate(v_supplier, p_quotation_id, p_items, p_gst);
    v_gst := public._items_gst(v_items);
    select gst_amount into v_quote_gst from public.quotations where id = p_quotation_id;
    if p_gst and coalesce(v_quote_gst, 0) > 0 and public._is_legacy_estimate_copy(p_quotation_id, p_items) then
      v_items := (select coalesce(jsonb_agg(x || '{"gst_rate": null, "gst_amount": 0}'::jsonb order by ord), '[]'::jsonb)
                    from jsonb_array_elements(v_items) with ordinality as t(x, ord));
      v_gst := v_quote_gst;
    end if;
  end if;
  v_total := v_subtotal + v_gst + v_transport;

  if p_quotation_id is not null then
    perform 1 from public.quotations where id = p_quotation_id and status in ('Draft', 'Sent') for no key update;
    if not found then
      raise exception 'This estimate was already turned into a bill.';
    end if;
  end if;

  -- One number at a time per supplier. Cancelled bills keep theirs, and any
  -- bill number that isn't INV-<digits> simply doesn't count.
  perform pg_advisory_xact_lock(hashtextextended('invoice_no:' || v_supplier::text, 0));
  select coalesce(max(substring(invoice_no from '^INV-(\d+)$')::bigint), 1000) + 1
    into v_seq
    from public.invoices
   where supplier_id = v_supplier and kind = 'bill';

  insert into public.invoices
    (supplier_id, invoice_no, customer_id, quotation_id, site, subtotal, gst_amount,
     transport_labour_charge, total, paid, status, kind)
  values
    (v_supplier, 'INV-' || v_seq, p_customer_id, p_quotation_id, nullif(btrim(coalesce(p_site, '')), ''),
     v_subtotal, v_gst, v_transport, v_total, 0, public._invoice_status(v_total, 0), 'bill')
  returning id into v_id;

  perform public._insert_items(v_supplier, v_id, v_items);

  if p_quotation_id is not null then
    update public.quotations set status = 'Converted', converted_invoice_id = v_id where id = p_quotation_id;
  end if;

  -- Advance already held goes onto the new bill before anything is collected.
  perform public._apply_advance(p_customer_id);

  -- Money taken at the counter: one receipt per mode (cash, and the rest by
  -- UPI), in the order given, each onto this bill first.
  for v_split in select value from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    v_amount := coalesce((v_split->>'amount')::numeric, 0);
    continue when v_amount <= 0;
    insert into public.payments (supplier_id, customer_id, amount, mode)
    values (v_supplier, p_customer_id, v_amount, coalesce(v_split->>'mode', 'Cash'))
    returning id into v_receipt;
    v_part := public._allocate_receipt(v_supplier, p_customer_id, v_receipt, v_id);
    v_applied := v_applied || (v_part->'applied');
    v_advance := v_advance + (v_part->>'unapplied')::numeric;
    v_took := true;
  end loop;
  if v_took then
    v_payment := jsonb_build_object('applied', v_applied, 'advance', v_advance, 'left_over', 0);
  end if;

  v_result := jsonb_build_object(
                'invoice', (select to_jsonb(i) from public.invoices i where i.id = v_id),
                'payment', v_payment)
              || public._customer_position(p_customer_id);
  perform public._finish_request(v_supplier, p_request_id, v_result);
  return v_result;
end;
$$;

-- ── 5. F-08 — the nightly job's function is the nightly job's ───────────
-- 040 took it away from signed-out callers; any signed-in login (a
-- customer's anonymous one included) could still run it. The cron job runs
-- as postgres and does not need the grant.
revoke execute on function public.expire_lapsed_subscriptions() from authenticated;

-- ── 6. F-15 — a suspended shop stops at once ────────────────────────────
-- Every function that records a bill, payment, estimate, delivery or stock
-- change starts here. It now also asks that the caller is a supplier whose
-- account is active, so a shop the admin suspends can't keep writing on a
-- phone whose 15-minute login has not run out yet. A customer's or an
-- applicant's login, which has no supplier row, is told plainly.
create or replace function public._require_supplier()
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v uuid := auth.uid();
  v_status text;
begin
  if v is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  select status into v_status from public.suppliers where id = v and role = 'supplier';
  if not found then
    raise exception 'Only a shop''s own login can do this.';
  end if;
  if v_status <> 'active' then
    raise exception 'This account is paused. Please contact BuildSupply.';
  end if;
  return v;
end;
$$;

commit;
