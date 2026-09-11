-- 027: a reason the customer can see when an online order is rejected.
--
-- The supplier picks one from a short list, or "Other" and types it, and the
-- customer's status link shows it — the listed ones in the customer's own
-- language. Nothing else about rejecting changes: no message is sent, and no
-- bill, payment, stock or balance moves.
--
-- Safe to paste twice. Needs 026.

begin;

-- ── 1. The reason code ─────────────────────────────────────────────────

alter table public.order_requests add column if not exists reject_code text;

alter table public.order_requests drop constraint if exists order_requests_reject_code_check;
alter table public.order_requests add constraint order_requests_reject_code_check
  check (reject_code is null
         or reject_code in ('no_stock', 'too_many_orders', 'area_not_served', 'date_not_possible', 'other'));

-- ── 2. reject_order takes the code ─────────────────────────────────────
-- The two-argument version goes, so there is only one to call. p_code has a
-- default, so the app from before this change (no code) still works.

drop function if exists public.reject_order(uuid, text);

create or replace function public.reject_order(p_order_id uuid, p_reason text default null, p_code text default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier uuid := public._require_supplier();
  v_status text;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 200), '');
begin
  if p_code is not null
     and p_code not in ('no_stock', 'too_many_orders', 'area_not_served', 'date_not_possible', 'other') then
    raise exception 'Please choose a reason.';
  end if;
  if p_code = 'other' and v_reason is null then
    raise exception 'Please write the reason.';
  end if;
  select status into v_status from public.order_requests where id = p_order_id for no key update;
  if not found then
    raise exception 'Order not found.';
  end if;
  if v_status = 'rejected' then
    return jsonb_build_object('already', true);
  end if;
  if v_status = 'approved' then
    raise exception 'This order was already turned into an estimate.';
  end if;
  update public.order_requests
     set status = 'rejected',
         reject_code = p_code,
         -- A listed reason speaks for itself; only "Other" (or the older app)
         -- keeps typed words.
         reject_reason = case when p_code is null or p_code = 'other' then v_reason end,
         decided_at = now()
   where id = p_order_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── 3. The customer's status link shows the reason ─────────────────────
-- Only once the order is rejected, and nothing else new: still no prices,
-- phone, name, note or ids.

create or replace function public.order_status(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o record;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('found', false);
  end if;
  select r.status, r.created_at, r.delivery_date, r.items, r.reject_code, r.reject_reason, s.business_name into o
    from public.order_requests r
    join public.suppliers s on s.id = r.supplier_id
   where r.public_token = p_token;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'status', o.status,
    'business_name', o.business_name,
    'created_at', o.created_at,
    'delivery_date', o.delivery_date,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', i->>'name', 'unit', i->>'unit', 'qty', (i->>'qty')::numeric) order by n)
        from jsonb_array_elements(o.items) with ordinality as x(i, n)), '[]'::jsonb))
    || case when o.status = 'rejected'
            then jsonb_build_object('reject_code', o.reject_code, 'reject_reason', o.reject_reason)
            else '{}'::jsonb end;
end;
$$;

-- ── 4. Who may call what ───────────────────────────────────────────────
-- DROP FUNCTION took reject_order's grants with it; order_status keeps its
-- own, but they are restated so this file alone says who may call what.

revoke all on function public.reject_order(uuid, text, text) from public, anon;
grant execute on function public.reject_order(uuid, text, text) to authenticated, service_role;

revoke all on function public.order_status(text) from public;
grant execute on function public.order_status(text) to anon, authenticated, service_role;

commit;
