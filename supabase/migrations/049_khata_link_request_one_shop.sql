-- 049 — Asking one particular shop to resend a khata link (2026-10-20).
--
-- The "Lost your khata link?" page lists the shops this phone has used before
-- (remembered on the phone, never looked up). Picking one asks that shop only;
-- "Ask every shop that has my number" still uses 048's request_khata_link.
--
-- Like 048 it never says whether the number belongs to anyone at that shop:
-- the answer is always {ok: true}. The shop is named by its order link, which
-- the phone already holds. Same limits as 048: one open request per customer
-- per 24 hours, 100 an hour across the platform.
--
-- Additive: one function, nothing else touched. Safe to run twice.

begin;

create or replace function public.request_khata_link_from(p_phone text, p_link text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := public._normalize_phone(p_phone);
begin
  if v_phone is null or v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a 10-digit mobile number.';
  end if;
  if (select count(*) from public.khata_link_requests where created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Too many requests right now. Please try again in a while.';
  end if;
  perform pg_advisory_xact_lock(hashtext('khata-link-request:' || v_phone));
  insert into public.khata_link_requests (supplier_id, customer_id)
  select c.supplier_id, c.id
    from public.customers c
    join public.suppliers s on s.id = c.supplier_id
   where c.phone = v_phone
     and s.order_link = lower(btrim(coalesce(p_link, '')))
     and s.status = 'active'
     and s.role = 'supplier'
     and not exists (
       select 1 from public.khata_link_requests r
        where r.customer_id = c.id
          and r.handled_at is null
          and r.created_at > now() - interval '24 hours');
  -- The same answer whether or not that shop has this number.
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.request_khata_link_from(text, text) from public;
grant execute on function public.request_khata_link_from(text, text) to anon, authenticated;

commit;
