-- Restore drill only. Run as supabase_admin inside the throwaway drill
-- container, before schema.sql and the migrations.
--
-- The Supabase Postgres image ships the auth schema, the roles and pg_cron,
-- but the storage tables are normally created by Supabase's separate storage
-- service, which the drill does not run. These are just enough for
-- schema.sql, 003 and 039 to apply. Nothing here ever runs anywhere else.
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;

grant usage on schema storage to postgres, anon, authenticated, service_role;
grant all on all tables in schema storage to postgres;
alter table storage.buckets owner to postgres;
alter table storage.objects owner to postgres;
alter function storage.foldername(text) owner to postgres;
