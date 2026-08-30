-- BuildSupply — add "Bank/Cheque" as a valid payment mode
-- Run this in the Supabase SQL editor AFTER 009_stock_never_negative.sql.

alter table public.payments drop constraint payments_mode_check;
alter table public.payments
  add constraint payments_mode_check
  check (mode = any (array['Cash', 'UPI', 'Wallet', 'Bank/Cheque', 'Split']));
