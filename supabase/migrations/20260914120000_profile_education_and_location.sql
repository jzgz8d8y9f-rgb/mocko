-- Profile v2: rename hometown -> location to match the new profile page's
-- wording, and replace the single college/graduation_year fields with a
-- multi-entry education array (school/major/graduation_year/location per
-- entry), since people have more than one school and the UI now supports
-- adding several.
alter table public.profiles rename column hometown to location;
alter table public.profiles drop column college;
alter table public.profiles drop column graduation_year;
alter table public.profiles add column education jsonb not null default '[]'::jsonb;
