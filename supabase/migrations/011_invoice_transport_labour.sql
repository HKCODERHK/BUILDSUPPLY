-- Optional flat "Transport + Labour" charge on an invoice, on top of the
-- material subtotal and GST — e.g. delivery/loading charges billed alongside
-- the materials themselves. Defaults to 0 so existing invoices are unaffected.
alter table public.invoices
  add column if not exists transport_labour_charge numeric not null default 0 check (transport_labour_charge >= 0);
