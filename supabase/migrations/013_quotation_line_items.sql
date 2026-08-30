-- Quotations gain full line-item support (materials, qty, rate) plus
-- GST/transport-labour, matching invoice creation exactly, so a converted
-- invoice can carry the same items and numbers across instead of collapsing
-- to one fake "Converted from QT-XXXX" line.
alter table public.quotations
  add column if not exists subtotal numeric not null default 0,
  add column if not exists gst_amount numeric not null default 0,
  add column if not exists transport_labour_charge numeric not null default 0 check (transport_labour_charge >= 0);

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  material_id uuid references public.materials(id) on delete set null,
  description text not null,
  qty numeric not null,
  rate numeric not null,
  amount numeric not null
);

alter table public.quotation_items enable row level security;

create policy quotation_items_tenant_isolation on public.quotation_items
  for all using (supplier_id = auth.uid() or is_admin())
  with check (supplier_id = auth.uid() or is_admin());

create index if not exists quotation_items_quotation_id_idx on public.quotation_items (quotation_id);
