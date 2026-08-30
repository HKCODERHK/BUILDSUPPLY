-- BuildSupply — stock quantity can never go negative
-- Run this in the Supabase SQL editor AFTER 008_invoice_delivered.sql.
--
-- Two existing rows were found at negative stock (a leftover custom
-- material and a delivery that outran recorded stock) and were floored to
-- 0 before this constraint was added, since a CHECK constraint validates
-- existing rows on creation. The app also clamps at 0 client-side (see
-- adjustStock in materials.ts) so this never has to surface as an error in
-- the normal "mark delivered" / stock-adjust flows — it's the backstop.

alter table public.materials
  add constraint materials_stock_qty_non_negative
  check (stock_qty >= 0);
