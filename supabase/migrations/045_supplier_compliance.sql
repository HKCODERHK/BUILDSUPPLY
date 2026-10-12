-- 045 — Supplier compliance: KYC, documents, agreement, declarations,
-- review, soft suspension, termination and an audit log (2026-10-13).
--
-- Additive. No existing table changes shape. What exists keeps working:
--   * The three suppliers already on the platform get a compliance record in
--     state PENDING marked `grandfathered` — they keep using everything and
--     see a "Complete your KYC" card (the user's decision).
--   * A NEW supplier applies from /login (round 2): the login exists, but
--     there is no `suppliers` row until the admin accepts the application, so
--     nothing of the app is reachable — only the application screen.
--   * The existing admin Suspend / Deactivate (a login ban) is untouched.
--     Compliance has its own SOFT suspension: login and records stay, online
--     ordering is switched off and cannot be switched on.
--
-- Who can do what (enforced here, not in the app):
--   * A supplier/applicant reads and writes only their own records, can never
--     set their own status or any review field, and can never change or
--     delete an acceptance, a document record or an audit entry.
--   * Only the admin (is_admin()) decides: approve, reject, request a
--     correction, suspend, reinstate, terminate, accept an application.
--   * Customers (anon) reach nothing here except the ordering disclosure
--     sentence, through one read-only function.
--   * KYC files live in a PRIVATE bucket `kyc`, in the owner's own folder;
--     the owner and the admin can read them, nobody else, never by public URL.
--
-- Legal texts (agreement, declarations, disclosure) are stored as versions an
-- admin can edit. The wording seeded here is a DRAFT for review by qualified
-- legal counsel; it allocates responsibilities contractually and does not
-- claim that BuildSupply has no liability.
--
-- Safe to run twice.

begin;

-- ── 0. Coded request address, for acceptance records ───────────────────
-- The same idea as the order spam guard's _order_client (032): the address
-- is never stored, only a keyed one-way code, salted per account so codes
-- cannot be linked across accounts.
create or replace function public._request_ip_hash(p_salt uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  h json;
  v_ip text;
  v_out text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if h is null then
    return null;
  end if;
  v_ip := coalesce(nullif(btrim(h->>'cf-connecting-ip'), ''),
                   nullif(btrim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), ''),
                   nullif(btrim(h->>'x-real-ip'), ''));
  if v_ip is null then
    return null;
  end if;
  select encode(extensions.hmac(v_ip || '|compliance|' || p_salt::text, g.secret, 'sha256'), 'hex')
    into v_out
    from public.order_guard_secret g
   where g.id;
  return v_out;
end;
$$;
revoke all on function public._request_ip_hash(uuid) from public, anon, authenticated;

-- ── 1. Legal texts, versioned and admin-editable ───────────────────────
create table if not exists public.compliance_texts (
  id uuid primary key default gen_random_uuid(),
  -- agreement: the Supplier Agreement; declaration: one of the declarations
  -- (key d1..dn); order_disclosure: the line customers see when ordering;
  -- admin_notice: the internal "does not determine liability" notice.
  kind text not null check (kind in ('agreement', 'declaration', 'order_disclosure', 'admin_notice')),
  key text not null check (key ~ '^[a-z0-9_]{1,20}$'),
  version int not null check (version >= 1),
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 60000),
  effective_from date not null default current_date,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (kind, key, version)
);
create unique index if not exists compliance_texts_one_active
  on public.compliance_texts (kind, key) where is_active;

alter table public.compliance_texts enable row level security;
drop policy if exists compliance_texts_read on public.compliance_texts;
create policy compliance_texts_read on public.compliance_texts
  for select to authenticated using (true);
drop policy if exists compliance_texts_admin_write on public.compliance_texts;
create policy compliance_texts_admin_write on public.compliance_texts
  for insert to authenticated with check (public.is_admin());
drop policy if exists compliance_texts_admin_update on public.compliance_texts;
create policy compliance_texts_admin_update on public.compliance_texts
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- Supabase grants everything on a new table to the app's roles by default;
-- take it all back and give only what is listed.
revoke all on public.compliance_texts from anon, authenticated;
grant select, insert, update on public.compliance_texts to authenticated;

-- A version's wording never changes once anyone may have accepted it: only
-- whether it is the active one may change. A new wording is a new version.
create or replace function public.compliance_texts_keep()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'Legal text versions are kept. Make a new version instead.';
  end if;
  if new.body is distinct from old.body or new.title is distinct from old.title
     or new.version is distinct from old.version or new.kind is distinct from old.kind
     or new.key is distinct from old.key then
    raise exception 'A version''s wording cannot change. Save it as a new version.';
  end if;
  return new;
end;
$$;
drop trigger if exists compliance_texts_keep on public.compliance_texts;
create trigger compliance_texts_keep
  before update or delete on public.compliance_texts
  for each row execute function public.compliance_texts_keep();

-- ── 2. What documents are asked for, and how long records are kept ──────
create table if not exists public.compliance_requirements (
  doc_type text primary key check (doc_type ~ '^[a-z0-9_]{1,30}$'),
  label text not null check (char_length(label) between 1 and 120),
  required boolean not null default false,
  active boolean not null default true,
  sort int not null default 0
);
alter table public.compliance_requirements enable row level security;
drop policy if exists compliance_requirements_read on public.compliance_requirements;
create policy compliance_requirements_read on public.compliance_requirements
  for select to authenticated using (true);
