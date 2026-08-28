-- BuildSupply — fix search_text to include unit-suffixed attribute values
-- (e.g. "12mm", "400 cft") so supplier search matches the same text the UI
-- displays. Bug found live: searching "12mm" returned nothing because the
-- trigger only concatenated the bare attribute value ("12"), never the
-- "mm"/"m"/"cft"/"kg" suffix that catalogAttributes.ts appends for display.
-- Safe to run more than once.

create or replace function public.refresh_master_variant_search_text()
returns trigger
language plpgsql
as $$
declare
  v_category_name text;
  v_type_name text;
  v_brand_name text;
  v_attr_text text;
begin
  select mc.name, mt.name
    into v_category_name, v_type_name
  from public.material_types mt
  join public.material_categories mc on mc.id = mt.category_id
  where mt.id = new.material_type_id;

  if new.brand_id is not null then
    select b.name into v_brand_name from public.brands b where b.id = new.brand_id;
  end if;

  select string_agg(
      value || ' ' || case key
        when 'diameter_mm' then value || 'mm'
        when 'length_m' then value || 'm'
        when 'capacity_cft' then value || ' cft'
        when 'pack_size_kg' then value || ' kg'
        else value
      end,
      ' '
    ) into v_attr_text
  from jsonb_each_text(coalesce(new.attributes, '{}'::jsonb));

  new.search_text := lower(
    coalesce(new.name, '') || ' ' ||
    coalesce(v_type_name, '') || ' ' ||
    coalesce(v_category_name, '') || ' ' ||
    coalesce(v_brand_name, '') || ' ' ||
    coalesce(new.unit, '') || ' ' ||
    coalesce(new.search_keywords, '') || ' ' ||
    coalesce(v_attr_text, '')
  );
  return new;
end;
$$;

-- Re-fire the trigger on every existing row so already-seeded variants pick
-- up the fixed search_text immediately, without waiting for their next edit.
update public.master_material_variants set attributes = attributes;
