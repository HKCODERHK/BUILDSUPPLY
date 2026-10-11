-- 042 — the shop's own page: branding and details a customer sees.
--
-- Asked for 2026-10-12: let a supplier make the customer side their own —
-- a cover picture, a brand colour, product photos, a few lines about the
-- business, WhatsApp, business hours, delivery information, offers and
-- social links. (The logo, phone and address already existed. Reviews were
-- deliberately left out for now.)
--
-- Everything here is something the supplier chooses to publish. It reaches
-- customers only through two new read-only functions, and only while the
-- shop's account is active:
--   * shop_profile(link, khata) — by the order link (while ordering is on,
--     exactly when order_page answers) or by a customer's khata link code;
--   * my_shop_profile(connection) — for a customer's own account (041).
-- order_page, customer_khata and order_status are NOT touched.
--
-- The brand colour is one of ten names, never a free value: each was checked
-- to keep white button text readable (WCAG AA) in light and dark mode.
-- Pictures live in the existing public `logos` bucket, in the supplier's own
-- folder, under 039's limits (2 MB, PNG/JPEG/WebP) and 041's rule that only
-- a supplier may upload. Links are `https://` only (pictures may also be
-- `http://localhost` / `http://127.0.0.1`, which is what a local test copy's
-- storage serves; to a real customer those point nowhere).
--
-- No existing row changes. Safe to run twice. Needs 041 first.

do $$
begin
  if to_regclass('public.customer_connections') is null then
    raise exception '042 needs migration 041 first. Nothing was changed.';
  end if;
end $$;

-- ── The shop's details ──────────────────────────────────────────────────

alter table public.suppliers
  add column if not exists cover_url text,
  add column if not exists brand_color text,
  add column if not exists about text,
  add column if not exists whatsapp text,
  add column if not exists hours jsonb,
  add column if not exists delivery_info text,
  add column if not exists social jsonb;

alter table public.suppliers drop constraint if exists suppliers_cover_url_check;
alter table public.suppliers add constraint suppliers_cover_url_check
  check (cover_url is null or (cover_url ~ '^(https://|http://(localhost|127\.0\.0\.1)(:[0-9]+)?/)' and length(cover_url) <= 500));
alter table public.suppliers drop constraint if exists suppliers_brand_color_check;
alter table public.suppliers add constraint suppliers_brand_color_check
  check (brand_color is null or brand_color in
    ('green', 'teal', 'blue', 'indigo', 'violet', 'pink', 'red', 'orange', 'brown', 'slate'));
alter table public.suppliers drop constraint if exists suppliers_about_check;
alter table public.suppliers add constraint suppliers_about_check
  check (about is null or length(about) <= 600);
alter table public.suppliers drop constraint if exists suppliers_whatsapp_check;
alter table public.suppliers add constraint suppliers_whatsapp_check
  check (whatsapp is null or whatsapp ~ '^[0-9]{10}$');
alter table public.suppliers drop constraint if exists suppliers_hours_check;
alter table public.suppliers add constraint suppliers_hours_check
  check (hours is null or (jsonb_typeof(hours) = 'object' and length(hours::text) <= 2000));
alter table public.suppliers drop constraint if exists suppliers_delivery_info_check;
alter table public.suppliers add constraint suppliers_delivery_info_check
  check (delivery_info is null or length(delivery_info) <= 400);
alter table public.suppliers drop constraint if exists suppliers_social_check;
alter table public.suppliers add constraint suppliers_social_check
  check (social is null or (jsonb_typeof(social) = 'object' and length(social::text) <= 1000));

-- A material's own photo. Without one, a material added from the catalog
-- shows the catalog's photo (master_material_variants.image_url).
alter table public.materials add column if not exists photo_url text;
alter table public.materials drop constraint if exists materials_photo_url_check;
alter table public.materials add constraint materials_photo_url_check
  check (photo_url is null or (photo_url ~ '^(https://|http://(localhost|127\.0\.0\.1)(:[0-9]+)?/)' and length(photo_url) <= 500));

-- ── Offers ──────────────────────────────────────────────────────────────

create table if not exists public.supplier_offers (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null default auth.uid() references public.suppliers (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 80),
  details text check (details is null or length(details) <= 300),
  valid_until date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists supplier_offers_supplier on public.supplier_offers (supplier_id);

alter table public.supplier_offers enable row level security;
-- A supplier's own offers only — no admin access, as for every business table
-- since 019. Customers read live offers through shop_profile, never the table.
drop policy if exists supplier_offers_own on public.supplier_offers;
create policy supplier_offers_own on public.supplier_offers
  for all using (supplier_id = auth.uid()) with check (supplier_id = auth.uid());
revoke all on public.supplier_offers from anon, authenticated;
grant select, insert, update, delete on public.supplier_offers to authenticated;

-- ── What a customer is shown ────────────────────────────────────────────

-- The public part of one shop, for an active shop only. Offers: switched on
-- and not past their date (the shop's own calendar day, India), newest five.
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
      select jsonb_object_agg(m.id, coalesce(m.photo_url, v.image_url))
        from public.materials m
        left join public.master_material_variants v on v.id = m.master_material_id
       where m.supplier_id = s.id and coalesce(m.photo_url, v.image_url) is not null), '{}'::jsonb)
  )
    from public.suppliers s
   where s.id = p_supplier and s.role = 'supplier' and s.status = 'active';
$$;
revoke all on function public._shop_profile_json(uuid) from public, anon, authenticated;

-- By the order link (only while ordering is on, as order_page) or by a
-- customer's khata link code (any active shop — the customer already has
-- that shop's khata).
create or replace function public.shop_profile(p_link text default null, p_khata text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_supplier uuid;
begin
  if p_khata is not null then
    if p_khata !~ '^[0-9a-f]{32}$' then
      return jsonb_build_object('found', false);
    end if;
    select supplier_id into v_supplier from public.customers where khata_token = p_khata;
  elsif p_link is not null then
    select id into v_supplier from public.suppliers
     where order_link = lower(btrim(p_link)) and role = 'supplier' and ordering_enabled;
  end if;
  if v_supplier is null then
    return jsonb_build_object('found', false);
  end if;
  return coalesce(public._shop_profile_json(v_supplier), jsonb_build_object('found', false));
end;
$$;
revoke all on function public.shop_profile(text, text) from public;
grant execute on function public.shop_profile(text, text) to anon, authenticated;

-- For the customer's own account (041): the shop behind one of their
-- connections.
create or replace function public.my_shop_profile(p_connection uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text := public._connection_token(p_connection);
  v_supplier uuid;
begin
  if v_token is null then
    return jsonb_build_object('found', false);
  end if;
  select supplier_id into v_supplier from public.customers where khata_token = v_token;
  return coalesce(public._shop_profile_json(v_supplier), jsonb_build_object('found', false));
end;
$$;
revoke all on function public.my_shop_profile(uuid) from public, anon;
grant execute on function public.my_shop_profile(uuid) to authenticated;
