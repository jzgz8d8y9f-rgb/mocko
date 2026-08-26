-- Phone number and gender, collected at signup and editable in Settings.
-- Nullable at the DB level (existing accounts have neither) -- required-ness
-- for new signups is enforced client-side, matching how username content
-- is already primarily validated client-side with a DB backstop.
alter table public.profiles
  add column phone_number text,
  add column gender text check (gender in ('male', 'female', 'other'));
