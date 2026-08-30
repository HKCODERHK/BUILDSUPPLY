-- Site moves from the customer to the individual bill/estimate.
--
-- A contractor buys for several sites at once, but a customer row is unique
-- by phone number — so "one customer = one site" made multi-site contractors
-- impossible to enter. The site belongs to the *order* anyway (the truck goes
-- to a site, not to a person), so it lives on invoices and quotations now.
--
-- customers.site is kept: it stays searchable and now acts as the default
-- site pre-filled when billing that customer.
alter table public.invoices add column if not exists site text;
alter table public.quotations add column if not exists site text;

-- Existing bills keep the site they were effectively raised against.
update public.invoices i
set site = c.site
from public.customers c
where c.id = i.customer_id and i.site is null and c.site is not null and c.site <> '';

update public.quotations q
set site = c.site
from public.customers c
where c.id = q.customer_id and q.site is null and c.site is not null and c.site <> '';

create index if not exists invoices_site_idx on public.invoices (supplier_id, site);