drop policy if exists compliance_requirements_admin on public.compliance_requirements;
create policy compliance_requirements_admin on public.compliance_requirements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Supabase grants everything on a new table to the app's roles by default;
-- take it all back and give only what is listed.
revoke all on public.compliance_requirements from anon, authenticated;
grant select, insert, update on public.compliance_requirements to authenticated;

create table if not exists public.retention_settings (
  record_type text primary key check (record_type ~ '^[a-z0-9_]{1,40}$'),
  label text not null,
  -- null = kept until a person decides otherwise. Nothing here deletes
  -- anything by itself: these are the periods an admin has decided on, for a
  -- controlled archive/delete step to read. To be set with legal advice.
  keep_years int check (keep_years is null or keep_years between 1 and 100),
  note text check (note is null or char_length(note) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.retention_settings enable row level security;
drop policy if exists retention_settings_admin on public.retention_settings;
create policy retention_settings_admin on public.retention_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Supabase grants everything on a new table to the app's roles by default;
-- take it all back and give only what is listed.
revoke all on public.retention_settings from anon, authenticated;
grant select, insert, update on public.retention_settings to authenticated;

-- ── 3. One compliance record per account (supplier or applicant) ────────
create table if not exists public.supplier_compliance (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED')),
  -- A new applicant: no suppliers row until the admin accepts.
  is_applicant boolean not null default false,
  -- A supplier who was already working before compliance existed: keeps
  -- every feature while PENDING (the user's decision, 2026-10-13).
  grandfathered boolean not null default false,
  -- The admin asked for a correction; cleared when the supplier resubmits.
  correction_reason text check (correction_reason is null or char_length(correction_reason) between 3 and 1000),
  requested_plan text check (requested_plan is null or requested_plan in ('trial', 'basic', 'pro', 'yearly')),

  legal_name text check (legal_name is null or char_length(legal_name) between 2 and 200),
  contact_name text check (contact_name is null or char_length(contact_name) between 2 and 120),
  mobile text check (mobile is null or mobile ~ '^[0-9]{10}$'),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  address text check (address is null or char_length(address) between 5 and 500),
  district text check (district is null or char_length(district) between 2 and 80),
  state text check (state is null or char_length(state) between 2 and 80),
  pin_code text check (pin_code is null or pin_code ~ '^[1-9][0-9]{5}$'),
  business_type text check (business_type is null or business_type in ('proprietor', 'partnership', 'llp', 'private_limited', 'other')),
  business_type_other text check (business_type_other is null or char_length(business_type_other) between 2 and 80),
  pan text check (pan is null or pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  registration_details text check (registration_details is null or char_length(registration_details) <= 500),

  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 1000),

  suspended_at timestamptz,
  suspended_by uuid references auth.users(id) on delete set null,
  suspension_code text check (suspension_code is null or suspension_code in (
    'fraud', 'fake_documents', 'counterfeit', 'repeated_complaints', 'unsafe_conduct', 'misrepresentation',
    'regulatory', 'quality', 'unresolved_complaints', 'other')),
  suspension_note text check (suspension_note is null or char_length(suspension_note) <= 1000),

  terminated_at timestamptz,
  terminated_by uuid references auth.users(id) on delete set null,
  termination_reason text check (termination_reason is null or char_length(termination_reason) <= 1000),
  termination_notes text check (termination_notes is null or char_length(termination_notes) <= 2000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists supplier_compliance_status on public.supplier_compliance (status);

alter table public.supplier_compliance enable row level security;
drop policy if exists supplier_compliance_own on public.supplier_compliance;
create policy supplier_compliance_own on public.supplier_compliance
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists supplier_compliance_own_update on public.supplier_compliance;
create policy supplier_compliance_own_update on public.supplier_compliance
  for update to authenticated using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
-- Supabase grants everything on a new table to the app's roles by default;
-- take it all back and give only what is listed.
revoke all on public.supplier_compliance from anon, authenticated;
grant select, update on public.supplier_compliance to authenticated;
-- No insert or delete for the app's users: rows are made by this migration
-- (existing suppliers), by the application Edge Function (service role), and
-- by start_compliance() for a supplier who has none.

-- The guard: an account edits only its own business fields, and only while
-- the record is open for editing; everything else is the admin's, through
-- the decision functions below (which set a transaction flag this honours).
create or replace function public.supplier_compliance_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  -- The decision functions run as the admin and say so for this transaction.
  if coalesce(current_setting('buildsupply.compliance_decision', true), '') = 'on' then
    return new;
  end if;
  -- Service role / SQL editor (no JWT role of the app's users): allowed.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.user_id is distinct from old.user_id
     or new.status is distinct from old.status
     or new.is_applicant is distinct from old.is_applicant
     or new.grandfathered is distinct from old.grandfathered
     or new.correction_reason is distinct from old.correction_reason
     or new.submitted_at is distinct from old.submitted_at
     or new.decided_at is distinct from old.decided_at
     or new.decided_by is distinct from old.decided_by
     or new.decision_reason is distinct from old.decision_reason
     or new.suspended_at is distinct from old.suspended_at
     or new.suspended_by is distinct from old.suspended_by
     or new.suspension_code is distinct from old.suspension_code
     or new.suspension_note is distinct from old.suspension_note
     or new.terminated_at is distinct from old.terminated_at
     or new.terminated_by is distinct from old.terminated_by
     or new.termination_reason is distinct from old.termination_reason
     or new.termination_notes is distinct from old.termination_notes
     or new.created_at is distinct from old.created_at then
    raise exception 'Only BuildSupply can change the verification status.';
  end if;
  if old.status not in ('PENDING', 'REJECTED') then
    raise exception 'Your details are with BuildSupply for review and cannot be changed now.';
  end if;
  return new;
end;
$$;
drop trigger if exists supplier_compliance_guard on public.supplier_compliance;
create trigger supplier_compliance_guard
  before update on public.supplier_compliance
  for each row execute function public.supplier_compliance_guard();

-- ── 4. Documents (files in the private `kyc` bucket) ────────────────────
create table if not exists public.supplier_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_type text not null check (doc_type ~ '^[a-z0-9_]{1,30}$'),
  storage_path text not null unique check (char_length(storage_path) <= 300),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes int not null check (size_bytes between 1 and 5242880),
  uploaded_at timestamptz not null default now(),
  -- A newer upload of the same type replaces this one in the review; the old
  -- record and its file are kept as history.
  replaced_at timestamptz,
  review_status text not null default 'pending' check (review_status in ('pending', 'accepted', 'rejected')),
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  constraint supplier_documents_path_own check (split_part(storage_path, '/', 1) = user_id::text)
);
create index if not exists supplier_documents_user on public.supplier_documents (user_id, doc_type);

alter table public.supplier_documents enable row level security;
drop policy if exists supplier_documents_read on public.supplier_documents;
create policy supplier_documents_read on public.supplier_documents
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists supplier_documents_admin_update on public.supplier_documents;
create policy supplier_documents_admin_update on public.supplier_documents
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- Supabase grants everything on a new table to the app's roles by default;
-- take it all back and give only what is listed.
revoke all on public.supplier_documents from anon, authenticated;
grant select, update on public.supplier_documents to authenticated;
-- Records are made by add_compliance_document() (checks the file exists in
-- the owner's folder); never deleted by the app.

create or replace function public.supplier_documents_keep()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'Document records are kept.';
  end if;
  if new.user_id is distinct from old.user_id or new.doc_type is distinct from old.doc_type
     or new.storage_path is distinct from old.storage_path or new.file_name is distinct from old.file_name
     or new.mime_type is distinct from old.mime_type or new.size_bytes is distinct from old.size_bytes
     or new.uploaded_at is distinct from old.uploaded_at then
    raise exception 'A document record cannot be changed. Upload a new file instead.';
  end if;
  return new;
end;
$$;
drop trigger if exists supplier_documents_keep on public.supplier_documents;
create trigger supplier_documents_keep
  before update or delete on public.supplier_documents
  for each row execute function public.supplier_documents_keep();

-- ── 5. Acceptances of the agreement and declarations (never edited) ─────
create table if not exists public.supplier_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text_id uuid not null references public.compliance_texts(id),
  kind text not null check (kind in ('agreement', 'declaration')),
  text_key text not null,
  version int not null,
  accepted_at timestamptz not null default now(),
  -- A keyed one-way code of the request address (never the address), and
  -- the browser's own description of itself. The user's decision.
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent text check (user_agent is null or char_length(user_agent) <= 400)
);
create index if not exists supplier_acceptances_user on public.supplier_acceptances (user_id, kind, text_key);

alter table public.supplier_acceptances enable row level security;
drop policy if exists supplier_acceptances_read on public.supplier_acceptances;
create policy supplier_acceptances_read on public.supplier_acceptances
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- Supabase grants everything on a new table to the app's roles by default;
-- take it all back and give only what is listed.
revoke all on public.supplier_acceptances from anon, authenticated;
grant select on public.supplier_acceptances to authenticated;

-- Never changed or removed, not even from the SQL editor, except when a
-- whole account is deleted (a cascade).
create or replace function public.supplier_acceptances_keep()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'An acceptance record cannot be changed or deleted.';
end;
$$;
drop trigger if exists supplier_acceptances_keep on public.supplier_acceptances;
create trigger supplier_acceptances_keep
  before update or delete on public.supplier_acceptances
  for each row execute function public.supplier_acceptances_keep();

-- ── 6. The audit log (insert-only, through the functions) ──────────────
create table if not exists public.compliance_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid,
  actor_role text not null check (actor_role in ('supplier', 'admin', 'system')),
  action text not null check (action ~ '^[a-z_]{3,40}$'),
  ref_id uuid,
  prev_status text,
  new_status text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists compliance_audit_user on public.compliance_audit_log (user_id, created_at desc);

alter table public.compliance_audit_log enable row level security;
drop policy if exists compliance_audit_read on public.compliance_audit_log;
create policy compliance_audit_read on public.compliance_audit_log
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- Supabase grants everything on a new table to the app's roles by default;
-- take it all back and give only what is listed.
revoke all on public.compliance_audit_log from anon, authenticated;
grant select on public.compliance_audit_log to authenticated;

create or replace function public.compliance_audit_keep()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old; -- a whole account being deleted
  end if;
  raise exception 'The compliance audit log cannot be changed or deleted.';
end;
$$;
drop trigger if exists compliance_audit_keep on public.compliance_audit_log;
create trigger compliance_audit_keep
  before update or delete on public.compliance_audit_log
  for each row execute function public.compliance_audit_keep();

create or replace function public._compliance_audit(
  p_user uuid, p_action text, p_ref uuid, p_prev text, p_new text, p_details jsonb default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.compliance_audit_log (user_id, actor_id, actor_role, action, ref_id, prev_status, new_status, details)
  values (p_user, auth.uid(),
          case when auth.uid() is null then 'system' when public.is_admin() then 'admin' else 'supplier' end,
          p_action, p_ref, p_prev, p_new, p_details);
$$;
revoke all on function public._compliance_audit(uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;

-- Business-detail changes by the owner are audited too.
create or replace function public.supplier_compliance_audit_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('buildsupply.compliance_decision', true), '') = 'on' then
    return new; -- the decision functions write their own entry
  end if;
  if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    perform public._compliance_audit(new.user_id, 'kyc_updated', null, old.status, new.status, null);
  end if;
  return new;
end;
$$;
drop trigger if exists supplier_compliance_audit_edit on public.supplier_compliance;
create trigger supplier_compliance_audit_edit
  after update on public.supplier_compliance
  for each row execute function public.supplier_compliance_audit_edit();

-- ── 7. The private `kyc` bucket ─────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyc', 'kyc', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists kyc_insert_own on storage.objects;
create policy kyc_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists kyc_read_own_or_admin on storage.objects;
create policy kyc_read_own_or_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'kyc' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
-- No update or delete policy: an uploaded KYC file is never overwritten or
-- removed through the app. A new upload is a new file.

-- ── 8. Supplier-side functions (run as the caller) ─────────────────────

-- Opens a compliance record for a signed-in supplier who has none (a shop
-- created by the admin after this migration).
create or replace function public.start_compliance()
returns public.supplier_compliance
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.supplier_compliance;
  s public.suppliers;
begin
  if auth.uid() is null then
    raise exception 'Please sign in.';
  end if;
  select * into r from public.supplier_compliance where user_id = auth.uid();
  if found then
    return r;
  end if;
  select * into s from public.suppliers where id = auth.uid() and role = 'supplier';
  if not found then
    raise exception 'Only a supplier account can start verification.';
  end if;
  insert into public.supplier_compliance (user_id, status, legal_name, contact_name, mobile, email, address, gstin)
  values (s.id, 'PENDING', s.business_name, s.owner_name,
          case when s.phone ~ '^[0-9]{10}$' then s.phone end, s.email, nullif(s.address, ''),
          case when s.gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then s.gst_number end)
  returning * into r;
  perform public._compliance_audit(r.user_id, 'compliance_started', null, null, 'PENDING', null);
  return r;
end;
$$;
revoke all on function public.start_compliance() from public, anon;
grant execute on function public.start_compliance() to authenticated;

-- Records an uploaded file (already in the caller's own folder of `kyc`).
create or replace function public.add_compliance_document(p_doc_type text, p_path text, p_file_name text)
returns uuid
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_obj storage.objects;
  v_status text;
  v_id uuid;
  v_size int;
  v_mime text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in.';
  end if;
  select status into v_status from public.supplier_compliance where user_id = auth.uid();
  if v_status is null then
    raise exception 'Start verification first.';
  end if;
  if v_status not in ('PENDING', 'REJECTED') then
    raise exception 'Your details are with BuildSupply for review and cannot be changed now.';
  end if;
  if not exists (select 1 from public.compliance_requirements where doc_type = p_doc_type and active) then
    raise exception 'Unknown document type.';
  end if;
  if split_part(p_path, '/', 1) <> auth.uid()::text then
    raise exception 'That file is not yours.';
  end if;
  select * into v_obj from storage.objects where bucket_id = 'kyc' and name = p_path;
  if not found then
    raise exception 'The file did not arrive. Please upload it again.';
  end if;
  v_size := coalesce((v_obj.metadata->>'size')::int, 0);
  v_mime := coalesce(v_obj.metadata->>'mimetype', '');
  if v_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Upload a PDF, JPG, PNG or WebP file.';
  end if;
  if v_size < 1 or v_size > 5242880 then
    raise exception 'The file must be under 5 MB.';
  end if;
  update public.supplier_documents set replaced_at = now()
   where user_id = auth.uid() and doc_type = p_doc_type and replaced_at is null;
  insert into public.supplier_documents (user_id, doc_type, storage_path, file_name, mime_type, size_bytes)
  values (auth.uid(), p_doc_type, p_path, left(coalesce(nullif(btrim(p_file_name), ''), 'document'), 200), v_mime, v_size)
  returning id into v_id;
  perform public._compliance_audit(auth.uid(), 'document_uploaded', v_id, v_status, v_status,
                                   jsonb_build_object('doc_type', p_doc_type));
  return v_id;
end;
$$;
revoke all on function public.add_compliance_document(text, text, text) from public, anon;
grant execute on function public.add_compliance_document(text, text, text) to authenticated;

-- Accepts one active legal text (the agreement or one declaration).
create or replace function public.accept_compliance_text(p_text uuid, p_user_agent text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.compliance_texts;
  v_status text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in.';
  end if;
  select status into v_status from public.supplier_compliance where user_id = auth.uid();
  if v_status is null then
    raise exception 'Start verification first.';
  end if;
  select * into t from public.compliance_texts where id = p_text;
  if not found or not t.is_active or t.kind not in ('agreement', 'declaration') then
    raise exception 'This text is no longer current. Reload and read the current version.';
  end if;
  select id into v_id from public.supplier_acceptances
   where user_id = auth.uid() and text_id = p_text;
  if found then
    return v_id; -- accepted already; a second tap records nothing new
  end if;
  insert into public.supplier_acceptances (user_id, text_id, kind, text_key, version, ip_hash, user_agent)
  values (auth.uid(), t.id, t.kind, t.key, t.version, public._request_ip_hash(auth.uid()),
          left(nullif(btrim(p_user_agent), ''), 400))
  returning id into v_id;
  perform public._compliance_audit(auth.uid(),
    case when t.kind = 'agreement' then 'agreement_accepted' else 'declaration_accepted' end,
    v_id, v_status, v_status, jsonb_build_object('key', t.key, 'version', t.version));
  return v_id;
end;
$$;
revoke all on function public.accept_compliance_text(uuid, text) from public, anon;
grant execute on function public.accept_compliance_text(uuid, text) to authenticated;

-- What is still missing before an account can be submitted. Empty = ready.
create or replace function public.compliance_missing(p_user uuid default null)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  r public.supplier_compliance;
  v_missing text[] := '{}';
begin
  if v_user is null or (v_user is distinct from auth.uid() and not public.is_admin()) then
    raise exception 'Not allowed.';
  end if;
  select * into r from public.supplier_compliance where user_id = v_user;
  if not found then
    return array['not_started'];
  end if;
  if r.legal_name is null then v_missing := array_append(v_missing, 'legal_name'); end if;
  if r.contact_name is null then v_missing := array_append(v_missing, 'contact_name'); end if;
  if r.mobile is null then v_missing := array_append(v_missing, 'mobile'); end if;
  if r.email is null then v_missing := array_append(v_missing, 'email'); end if;
  if r.address is null then v_missing := array_append(v_missing, 'address'); end if;
  if r.district is null then v_missing := array_append(v_missing, 'district'); end if;
  if r.state is null then v_missing := array_append(v_missing, 'state'); end if;
  if r.pin_code is null then v_missing := array_append(v_missing, 'pin_code'); end if;
  if r.business_type is null then v_missing := array_append(v_missing, 'business_type'); end if;
  if r.pan is null then v_missing := array_append(v_missing, 'pan'); end if;
  v_missing := v_missing || coalesce((
    select array_agg('doc:' || q.doc_type order by q.sort)
      from public.compliance_requirements q
     where q.active and q.required
       and not exists (select 1 from public.supplier_documents d
                        where d.user_id = v_user and d.doc_type = q.doc_type and d.replaced_at is null)), '{}');
  v_missing := v_missing || coalesce((
    select array_agg(t.kind || ':' || t.key order by t.kind, t.key)
      from public.compliance_texts t
     where t.is_active and t.kind in ('agreement', 'declaration')
       and not exists (select 1 from public.supplier_acceptances a where a.user_id = v_user and a.text_id = t.id)), '{}');
  return v_missing;
end;
$$;
revoke all on function public.compliance_missing(uuid) from public, anon;
grant execute on function public.compliance_missing(uuid) to authenticated;

-- Sends the record for review once nothing is missing.
create or replace function public.submit_compliance()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.supplier_compliance;
  v_missing text[];
begin
  if auth.uid() is null then
    raise exception 'Please sign in.';
  end if;
  select * into r from public.supplier_compliance where user_id = auth.uid() for no key update;
  if not found then
    raise exception 'Start verification first.';
  end if;
  if r.status not in ('PENDING', 'REJECTED') then
    return r.status; -- already with the admin, or decided
  end if;
  v_missing := public.compliance_missing(auth.uid());
  if cardinality(v_missing) > 0 then
    raise exception 'Something is still missing: %', array_to_string(v_missing, ', ');
  end if;
  perform set_config('buildsupply.compliance_decision', 'on', true);
  update public.supplier_compliance
     set status = 'UNDER_REVIEW', submitted_at = now(), correction_reason = null
   where user_id = auth.uid();
  perform set_config('buildsupply.compliance_decision', '', true);
  perform public._compliance_audit(auth.uid(), 'kyc_submitted', null, r.status, 'UNDER_REVIEW', null);
  return 'UNDER_REVIEW';
end;
$$;
revoke all on function public.submit_compliance() from public, anon;
grant execute on function public.submit_compliance() to authenticated;

-- ── 9. The admin's decisions ───────────────────────────────────────────
-- One function, one transaction per decision, always audited. Reasons are
-- required where the spec asks for them.
create or replace function public.compliance_decide(
  p_user uuid, p_action text, p_reason text default null, p_code text default null, p_notes text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.supplier_compliance;
  v_new text;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not public.is_admin() then
    raise exception 'Only the BuildSupply admin can do this.';
  end if;
  select * into r from public.supplier_compliance where user_id = p_user for no key update;
  if not found then
    raise exception 'No verification record for that account.';
  end if;
  perform set_config('buildsupply.compliance_decision', 'on', true);

  if p_action = 'approve' then
    if r.is_applicant then
      raise exception 'Accept an application with accept_supplier_application.';
    end if;
    if cardinality(public.compliance_missing(p_user)) > 0 then
      raise exception 'This supplier has not completed every requirement yet.';
    end if;
    update public.supplier_compliance
       set status = 'APPROVED', decided_at = now(), decided_by = auth.uid(), decision_reason = v_reason,
           correction_reason = null
     where user_id = p_user;
    v_new := 'APPROVED';
  elsif p_action = 'reject' then
    if v_reason is null or char_length(v_reason) < 3 then
      raise exception 'Give a reason for rejecting.';
    end if;
    update public.supplier_compliance
       set status = 'REJECTED', decided_at = now(), decided_by = auth.uid(), decision_reason = v_reason
     where user_id = p_user;
    v_new := 'REJECTED';
  elsif p_action = 'request_correction' then
    if v_reason is null or char_length(v_reason) < 3 then
      raise exception 'Say what needs correcting.';
    end if;
    update public.supplier_compliance
       set status = 'PENDING', correction_reason = v_reason, decided_at = now(), decided_by = auth.uid()
     where user_id = p_user;
    v_new := 'PENDING';
  elsif p_action = 'suspend' then
    if p_code is null or p_code not in ('fraud', 'fake_documents', 'counterfeit', 'repeated_complaints',
        'unsafe_conduct', 'misrepresentation', 'regulatory', 'quality', 'unresolved_complaints', 'other') then
      raise exception 'Choose a suspension reason.';
    end if;
    if p_code = 'other' and (v_reason is null or char_length(v_reason) < 3) then
      raise exception 'Describe the reason.';
    end if;
    update public.supplier_compliance
       set status = 'SUSPENDED', suspended_at = now(), suspended_by = auth.uid(),
           suspension_code = p_code, suspension_note = v_reason
     where user_id = p_user;
    -- Soft suspension: no new online orders. Records and login stay.
    update public.suppliers set ordering_enabled = false where id = p_user;
    v_new := 'SUSPENDED';
  elsif p_action = 'reinstate' then
    if r.status <> 'SUSPENDED' then
      raise exception 'Only a suspended supplier can be reinstated.';
    end if;
    if r.terminated_at is not null then
      raise exception 'A terminated agreement cannot be reinstated.';
    end if;
    -- Back to APPROVED only if this account was approved before; otherwise
    -- verification starts again where it was.
    v_new := case when exists (select 1 from public.compliance_audit_log a
                                where a.user_id = p_user and a.action = 'supplier_approved')
                  then 'APPROVED' else 'PENDING' end;
    update public.supplier_compliance
       set status = v_new, suspended_at = null, suspended_by = null, suspension_code = null, suspension_note = null
     where user_id = p_user;
  elsif p_action = 'terminate' then
    if v_reason is null or char_length(v_reason) < 3 then
      raise exception 'Give a reason for terminating.';
    end if;
    update public.supplier_compliance
       set status = 'SUSPENDED', terminated_at = now(), terminated_by = auth.uid(),
           termination_reason = v_reason, termination_notes = nullif(btrim(p_notes), ''),
           suspended_at = coalesce(suspended_at, now()), suspended_by = coalesce(suspended_by, auth.uid()),
           suspension_code = coalesce(suspension_code, 'other')
     where user_id = p_user;
    update public.suppliers set ordering_enabled = false where id = p_user;
    v_new := 'SUSPENDED';
  else
    raise exception 'Unknown action.';
  end if;

  perform set_config('buildsupply.compliance_decision', '', true);
  perform public._compliance_audit(p_user,
    case p_action when 'approve' then 'supplier_approved' when 'reject' then 'supplier_rejected'
                  when 'request_correction' then 'correction_requested' when 'suspend' then 'supplier_suspended'
                  when 'reinstate' then 'supplier_reinstated' else 'supplier_terminated' end,
    null, r.status, v_new,
    jsonb_strip_nulls(jsonb_build_object('reason', v_reason, 'code', p_code, 'notes', nullif(btrim(p_notes), ''))));
  return v_new;
end;
$$;
revoke all on function public.compliance_decide(uuid, text, text, text, text) from public, anon;
grant execute on function public.compliance_decide(uuid, text, text, text, text) to authenticated;

-- The admin reviews one document.
create or replace function public.review_compliance_document(p_doc uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.supplier_documents;
begin
  if not public.is_admin() then
    raise exception 'Only the BuildSupply admin can do this.';
  end if;
  if p_status not in ('accepted', 'rejected') then
    raise exception 'Unknown review.';
  end if;
  update public.supplier_documents
     set review_status = p_status, review_note = nullif(btrim(p_note), ''), reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_doc
   returning * into d;
  if not found then
    raise exception 'No such document.';
  end if;
  perform public._compliance_audit(d.user_id, 'document_reviewed', d.id, null, null,
    jsonb_strip_nulls(jsonb_build_object('doc_type', d.doc_type, 'review', p_status, 'note', nullif(btrim(p_note), ''))));
end;
$$;
revoke all on function public.review_compliance_document(uuid, text, text) from public, anon;
grant execute on function public.review_compliance_document(uuid, text, text) to authenticated;

-- The admin accepts a NEW applicant: their suppliers row is created now,
-- with the plan and dates the admin confirms (after payment).
create or replace function public.accept_supplier_application(
  p_user uuid, p_plan text, p_cycle text, p_start date, p_expiry date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.supplier_compliance;
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'Only the BuildSupply admin can do this.';
  end if;
  select * into r from public.supplier_compliance where user_id = p_user for no key update;
  if not found or not r.is_applicant then
    raise exception 'No application for that account.';
  end if;
  if exists (select 1 from public.suppliers where id = p_user) then
    raise exception 'This application has already been accepted.';
  end if;
  if cardinality(public.compliance_missing(p_user)) > 0 then
    raise exception 'This application is not complete yet.';
  end if;
  if p_plan not in ('starter', 'pro') or p_cycle not in ('monthly', 'yearly') then
    raise exception 'Choose a plan.';
  end if;
  if p_start is null or p_expiry is null or p_expiry < p_start then
    raise exception 'Set the subscription dates.';
  end if;
  select email into v_email from auth.users where id = p_user;
  insert into public.suppliers (id, business_name, owner_name, email, phone, address, gst_number,
                                role, status, plan, billing_cycle, subscription_start, subscription_expiry)
  values (p_user, r.legal_name, r.contact_name, coalesce(v_email, r.email), r.mobile,
          concat_ws(', ', r.address, r.district, r.state, r.pin_code), r.gstin,
          'supplier', 'active', p_plan, p_cycle, p_start, p_expiry);
  perform set_config('buildsupply.compliance_decision', 'on', true);
  update public.supplier_compliance
     set status = 'APPROVED', is_applicant = false, decided_at = now(), decided_by = auth.uid(), correction_reason = null
   where user_id = p_user;
  perform set_config('buildsupply.compliance_decision', '', true);
  perform public._compliance_audit(p_user, 'supplier_approved', null, r.status, 'APPROVED',
    jsonb_build_object('application', true, 'plan', p_plan, 'cycle', p_cycle, 'start', p_start, 'expiry', p_expiry));
end;
$$;
revoke all on function public.accept_supplier_application(uuid, text, text, date, date) from public, anon;
grant execute on function public.accept_supplier_application(uuid, text, text, date, date) to authenticated;

-- ── 10. A suspended supplier cannot take online orders ─────────────────
-- Same shape as 044's plan rule: switching ordering on is refused while the
-- compliance record is SUSPENDED.
create or replace function public.suppliers_compliance_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.ordering_enabled and new.role = 'supplier'
     and exists (select 1 from public.supplier_compliance c where c.user_id = new.id and c.status = 'SUSPENDED') then
    if tg_op = 'UPDATE' and not old.ordering_enabled then
      raise exception 'Online orders are paused while your account is suspended. Contact BuildSupply.';
    end if;
    new.ordering_enabled := false;
  end if;
  return new;
end;
$$;
revoke all on function public.suppliers_compliance_rules() from public, anon, authenticated;
drop trigger if exists suppliers_compliance_rules on public.suppliers;
create trigger suppliers_compliance_rules
  before insert or update of ordering_enabled on public.suppliers
  for each row execute function public.suppliers_compliance_rules();

-- ── 11. The ordering disclosure, for customers (anon) ──────────────────
create or replace function public.platform_disclosure()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select body from public.compliance_texts where kind = 'order_disclosure' and key = 'main' and is_active limit 1;
$$;
revoke all on function public.platform_disclosure() from public;
grant execute on function public.platform_disclosure() to anon, authenticated;

-- ── 12. Seed: requirements, retention, and the DRAFT legal texts ───────
insert into public.compliance_requirements (doc_type, label, required, active, sort) values
  ('pan', 'PAN card', true, true, 1),
  ('address_proof', 'Address / business proof', true, true, 2),
  ('gst_certificate', 'GST certificate (if registered)', false, true, 3),
  ('business_registration', 'Business registration (if any)', false, true, 4),
  ('licence', 'Licence / registration for your trade (if any)', false, true, 5)
on conflict (doc_type) do nothing;

insert into public.retention_settings (record_type, label, keep_years, note) values
  ('agreements', 'Supplier agreements and declarations', null, 'Set with legal advice'),
  ('kyc', 'KYC details', null, 'Set with legal advice'),
  ('documents', 'Compliance documents', null, 'Set with legal advice'),
  ('audit_logs', 'Compliance audit log', null, 'Set with legal advice'),
  ('complaints', 'Customer complaints', null, 'Set with legal advice'),
  ('orders', 'Orders, bills and payments', null, 'Set with legal advice'),
  ('delivery_evidence', 'Delivery records', null, 'Set with legal advice')
on conflict (record_type) do nothing;

do $$
begin
  if not exists (select 1 from public.compliance_texts where kind = 'agreement' and key = 'main') then
    insert into public.compliance_texts (kind, key, version, title, body, is_active) values
    ('agreement', 'main', 1, 'BuildSupply Supplier Agreement (DRAFT v1)',
$t$DRAFT FOR LEGAL REVIEW — this wording has not yet been reviewed by legal counsel.

1. Parties and role of BuildSupply
1.1 This Agreement is between BuildSupply ("BuildSupply", "we") and the business registering as a supplier ("Supplier", "you").
1.2 BuildSupply provides software that lets a supplier keep records (bills, khata, payments, stock) and lets customers view their accounts and send order requests to that supplier. BuildSupply does not manufacture, stock, sell, transport or deliver building materials.
1.3 The Supplier acts as an independent seller. Nothing in this Agreement makes the Supplier an agent, employee, partner or joint venturer of BuildSupply.

2. Supplier responsibilities
Subject to applicable law, the Supplier is responsible for:
(a) the quality, quantity, specifications and authenticity of materials it sells;
(b) the prices it quotes and charges;
(c) its invoices, and all taxes and statutory compliance applicable to its business (including GST where applicable);
(d) packing and loading;
(e) delivery arrangements it controls, including vehicles used by it;
(f) its employees, drivers, delivery personnel and subcontractors, and their conduct;
(g) defective, damaged or incorrect materials supplied by it;
(h) handling customer complaints about its materials or service, and any refund or replacement it owes its customers;
(i) complying with all laws, licences and permissions applicable to its business and products.

3. Information and documents
3.1 The Supplier will provide accurate, current and complete information and documents, and will update them when they change.
3.2 BuildSupply may verify information, request corrections, and approve or decline an application.

4. Indemnity
To the extent permitted by applicable law, the Supplier will indemnify and hold harmless BuildSupply against losses, damages, costs and claims (including reasonable legal costs) arising from: (a) the Supplier's acts or omissions or negligence; (b) the Supplier's breach of law; (c) defective, counterfeit or incorrect materials supplied by the Supplier; (d) incorrect information provided by the Supplier; (e) acts of the Supplier's employees, drivers, personnel or subcontractors; or (f) the Supplier's breach of this Agreement.

5. Limits of this Agreement
This Agreement allocates responsibilities between BuildSupply and the Supplier. It does not exclude or limit any liability that cannot be excluded or limited under applicable law, and does not affect any customer's statutory rights.

6. Suspension and termination
6.1 BuildSupply may suspend a Supplier's access to online ordering, or terminate this Agreement, for reasons including fraud, false or forged documents, counterfeit materials, repeated or unresolved legitimate complaints, unsafe conduct, misrepresentation, regulatory issues or breach of this Agreement.
6.2 Records required to be kept by law or for the resolution of disputes are retained after suspension or termination as set out in BuildSupply's retention policy.

7. Subscription
The Supplier pays the subscription for the plan it chooses, as shown on the BuildSupply website. Payments are not refunded once made, as set out in the Terms of Service.

8. Governing law
This Agreement is governed by the laws of India. Courts at Betul, Madhya Pradesh have jurisdiction, subject to applicable law.$t$, true);
  end if;

  if not exists (select 1 from public.compliance_texts where kind = 'declaration') then
    insert into public.compliance_texts (kind, key, version, title, body, is_active) values
    ('declaration', 'd1', 1, 'Genuine information', 'The information and documents submitted by me are genuine, accurate and current.', true),
    ('declaration', 'd2', 1, 'Right to sell', 'I have the legal right and necessary permissions/licences, where applicable, to sell the materials listed on BuildSupply.', true),
    ('declaration', 'd3', 1, 'As described', 'The materials supplied by me will correspond to the description, specification and quantity represented to the customer.', true),
    ('declaration', 'd4', 1, 'Compliance with law', 'I will comply with all applicable laws relating to my business and products.', true),
    ('declaration', 'd5', 1, 'My people and vehicles', 'I accept responsibility for my employees, delivery personnel, vehicles and subcontractors used by me.', true),
    ('declaration', 'd6', 1, 'Role of BuildSupply', 'I understand that BuildSupply provides the technology/platform connecting customers with suppliers and does not manufacture the materials supplied by me.', true),
    ('declaration', 'd7', 1, 'My obligations', 'I understand that I remain responsible for obligations arising from my sale and fulfilment of materials, subject to applicable law.', true);
  end if;

  if not exists (select 1 from public.compliance_texts where kind = 'order_disclosure') then
    insert into public.compliance_texts (kind, key, version, title, body, is_active) values
    ('order_disclosure', 'main', 1, 'Shown to customers when ordering',
     'Materials, pricing, invoicing and fulfilment are provided by the respective supplier. BuildSupply provides the technology platform connecting customers and suppliers.', true);
  end if;

  if not exists (select 1 from public.compliance_texts where kind = 'admin_notice') then
    insert into public.compliance_texts (kind, key, version, title, body, is_active) values
    ('admin_notice', 'main', 1, 'Internal notice',
     'This system records contractual and compliance information but does not itself determine legal liability. Agreement wording should be reviewed by qualified legal counsel before production use.', true);
  end if;
end $$;

-- ── 13. The suppliers already on the platform ──────────────────────────
-- A record for each, PENDING and grandfathered: nothing they use changes;
-- they see "Complete your KYC" (round 2). Their known details are carried
-- over where they pass the checks, so they type less. Only the first time.
do $$
declare
  n int;
begin
  insert into public.supplier_compliance (user_id, status, grandfathered, legal_name, contact_name, mobile, email, address, gstin)
  select s.id, 'PENDING', true,
         case when char_length(s.business_name) between 2 and 200 then s.business_name end,
         case when char_length(coalesce(s.owner_name, '')) between 2 and 120 then s.owner_name end,
         case when s.phone ~ '^[0-9]{10}$' then s.phone end,
         case when s.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then s.email end,
         case when char_length(coalesce(s.address, '')) between 5 and 500 then s.address end,
         case when s.gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then s.gst_number end
    from public.suppliers s
   where s.role = 'supplier'
     and not exists (select 1 from public.supplier_compliance c where c.user_id = s.id);
  get diagnostics n = row_count;
  raise notice '045: % existing supplier(s) given a PENDING, grandfathered compliance record', n;
end $$;

commit;
