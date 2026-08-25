-- Drill scores + leaderboards. First time this app persists a drill
-- result anywhere, and first time any table needs to be readable across
-- users (leaderboards must resolve OTHER players' username/avatar).
create table public.drill_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  drill_key text not null check (drill_key in (
    'arithmetic', 'arithmetic_hard', 'risk', 'sequence'
  )),
  score integer not null check (score >= 0),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index drill_scores_leaderboard_idx on public.drill_scores (drill_key, score desc, created_at);
create index drill_scores_user_idx on public.drill_scores (user_id, drill_key);

alter table public.drill_scores enable row level security;

create policy "Anyone can read drill scores"
  on public.drill_scores for select using (true);

create policy "Users can insert their own drill scores"
  on public.drill_scores for insert with check (auth.uid() = user_id);

-- Leaderboards need to resolve ANY player's username/avatar, not just
-- the signed-in user's -- profiles RLS has never allowed this before.
drop policy "Users can view their own profile" on public.profiles;
create policy "Anyone can view profiles"
  on public.profiles for select using (true);

-- A public profile view needs a join date that isn't the signed-in
-- user's own auth.users row (which we can't read for other people).
alter table public.profiles add column created_at timestamptz not null default now();

-- Leaderboards dedupe to each player's best score per drill (one
-- grinder shouldn't be able to fill the board with 50 rows).
create view public.drill_leaderboard_alltime with (security_invoker = true) as
  select distinct on (drill_key, user_id) drill_key, user_id, score, created_at
  from public.drill_scores
  order by drill_key, user_id, score desc, created_at asc;

create view public.drill_leaderboard_daily with (security_invoker = true) as
  select distinct on (drill_key, user_id) drill_key, user_id, score, created_at
  from public.drill_scores
  where created_at >= date_trunc('day', now())
  order by drill_key, user_id, score desc, created_at asc;

-- "You beat X% of players" -- always computed against the all-time
-- best-per-user pool (stable/meaningful even right after midnight when
-- the daily pool is nearly empty). score < p_score so a just-submitted
-- score never counts as "beating itself".
create or replace function public.drill_percentile(p_drill_key text, p_score integer)
returns numeric language sql stable as $$
  select case when count(*) = 0 then 0
    else round(100.0 * count(*) filter (where score < p_score) / count(*), 1)
  end
  from public.drill_leaderboard_alltime where drill_key = p_drill_key;
$$;

grant execute on function public.drill_percentile(text, integer) to authenticated;
