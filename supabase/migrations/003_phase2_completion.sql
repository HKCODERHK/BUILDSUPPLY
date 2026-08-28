-- BuildSupply — Phase 2 completion items
-- Run this in the Supabase SQL editor AFTER 002_admin_platform.sql on the same project.

-- ============================================================
-- Storage bucket for master-catalog material images (admin-owned,
-- publicly readable so both admin and supplier screens can show them).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('catalog', 'catalog', true)
on conflict (id) do nothing;

create policy "catalog_read_public" on storage.objects
  for select using (bucket_id = 'catalog');

create policy "catalog_write_admin_only" on storage.objects
  for insert with check (bucket_id = 'catalog' and public.is_admin());

create policy "catalog_update_admin_only" on storage.objects
  for update using (bucket_id = 'catalog' and public.is_admin());

create policy "catalog_delete_admin_only" on storage.objects
  for delete using (bucket_id = 'catalog' and public.is_admin());
