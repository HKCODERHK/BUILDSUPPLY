-- 046 — Customer complaints about a bill (compliance round 4, 2026-10-13).
--
-- A customer can raise a complaint about one of their own bills — quality,
-- short quantity, wrong or damaged material, delivery, billing, staff — from
-- inside that bill on their khata link or saved account. It is deliberately
-- tucked away (the user's decision: customers would otherwise use it "for
-- fun"), and limited: one open complaint per bill, 3 a day and 10 in 30 days
-- per customer.
--
-- Who sees what (the user's decision, 2026-10-13):
--   * the shop sees and answers complaints about its own bills;
--   * the BuildSupply admin reads every complaint in full — a narrow, stated
--     exception to 019's rule that the admin reads no supplier business data,
--     so that repeated or unresolved complaints can be acted on (a soft
--     suspension, 045);
--   * the customer sees their own complaints and the shop's replies;
--   * nobody can change what the customer wrote, or delete a complaint.
--
-- Additive: one new table and new functions; nothing existing is touched.
-- Safe to run twice.

begin;

create table if not exists public.customer_complaints (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  -- The bill number as the customer saw it, kept with the complaint.
  invoice_no text not null,
  category text not null check (category in (
    'quality', 'quantity', 'wrong_item', 'damaged', 'delivery', 'billing', 'behaviour', 'other')),
  description text not null check (char_length(description) between 10 and 2000),
  -- Where it came from: the khata link, or the customer's saved account (041).
  via text not null default 'khata' check (via in ('khata', 'account')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  supplier_response text check (supplier_response is null or char_length(supplier_response) between 1 and 1000),
  responded_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists customer_complaints_supplier on public.customer_complaints (supplier_id, status, created_at desc);
create index if not exists customer_complaints_customer on public.customer_complaints (customer_id, created_at desc);
create index if not exists customer_complaints_invoice on public.customer_complaints (invoice_id);

alter table public.customer_complaints enable row level security;
drop policy if exists customer_complaints_read on public.customer_complaints;
create policy customer_complaints_read on public.customer_complaints
  for select to authenticated
  using (supplier_id = auth.uid() or public.is_admin());
-- Supabase grants everything on a new table by default; take it back. Every
-- write goes through the functions below.
revoke all on public.customer_complaints from anon, authenticated;
grant select on public.customer_complaints to authenticated;

-- What the customer wrote can never change, and a complaint is never deleted
-- — except when a whole shop account is deleted (a cascade).
create or replace function public.customer_complaints_keep()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'Complaints are kept.';
  end if;
  if new.supplier_id is distinct from old.supplier_id or new.customer_id is distinct from old.customer_id
     or new.invoice_id is distinct from old.invoice_id or new.invoice_no is distinct from old.invoice_no
     or new.category is distinct from old.category or new.description is distinct from old.description
     or new.via is distinct from old.via or new.created_at is distinct from old.created_at then
    raise exception 'What the customer wrote cannot be changed.';
  end if;
  return new;
end;
$$;
drop trigger if exists customer_complaints_keep on public.customer_complaints;
create trigger customer_complaints_keep
  before update or delete on public.customer_complaints
  for each row execute function public.customer_complaints_keep();

-- ── Filing one (the customer) ──────────────────────────────────────────
create or replace function public._file_complaint(
  p_token text, p_invoice_no text, p_category text, p_description text, p_via text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_inv record;
  v_desc text := btrim(coalesce(p_description, ''));
  v_existing uuid;
  v_id uuid;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('found', false);
  end if;
  select cu.id, cu.supplier_id, s.status as supplier_status into c
    from public.customers cu
    join public.suppliers s on s.id = cu.supplier_id
   where cu.khata_token = p_token;
  if not found or c.supplier_status <> 'active' then
    return jsonb_build_object('found', false);
  end if;
  -- Only this customer's own live bills.
  select i.id, i.invoice_no into v_inv
    from public.invoices i
   where i.customer_id = c.id and i.invoice_no = p_invoice_no and i.kind = 'bill' and i.status <> 'Cancelled';
  if not found then
    raise exception 'Bill not found.';
  end if;
  if p_category is null or p_category not in ('quality', 'quantity', 'wrong_item', 'damaged', 'delivery', 'billing', 'behaviour', 'other') then
    raise exception 'Choose what the problem is about.';
  end if;
  if char_length(v_desc) < 10 then
    raise exception 'Please describe the problem in a few words.';
  end if;
  -- One customer, one moment: two taps or two phones record one complaint.
  perform pg_advisory_xact_lock(hashtext('complaint:' || c.id::text));
  -- One open complaint per bill: a second one for the same bill is the same complaint.
  select id into v_existing
    from public.customer_complaints
   where invoice_id = v_inv.id and status in ('open', 'in_progress')
   limit 1;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'id', v_existing);
  end if;
  if (select count(*) from public.customer_complaints where customer_id = c.id and created_at > now() - interval '1 day') >= 3
     or (select count(*) from public.customer_complaints where customer_id = c.id and created_at > now() - interval '30 days') >= 10 then
    raise exception 'You have sent several complaints recently. Please call the shop.';
  end if;
  insert into public.customer_complaints (supplier_id, customer_id, invoice_id, invoice_no, category, description, via)
  values (c.supplier_id, c.id, v_inv.id, v_inv.invoice_no, p_category, left(v_desc, 2000), p_via)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public._file_complaint(text, text, text, text, text) from public, anon, authenticated;

-- From the khata link (anyone holding the customer's own link).
create or replace function public.file_complaint(p_token text, p_invoice_no text, p_category text, p_description text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public._file_complaint(p_token, p_invoice_no, p_category, p_description, 'khata');
$$;
revoke all on function public.file_complaint(text, text, text, text) from public;
grant execute on function public.file_complaint(text, text, text, text) to anon, authenticated;

-- From the customer's saved account (041).
create or replace function public.my_file_complaint(p_connection uuid, p_invoice_no text, p_category text, p_description text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := public._connection_token(p_connection);
begin
  if v_token is null then
    raise exception 'This shop is no longer on your account.';
  end if;
  return public._file_complaint(v_token, p_invoice_no, p_category, p_description, 'account');
end;
$$;
revoke all on function public.my_file_complaint(uuid, text, text, text) from public, anon;
grant execute on function public.my_file_complaint(uuid, text, text, text) to authenticated;

-- ── The customer's own complaints, with the shop's replies ─────────────
create or replace function public._customer_complaints_json(p_customer uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'invoice_no', k.invoice_no, 'category', k.category, 'description', k.description,
           'status', k.status, 'supplier_response', k.supplier_response,
           'created_at', k.created_at, 'responded_at', k.responded_at, 'resolved_at', k.resolved_at)
         order by k.created_at desc), '[]'::jsonb)
    from public.customer_complaints k
   where k.customer_id = p_customer;
$$;
revoke all on function public._customer_complaints_json(uuid) from public, anon, authenticated;

create or replace function public.khata_complaints(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_customer uuid;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return '[]'::jsonb;
  end if;
  select cu.id into v_customer
    from public.customers cu join public.suppliers s on s.id = cu.supplier_id
   where cu.khata_token = p_token and s.status = 'active';
  if v_customer is null then
    return '[]'::jsonb;
  end if;
  return public._customer_complaints_json(v_customer);
end;
$$;
revoke all on function public.khata_complaints(text) from public;
grant execute on function public.khata_complaints(text) to anon, authenticated;

create or replace function public.my_khata_complaints(p_connection uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text := public._connection_token(p_connection);
begin
  if v_token is null then
    return '[]'::jsonb;
  end if;
  return public.khata_complaints(v_token);
end;
$$;
revoke all on function public.my_khata_complaints(uuid) from public, anon;
grant execute on function public.my_khata_complaints(uuid) to authenticated;

-- ── Answering one (the shop) ───────────────────────────────────────────
create or replace function public.respond_complaint(p_id uuid, p_status text, p_response text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.customer_complaints;
  v_text text := nullif(btrim(coalesce(p_response, '')), '');
begin
  select * into k from public.customer_complaints where id = p_id for no key update;
  -- Only the shop the complaint is about — not the admin, not anyone else.
  if not found or k.supplier_id is distinct from auth.uid() then
    raise exception 'Complaint not found.';
  end if;
  if p_status not in ('in_progress', 'resolved', 'closed') then
    raise exception 'Unknown status.';
  end if;
  if p_status in ('resolved', 'closed') and v_text is null and k.supplier_response is null then
    raise exception 'Tell the customer what was done.';
  end if;
  update public.customer_complaints
     set status = p_status,
         supplier_response = coalesce(left(v_text, 1000), supplier_response),
         responded_at = case when v_text is not null then now() else responded_at end,
         resolved_at = case when p_status in ('resolved', 'closed') then now() else null end
   where id = p_id;
  return p_status;
end;
$$;
revoke all on function public.respond_complaint(uuid, text, text) from public, anon;
grant execute on function public.respond_complaint(uuid, text, text) to authenticated;

commit;
