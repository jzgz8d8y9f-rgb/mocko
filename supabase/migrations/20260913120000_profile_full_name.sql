-- Adds a real name to profiles, separate from the username handle, so the
-- Home screen can greet people by name ("Welcome back, Alex") instead of
-- a generic "Welcome back" or their @handle.
alter table public.profiles add column full_name text;
