-- Default usernames were email-local-part + '_' + uuid prefix, which leaks the
-- start of a person's email to everyone who sees their @handle. Use a neutral
-- 'user_' + uuid prefix instead, and rename existing auto-generated handles.
-- Handles people chose themselves are left alone.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (user_id, username)
  values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 8));
  return new;
end;
$$;

update public.profiles p
set username = 'user_' || substr(replace(p.user_id::text, '-', ''), 1, 8)
from auth.users u
where u.id = p.user_id
  and not p.is_bot
  and p.username = left(coalesce(nullif(regexp_replace(split_part(u.email, '@', 1), '[^A-Za-z0-9_]', '', 'g'), ''), 'user'), 13) || '_' || substr(p.user_id::text, 1, 6);
