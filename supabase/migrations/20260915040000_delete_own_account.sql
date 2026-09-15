-- Self-serve account deletion. Runs as the function owner (security
-- definer) so it can delete from auth.users, which a normal authenticated
-- client role can't touch directly -- but it only ever deletes auth.uid()'s
-- own row, so a caller can never delete anyone else's account.
-- profiles/sessions/resumes/drill_scores/session_questions all have
-- `on delete cascade` foreign keys to auth.users, so this cleans up all of
-- a user's relational data in one shot. Storage objects (avatars, banners,
-- resumes, recordings) aren't relational and are removed client-side before
-- this is called.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
