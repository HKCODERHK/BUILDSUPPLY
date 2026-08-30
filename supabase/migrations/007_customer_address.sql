-- BuildSupply — add an address field to customers
-- Run this in the Supabase SQL editor AFTER 006_customer_phone_10_digits.sql.

alter table public.customers add column address text;
