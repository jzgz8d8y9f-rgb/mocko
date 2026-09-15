-- Settings > Privacy and Settings > Notifications, for real: the toggles
-- persist actual state instead of being decorative.
--
-- Privacy:
--   is_public              -- profile page visible to other users at all
--   show_industry/education/location -- individually hide a field on your
--                             public profile without deleting the data
--   leaderboard_visible    -- appear in drill leaderboards
--
-- Notifications: preference flags only. There's no email-sending pipeline
-- yet (no scheduled job, no email provider wired up), so these record what
-- a user wants -- nothing reads them and sends mail yet. That's a separate
-- piece of infrastructure to build when the notifications themselves exist.
alter table public.profiles
  add column is_public boolean not null default true,
  add column show_industry boolean not null default true,
  add column show_education boolean not null default true,
  add column show_location boolean not null default true,
  add column leaderboard_visible boolean not null default true,
  add column notify_weekly_summary boolean not null default true,
  add column notify_streak_reminders boolean not null default true,
  add column notify_leaderboard_activity boolean not null default false,
  add column notify_product_updates boolean not null default false;

-- Returns a profile shaped for a VIEWER, not the owner: a private profile
-- collapses to just enough to say "this is private," and industry/
-- education/location are individually nulled out per that user's show_*
-- flags. The owner viewing their own profile (handled client-side via the
-- existing getProfile(), a direct table read) always sees everything --
-- this function is only used for *other* people's profiles.
-- security definer so it can read the full row internally regardless of
-- who's asking, then decide what to hand back -- the masking logic lives
-- here, not in the client, so it can't be bypassed by calling the table
-- directly with a different query shape.
create or replace function public.get_public_profile(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data public.profiles;
  result jsonb;
begin
  select * into row_data from public.profiles where user_id = target_user_id;
  if row_data is null then
    return null;
  end if;

  if target_user_id = auth.uid() then
    return to_jsonb(row_data);
  end if;

  if row_data.is_public is not true then
    return jsonb_build_object(
      'user_id', row_data.user_id,
      'username', row_data.username,
      'avatar_url', row_data.avatar_url,
      'created_at', row_data.created_at,
      'is_public', false
    );
  end if;

  result := to_jsonb(row_data);
  if row_data.show_industry is not true then
    result := result - 'industry';
  end if;
  if row_data.show_education is not true then
    result := result - 'education';
  end if;
  if row_data.show_location is not true then
    result := result - 'location';
  end if;
  return result;
end;
$$;

revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to authenticated, anon;

-- Leaderboards exclude anyone who's turned off "appear on leaderboards" --
-- enforced here (the actual query these views feed), not just hidden in
-- the UI, so an opted-out user's scores genuinely don't surface to anyone.
create or replace view public.drill_leaderboard_alltime as
  select distinct on (ds.drill_key, ds.user_id) ds.drill_key, ds.user_id, ds.score, ds.created_at
  from public.drill_scores ds
  join public.profiles p on p.user_id = ds.user_id and p.leaderboard_visible = true
  order by ds.drill_key, ds.user_id, ds.score desc, ds.created_at;

create or replace view public.drill_leaderboard_daily as
  select distinct on (ds.drill_key, ds.user_id) ds.drill_key, ds.user_id, ds.score, ds.created_at
  from public.drill_scores ds
  join public.profiles p on p.user_id = ds.user_id and p.leaderboard_visible = true
  where ds.created_at >= date_trunc('day', now())
  order by ds.drill_key, ds.user_id, ds.score desc, ds.created_at;

create or replace view public.drill_leaderboard_weekly as
  select distinct on (ds.drill_key, ds.user_id) ds.drill_key, ds.user_id, ds.score, ds.created_at
  from public.drill_scores ds
  join public.profiles p on p.user_id = ds.user_id and p.leaderboard_visible = true
  where ds.created_at >= date_trunc('week', now())
  order by ds.drill_key, ds.user_id, ds.score desc, ds.created_at;
