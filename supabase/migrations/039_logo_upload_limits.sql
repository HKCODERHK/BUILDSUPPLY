-- 039: a size and a type on the logo bucket.
--
-- Found in the pre-launch audit (2026-09-22): `storage.buckets` row `logos`
-- had `file_size_limit = null` and `allowed_mime_types = null`, so the bucket
-- accepted a file of any type and any size. It is a **public** bucket, and the
-- logo in it is printed on every bill and shown on the customer's khata and
-- order pages, so what it holds is served to the open internet under this
-- project's domain. Two things follow from having no rules: an SVG (a
-- scriptable document, not a picture) could be stored and served, and one
-- upload could fill the free tier's storage.
--
-- This sets the two values the bucket should always have had. It changes no
-- table, no column, no policy and no row of business data:
--   * 2 MB, which is generous for a logo that prints about 12mm wide on a PDF
--     and renders at 48px in the app. Both logos in the bucket today are well
--     under it (110 KB and 54 KB).
--   * PNG, JPEG and WebP — the three formats the app actually displays. SVG is
--     deliberately absent.
--
-- What does NOT change: the bucket stays public (a bill's logo has to be
-- fetchable by anyone the bill is sent to), every storage policy is untouched
-- (writes are still confined to the supplier's own folder by
-- `logo_write_own_folder`), and every file already in the bucket stays exactly
-- where it is and keeps being served. The limits apply to new uploads only.
--
-- The `catalog` bucket is deliberately left alone: only the admin writes to it,
-- and changing it was not part of this pass.
--
-- Safe to run twice.

update storage.buckets
   set file_size_limit = 2 * 1024 * 1024,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
 where id = 'logos';
