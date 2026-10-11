-- 043 — the owner's own profile, and which business details print on bills.
--
-- Asked for 2026-10-12 (decisions recorded in CLAUDE.md, Phase 32):
--
--   * "Your profile", apart from the business profile: the owner's name
--     (already a column, now editable in the app), a personal mobile — private
--     from customers, visible to the BuildSupply admin — and a photo, which
--     customers DO see beside the shop's name.
--   * What prints on bills: shop-wide defaults (logo, phone, address, GSTIN)
--     for future bills, and an override on any one bill. Bills only. A bill
--     records the defaults in force when it was issued (`issuer.print`), so a
--     later change of default never alters a bill already issued.
--   * Every new bill keeps a copy of the business details it was issued with
--     (`invoices.issuer`), so changing the address or GSTIN later never
--     rewrites an old bill. Bills made before 043 have none — their original
--     details were never recorded and are not guessed — and print as before.
--   * Customers see only photos the shop itself added: the catalog photo
--     fallback is removed from the shop page (the user's call).
--
-- Legal lock: a bill that charges GST, from a shop with a GSTIN, always
-- prints the business name, address and GSTIN, whatever the settings say.
-- That rule lives in the app (lib/billPrint.ts), which is the only thing that
-- prints. What GST law requires beyond that is for the user's CA to confirm.
--
-- No existing row changes: every new column starts empty, and empty means
-- "as today". Safe to run twice. Needs 042 first.

do $$
begin
  if to_regclass('public.supplier_offers') is null then
    raise exception '043 needs migration 042 first. Nothing was changed.';
  end if;
end $$;

-- ── Print choices: the same shape everywhere ────────────────────────────

-- {"logo": bool, "phone": bool, "address": bool, "gstin": bool}, any subset.
create or replace function public._valid_print_options(p jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and not exists (
      select 1 from jsonb_each(p) e
       where e.key not in ('logo', 'phone', 'address', 'gstin') or jsonb_typeof(e.value) <> 'boolean'
    )
  );
$$;

-- ── The owner's profile, and the shop's defaults ────────────────────────

alter table public.suppliers
  add column if not exists owner_mobile text,
  add column if not exists owner_photo_url text,
  add column if not exists bill_print jsonb;

alter table public.suppliers drop constraint if exists suppliers_owner_mobile_check;
alter table public.suppliers add constraint suppliers_owner_mobile_check
  check (owner_mobile is null or owner_mobile ~ '^[0-9]{10}$');
alter table public.suppliers drop constraint if exists suppliers_owner_photo_url_check;
alter table public.suppliers add constraint suppliers_owner_photo_url_check
  check (owner_photo_url is null or (owner_photo_url ~ '^(https://|http://(localhost|127\.0\.0\.1)(:[0-9]+)?/)' and length(owner_photo_url) <= 500));
alter table public.suppliers drop constraint if exists suppliers_owner_name_check;
alter table public.suppliers add constraint suppliers_owner_name_check
  check (owner_name is null or length(owner_name) <= 80);
alter table public.suppliers drop constraint if exists suppliers_bill_print_check;
alter table public.suppliers add constraint suppliers_bill_print_check
  check (public._valid_print_options(bill_print));

-- ── Each bill: its own choices, and the details it was issued with ──────

alter table public.invoices
  add column if not exists print_options jsonb,
  add column if not exists issuer jsonb;

alter table public.invoices drop constraint if exists invoices_print_options_check;
alter table public.invoices add constraint invoices_print_options_check
  check (public._valid_print_options(print_options));

-- The copy is made by the database when a bill is created, from the shop's
-- own row, so the app can neither skip it nor send a different one. After
-- that the app's signed-in users cannot change it. Runs as the caller (not
-- security definer) so `current_user` really is the caller — the supplier
-- can read their own row. A restore switches user triggers off, so a backed-up
-- copy goes back exactly as it was.
create or replace function public._invoice_issuer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.kind = 'bill' then
      select jsonb_build_object(
               'business_name', s.business_name,
               'address', nullif(btrim(coalesce(s.address, '')), ''),
               'phone', nullif(btrim(coalesce(s.phone, '')), ''),
               'gst_number', nullif(btrim(coalesce(s.gst_number, '')), ''),
               'logo_url', s.logo_url,
               -- The shop's print defaults as they stood when the bill was
               -- issued, so changing a default later changes future bills only.
               'print', s.bill_print)
        into new.issuer
        from public.suppliers s
       where s.id = new.supplier_id;
    else
      new.issuer := null;
    end if;
  elsif new.issuer is distinct from old.issuer and current_user in ('authenticated', 'anon') then
    raise exception 'A bill keeps the business details it was issued with.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_issuer on public.invoices;
create trigger invoices_issuer
  before insert or update of issuer on public.invoices
  for each row execute function public._invoice_issuer();

-- One bill's print choices: null puts it back on the shop's defaults.
create or replace function public.set_invoice_print_options(p_invoice uuid, p_options jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not public._valid_print_options(p_options) then
    raise exception 'Those print choices are not valid.';
  end if;
  update public.invoices
     set print_options = case when p_options = '{}'::jsonb then null else p_options end
   where id = p_invoice and kind = 'bill' and supplier_id = auth.uid();
  if not found then
    raise exception 'Bill not found.';
  end if;
end;
$$;
revoke all on function public.set_invoice_print_options(uuid, jsonb) from public, anon;
grant execute on function public.set_invoice_print_options(uuid, jsonb) to authenticated;

-- ── The shop page: the owner's photo; the shop's own material photos only ─

create or replace function public._shop_profile_json(p_supplier uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'found', true,
    'business_name', s.business_name,
    'logo_url', s.logo_url,
    'owner_photo_url', s.owner_photo_url,
    'phone', nullif(btrim(coalesce(s.phone, '')), ''),
    'address', nullif(btrim(coalesce(s.address, '')), ''),
    'cover_url', s.cover_url,
    'brand_color', s.brand_color,
    'about', nullif(btrim(coalesce(s.about, '')), ''),
    'whatsapp', s.whatsapp,
    'hours', s.hours,
    'delivery_info', nullif(btrim(coalesce(s.delivery_info, '')), ''),
    'social', s.social,
    'order_link', case when s.ordering_enabled then s.order_link end,
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object('title', o.title, 'details', o.details, 'valid_until', o.valid_until)
                       order by o.created_at desc)
        from (select * from public.supplier_offers o
               where o.supplier_id = s.id and o.active
                 and (o.valid_until is null or o.valid_until >= (now() at time zone 'Asia/Kolkata')::date)
               order by o.created_at desc limit 5) o), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_object_agg(m.id, m.photo_url)
        from public.materials m
       where m.supplier_id = s.id and m.photo_url is not null), '{}'::jsonb)
  )
    from public.suppliers s
   where s.id = p_supplier and s.role = 'supplier' and s.status = 'active';
$$;

-- ── A customer's copy of a bill prints like the shop's ──────────────────
-- 035's khata_document, unchanged except that a bill also carries its issued
-- details (with the defaults in force then) and its own print choices, so the PDF a
-- customer downloads from their khata link matches the shop's. Same
-- signature, so `create or replace` keeps its grants.

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
         q.total, q.status into d
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
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('description', qi.description, 'qty', qi.qty, 'rate', qi.rate,
                                          'amount', qi.amount, 'gst_rate', qi.gst_rate, 'gst_amount', qi.gst_amount)
                       order by qi.ctid)
        from public.quotation_items qi
       where qi.quotation_id = d.id), '[]'::jsonb));
end;
$$;
