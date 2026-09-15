-- The previous migration added get_public_profile() to mask a private
-- profile's fields for other viewers, but the base table policy
-- ("Anyone can view profiles", qual: true) was still wide open -- so
-- get_public_profile() only protected clients that bothered to call it.
-- Anyone querying `profiles` directly (any REST call, not just this app's
-- own code) could still read a "private" user's full row, including
-- industry/education/location regardless of their show_* toggles. That's
-- not actually private. Lock the table down to owner-only and force every
-- other-user read through a security-definer function that decides what to
-- expose, the same way delete_own_account() and get_public_profile() do.
drop policy "Anyone can view profiles" on public.profiles;

create policy "Users can view their own profile row"
  on public.profiles for select
  using (auth.uid() = user_id);

-- Leaderboard rows need a username + avatar for whoever's on them (that's
-- the whole point of a leaderboard) -- this is intentionally NOT gated by
-- is_public, since appearing on a leaderboard already means your username
-- is visible there; it's gated by nothing else because the *only* caller
-- passes ids that came out of the drill_leaderboard_* views, which already
-- excluded anyone with leaderboard_visible = false.
create or replace function public.get_profile_basics(user_ids uuid[])
returns table (user_id uuid, username text, avatar_url text)
language sql
security definer
set search_path = public
stable
as $$
  select p.user_id, p.username, p.avatar_url
  from public.profiles p
  where p.user_id = any(user_ids);
$$;

revoke all on function public.get_profile_basics(uuid[]) from public;
grant execute on function public.get_profile_basics(uuid[]) to authenticated, anon;
