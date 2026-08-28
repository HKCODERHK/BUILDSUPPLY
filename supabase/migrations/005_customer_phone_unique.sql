-- BuildSupply — prevent duplicate customers (same phone) per supplier
-- Run this in the Supabase SQL editor AFTER 004_master_catalog.sql.
--
-- Bug found live: nothing stopped a supplier from creating two customer rows
-- with the same name+phone (e.g. a double-submit), fragmenting that
-- customer's invoice/khata history across two records. Phone is the
-- reliable identity signal (name alone can legitimately repeat), so this
-- enforces uniqueness on (supplier_id, phone) whenever a phone is given.
-- Customers without a phone on file are unaffected (partial index).

create unique index customers_supplier_phone_unique
  on public.customers (supplier_id, phone)
  where phone is not null and phone <> '';
