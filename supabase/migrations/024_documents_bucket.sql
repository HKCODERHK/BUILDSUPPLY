-- 024: storage for PDFs sent to customers over WhatsApp.
--
-- A free web app cannot open a particular WhatsApp chat AND attach a file in
-- the same tap: the share sheet attaches but always makes the supplier pick
-- the contact, and a wa.me link opens the right chat but carries only text.
-- So every bill, estimate, statement and receipt is uploaded here and sent as
-- a link inside a wa.me message, which lands in the customer's own chat.
--
-- Public, so a customer can open their bill without an account. What keeps a
-- document private is the path — <supplier id>/<32 random hex>/<file>.pdf —
-- and the fact that NO select policy exists: the public object endpoint
-- serves a file by its exact path, but nobody, signed in or not, can list the
-- bucket to discover one. Do not add a select policy here.
--
-- PDFs only, 5 MB. The app serves this bucket from its own origin
-- (vercel.json proxies /d/ to it), so an HTML file uploaded here would run as
-- a page on buildsupplyin.vercel.app with the supplier's session in reach.
-- The MIME restriction is what stops that; keep it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', true, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A supplier writes only into their own folder, the same rule as logos.
-- Insert only: every share gets a fresh random path, so nothing is ever
-- overwritten, and without an update policy nothing can be.
create policy "documents_write_own_folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (auth.uid())::text);
