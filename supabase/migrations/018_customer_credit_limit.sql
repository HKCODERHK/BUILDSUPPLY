-- Udhaar limit: how much credit this supplier is willing to extend to this
-- customer. Null means "no limit set", which is the default and the case for
-- almost every customer — the field only exists for the handful of
-- contractors a supplier wants a warning about.
--
-- Deliberately NOT enforced by a constraint: going over the limit is a
-- business decision the supplier makes at the counter, not an error. The app
-- warns, it never blocks the bill.
alter table public.customers
  add column if not exists credit_limit numeric;

comment on column public.customers.credit_limit is
  'Optional udhaar (credit) limit in rupees. Null = no limit. Warning only, never enforced.';
