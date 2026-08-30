-- BuildSupply — track whether an invoice's material has actually been
-- delivered, and stop deducting stock at invoice-creation time.
-- Run this in the Supabase SQL editor AFTER 007_customer_address.sql.
--
-- Previously stock was deducted the moment an invoice was saved, regardless
-- of whether the goods had actually left the godown yet. Suppliers often
-- bill first and deliver later (or the order falls through), so stock now
-- only moves once the supplier confirms delivery.

alter table public.invoices add column delivered boolean not null default false;
