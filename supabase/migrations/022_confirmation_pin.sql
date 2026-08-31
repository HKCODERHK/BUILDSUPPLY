-- BuildSupply — a 4-digit confirmation PIN for irreversible actions.
--
-- WHAT THIS IS. A confirmation gate, not a security boundary. Four digits is
-- 10,000 combinations; it exists to answer "is the right person holding this
-- phone right now" before a bill is cancelled or a supplier is switched off.
-- It is not a second factor and must never be treated as one — the real
-- boundary stays Supabase Auth and the RLS policies.
--
-- Even so, it is done properly:
--   * the PIN is bcrypt-hashed, never stored or transmitted in the clear
--   * verification happens here, so the hash never reaches a browser and
--     cannot be attacked offline
--   * five wrong tries locks the PIN for fifteen minutes, which is what makes
--     four digits meaningful at all
--
-- The hash lives in its own table with RLS on and NO policies, so it is
-- unreachable from the client by any route. Only the SECURITY DEFINER
-- functions below can touch it. Putting the hash on `suppliers` would have
-- exposed it, because a supplier can already `select *` from their own row.

create table if not exists public.supplier_pins (
  supplier_id uuid primary key references public.suppliers (id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.supplier_pins enable row level security;

-- Deliberately no policies. Nothing reaches this table except the functions
-- below, which run as the owner.
comment on table public.supplier_pins is
  'Bcrypt-hashed confirmation PINs. RLS is on with no policies on purpose: reachable only through set_pin/verify_pin/clear_pin/pin_status.';

-- Above this rupee amount, taking a payment asks for the PIN. Not secret, so
-- it lives on `suppliers` where the settings screen can read and write it.
alter table public.suppliers
  add column if not exists pin_payment_threshold numeric not null default 25000;

comment on column public.suppliers.pin_payment_threshold is
  'Payments at or above this amount ask for the confirmation PIN. Only applies when a PIN is set.';

-- ── Status ───────────────────────────────────────────────────────────────
create or replace function public.pin_status()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $$
  select jsonb_build_object(
    'has_pin', exists (select 1 from public.supplier_pins where supplier_id = auth.uid()),
    'locked_until', (select locked_until from public.supplier_pins where supplier_id = auth.uid())
  );
$$;


-- ── Shared attempt handling ──────────────────────────────────────────────
-- Every route that checks a PIN goes through this, so none of them can be
-- used as an unthrottled way to guess. Without it, set_pin and clear_pin
-- would happily accept unlimited wrong current-PIN attempts while verify_pin
-- was locked out.
create or replace function public.pin_register_failure()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_row public.supplier_pins%rowtype;
  v_max_attempts constant integer := 5;
  v_lock_minutes constant integer := 15;
begin
  update public.supplier_pins
    set failed_attempts = failed_attempts + 1,
        locked_until = case
          when failed_attempts + 1 >= v_max_attempts then now() + make_interval(mins => v_lock_minutes)
          else null
        end
    where supplier_id = auth.uid()
    returning * into v_row;

  return jsonb_build_object(
    'ok', false,
    'attempts_left', greatest(0, v_max_attempts - v_row.failed_attempts),
    'locked_until', v_row.locked_until
  );
end;
$$;

/** True while the caller's PIN is locked out. */
create or replace function public.pin_locked()
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $$
  select locked_until from public.supplier_pins
  where supplier_id = auth.uid() and locked_until > now();
$$;

-- ── Set or change ────────────────────────────────────────────────────────
-- Changing an existing PIN requires the current one, so someone who walks up
-- to an unlocked phone cannot simply overwrite it.
create or replace function public.set_pin(p_pin text, p_current_pin text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_existing text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in.');
  end if;

  if p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'PIN must be exactly 4 digits.');
  end if;

  -- Refuse the handful of PINs that are barely a PIN at all.
  if p_pin in ('0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321') then
    return jsonb_build_object('ok', false, 'error', 'That PIN is too easy to guess. Choose another.');
  end if;

  select pin_hash into v_existing from public.supplier_pins where supplier_id = auth.uid();

  if v_existing is not null then
    if public.pin_locked() is not null then
      return jsonb_build_object('ok', false, 'error', 'Too many wrong tries. Try again later.', 'locked_until', public.pin_locked());
    end if;
    if p_current_pin is null or v_existing <> extensions.crypt(p_current_pin, v_existing) then
      return public.pin_register_failure() || jsonb_build_object('error', 'Current PIN is wrong.');
    end if;
  end if;

  insert into public.supplier_pins (supplier_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), 0, null, now())
  on conflict (supplier_id) do update
    set pin_hash = excluded.pin_hash,
        failed_attempts = 0,
        locked_until = null,
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

-- ── Verify ───────────────────────────────────────────────────────────────
create or replace function public.verify_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_row public.supplier_pins%rowtype;
  v_max_attempts constant integer := 5;
  v_lock_minutes constant integer := 15;
begin
  select * into v_row from public.supplier_pins where supplier_id = auth.uid();

  -- No PIN set means nothing to confirm against; the caller decides whether
  -- to proceed. The app treats the PIN as opt-in.
  if not found then
    return jsonb_build_object('ok', true, 'no_pin', true);
  end if;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return jsonb_build_object('ok', false, 'locked_until', v_row.locked_until);
  end if;

  if v_row.pin_hash = extensions.crypt(p_pin, v_row.pin_hash) then
    update public.supplier_pins
      set failed_attempts = 0, locked_until = null
      where supplier_id = auth.uid();
    return jsonb_build_object('ok', true);
  end if;

  update public.supplier_pins
    set failed_attempts = v_row.failed_attempts + 1,
        locked_until = case
          when v_row.failed_attempts + 1 >= v_max_attempts then now() + make_interval(mins => v_lock_minutes)
          else null
        end
    where supplier_id = auth.uid()
    returning * into v_row;

  return jsonb_build_object(
    'ok', false,
    'attempts_left', greatest(0, v_max_attempts - v_row.failed_attempts),
    'locked_until', v_row.locked_until
  );
end;
$$;

-- ── Remove ───────────────────────────────────────────────────────────────
create or replace function public.clear_pin(p_current_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_existing text;
begin
  select pin_hash into v_existing from public.supplier_pins where supplier_id = auth.uid();
  if v_existing is null then
    return jsonb_build_object('ok', true);
  end if;
  if public.pin_locked() is not null then
    return jsonb_build_object('ok', false, 'error', 'Too many wrong tries. Try again later.', 'locked_until', public.pin_locked());
  end if;
  if v_existing <> extensions.crypt(p_current_pin, v_existing) then
    return public.pin_register_failure() || jsonb_build_object('error', 'Current PIN is wrong.');
  end if;
  delete from public.supplier_pins where supplier_id = auth.uid();
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.pin_register_failure() from public, anon;
revoke all on function public.pin_locked() from public, anon;
revoke all on function public.pin_status() from public, anon;
revoke all on function public.set_pin(text, text) from public, anon;
revoke all on function public.verify_pin(text) from public, anon;
revoke all on function public.clear_pin(text) from public, anon;

grant execute on function public.pin_locked() to authenticated;
grant execute on function public.pin_status() to authenticated;
grant execute on function public.set_pin(text, text) to authenticated;
grant execute on function public.verify_pin(text) to authenticated;
grant execute on function public.clear_pin(text) to authenticated;
