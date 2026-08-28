-- BuildSupply — backfill search_keywords aliases on the 21 Sand / Metal-Gitti
-- variants seeded by 002_master_catalog_seed.sql before the admin's "Search
-- keywords" field existed on those rows. Covers the exact synonym examples
-- from the catalog spec (gitti/gitty/aggregate, nadi sand/nadi ret, etc.)
-- so search isn't limited to literal product-name substrings.
-- Safe to run more than once (plain UPDATE, not additive).

update public.master_material_variants v
set search_keywords = 'gitti gitty aggregate metal jelly khadi'
from public.material_types mt
where v.material_type_id = mt.id
  and mt.name in ('10mm Metal / Gitti', '20mm Metal / Gitti', '40mm Metal / Gitti');

update public.master_material_variants v
set search_keywords = 'river sand nadi sand nadi ret'
from public.material_types mt
where v.material_type_id = mt.id
  and mt.name = 'River Sand';

update public.master_material_variants v
set search_keywords = 'm sand msand manufactured sand crushed sand'
from public.material_types mt
where v.material_type_id = mt.id
  and mt.name = 'M-Sand';

update public.master_material_variants v
set search_keywords = 'plaster sand plastering sand fine sand'
from public.material_types mt
where v.material_type_id = mt.id
  and mt.name = 'Plaster Sand';

update public.master_material_variants v
set search_keywords = 'manufactured sand m sand crusher sand'
from public.material_types mt
where v.material_type_id = mt.id
  and mt.name = 'Manufactured Sand';
