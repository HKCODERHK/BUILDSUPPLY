-- BuildSupply — require customer phone numbers to be exactly 10 digits
-- Run this in the Supabase SQL editor AFTER 005_customer_phone_unique.sql.
--
-- Phone is still optional (nullable) — a customer can be added without one —
-- but whenever a phone is given, it must be a plain 10-digit Indian mobile
-- number, no country code, spaces, or punctuation. The app also validates
-- and normalizes this client-side; this constraint is the backstop.

alter table public.customers
  add constraint customers_phone_10_digits
  check (phone is null or phone ~ '^[0-9]{10}$');
