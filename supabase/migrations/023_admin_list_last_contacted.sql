-- The Suppliers table has always had a "Last contacted" column, and it has
-- always shown an em dash. Migration 020 added suppliers.last_contacted_at and
-- the Call / WhatsApp buttons stamp it correctly, but admin_list_suppliers()
-- never returned the column -- so the UI read undefined for every row and the
-- sort on that header did nothing. "Who do I contact" is one of the three
-- questions the admin panel exists to answer, and it was answering it blank.
--
-- Adding a column to a RETURNS TABLE changes the function's return type, which
-- CREATE OR REPLACE refuses ("cannot change return type of existing function"),
-- so this drops and recreates. The drop takes the grants with it; they are
-- re-granted below to exactly what they were.

drop function if exists public.admin_list_suppliers();

create function public.admin_list_suppliers()
returns table (
  id uuid,
  business_name text,
  owner_name text,
  email text,
  phone text,
  address text,
  status text,
  role text,
  plan text,
  subscription_start date,
  subscription_expiry date,
  subscription_status text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  last_contacted_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    s.id, s.business_name, s.owner_name, s.email, s.phone, s.address,
    s.status, s.role, s.plan, s.subscription_start, s.subscription_expiry,
    s.subscription_status, s.created_at, u.last_sign_in_at,
    s.last_contacted_at
  from public.suppliers s
  join auth.users u on u.id = s.id
  where public.is_admin()
  order by s.created_at desc;
$$;

-- SECURITY DEFINER plus the is_admin() guard in the body is what keeps this
-- safe: a non-admin caller gets zero rows, not an error, exactly as before.
grant execute on function public.admin_list_suppliers() to anon, authenticated, service_role;
