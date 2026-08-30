-- Removes two tables nothing reads or writes any more.
--
-- customer_sites: never held a single row. Left over from an abandoned
--   multi-site design; sites now live on invoices/quotations (migration 014).
-- deliveries: the delivery-challan feature (challan no, driver, vehicle) was
--   used once in months and has been removed from the app. Deliveries are now
--   tracked by the `delivered` flag on the invoice itself.
drop table if exists public.customer_sites;
drop table if exists public.deliveries;
