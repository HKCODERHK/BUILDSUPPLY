-- Replaces the single "Open" quotation status with a Draft/Sent workflow:
-- a new estimate starts as Draft, and flips to Sent once the supplier
-- actually shares it with the customer over WhatsApp. Matches the
-- Estimates & Quotations list mockup.
alter table public.quotations drop constraint quotations_status_check;
alter table public.quotations add constraint quotations_status_check
  check (status in ('Draft', 'Sent', 'Converted', 'Expired'));

update public.quotations set status = 'Draft' where status = 'Open';

alter table public.quotations alter column status set default 'Draft';
