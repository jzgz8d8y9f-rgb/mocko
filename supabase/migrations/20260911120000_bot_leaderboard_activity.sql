-- Seeds a small roster of bot accounts that quietly play drills on a
-- schedule so the leaderboards (and drill_percentile) never look empty,
-- without needing any always-on server of our own. pg_cron runs the
-- simulation function directly inside Postgres a few times a day; since
-- drill_leaderboard_daily/weekly are just windowed views over
-- drill_scores.created_at, a bot row inserted "today" automatically
-- shows up in Today and This Week and rolls out on its own once the
-- window moves past it -- exactly like a real player's activity.

alter table public.profiles add column if not exists is_bot boolean not null default false;
alter table public.profiles add column if not exists bot_skill numeric;

-- Bots are real auth.users rows (drill_scores.user_id is a hard FK to
-- auth.users, and leaderboards resolve display names via profiles), just
-- never issued a real session -- the on_auth_user_created trigger gives
-- each one a default profile row, which we then relabel below. bot_skill
-- (0.85-1.15) is a stable per-bot "how good are they" factor the
-- simulation function uses to bias where in each drill's believable
-- range their scores land, so bots feel like distinct players rather
-- than one score repeated twelve times.
-- Split into two statements on purpose: a data-modifying WITH can't see
-- a trigger's side effects on ANOTHER table within the same command, so
-- an insert-then-update chained through one CTE silently updates zero
-- rows here (the on_auth_user_created-created profiles rows aren't
-- visible to the UPDATE's scan of public.profiles yet). Two statements
-- gives the UPDATE a fresh snapshot that does see them.
with bot_data(email, username, skill) as (
  values
    ('bot.jordan@mocko.bot', 'jordan_k', 1.05),
    ('bot.priya@mocko.bot', 'priya_s', 0.95),
    ('bot.marcus@mocko.bot', 'marcus_t', 1.10),
    ('bot.elena@mocko.bot', 'elena_w', 0.90),
    ('bot.devon@mocko.bot', 'devon_r', 1.00),
    ('bot.sophia@mocko.bot', 'sophia_l', 1.02),
    ('bot.kwame@mocko.bot', 'kwame_b', 0.93),
    ('bot.mia@mocko.bot', 'mia_chen', 1.08),
    ('bot.noah@mocko.bot', 'noah_p', 0.97),
    ('bot.ava@mocko.bot', 'ava_m', 1.01),
    ('bot.leo@mocko.bot', 'leo_santos', 0.92),
    ('bot.zoe@mocko.bot', 'zoe_okafor', 1.06)
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  gen_random_uuid(),
  'authenticated', 'authenticated',
  b.email,
  gen_random_uuid()::text, -- never used to log in; just needs to be non-null
  now(), now() - (random() * 150 + 5) * interval '1 day', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  false, false
from bot_data b;

with bot_data(email, username, skill) as (
  values
    ('bot.jordan@mocko.bot', 'jordan_k', 1.05),
    ('bot.priya@mocko.bot', 'priya_s', 0.95),
    ('bot.marcus@mocko.bot', 'marcus_t', 1.10),
    ('bot.elena@mocko.bot', 'elena_w', 0.90),
    ('bot.devon@mocko.bot', 'devon_r', 1.00),
    ('bot.sophia@mocko.bot', 'sophia_l', 1.02),
    ('bot.kwame@mocko.bot', 'kwame_b', 0.93),
    ('bot.mia@mocko.bot', 'mia_chen', 1.08),
    ('bot.noah@mocko.bot', 'noah_p', 0.97),
    ('bot.ava@mocko.bot', 'ava_m', 1.01),
    ('bot.leo@mocko.bot', 'leo_santos', 0.92),
    ('bot.zoe@mocko.bot', 'zoe_okafor', 1.06)
)
update public.profiles p
set username = b.username,
    is_bot = true,
    bot_skill = b.skill,
    created_at = u.created_at -- backdated "joined" date so bots don't all look brand new
from auth.users u
join bot_data b on b.email = u.email
where p.user_id = u.id;

-- One simulated "play session" for every bot: each bot has a chance to
-- sit the round out entirely (real players don't log in daily), and
-- otherwise plays 1-4 of the 12 drills. Scores land within a believable
-- human range per drill (informed by each drill's actual scoring scale
-- and in-app "that's a good run" thresholds), biased by the bot's own
-- skill plus per-attempt noise -- never a suspiciously round or maxed-out
-- number. p_when defaults to now() for the live cron jobs below; the
-- one-time backfill at the end of this migration passes in past
-- timestamps so All-Time doesn't look freshly seeded.
create or replace function public.simulate_bot_drill_activity(p_when timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
declare
  bot record;
  drill_keys text[] := array['arithmetic','arithmetic_hard','risk','sequence','digits','stop','cards','arrows','towers','magnitudes','shapes','nback'];
  n_drills integer;
  k text;
  pos_frac numeric;
  lo numeric;
  hi numeric;
  elapsed numeric;
  final_score integer;
begin
  for bot in select user_id, coalesce(bot_skill, 1.0) as bot_skill from public.profiles where is_bot loop
    if random() >= 0.65 then
      continue;
    end if;

    n_drills := 1 + floor(random() * 4)::int;

    -- NOTE: wrapping this in `select array_agg(...) from (... order by
    -- random() limit n) x` silently drops the shuffle (the planner
    -- flattens the array_agg subquery and the LIMIT stops honoring the
    -- ORDER BY, always returning the array's first N elements) -- a
    -- plain FOR-loop over the ordered/limited query does not have that
    -- problem, so pick the subset that way instead.
    for k in select t.k from unnest(drill_keys) as t(k) order by random() limit n_drills loop
      pos_frac := least(greatest((bot.bot_skill + (random() - 0.5) * 0.3 - 0.85) / 0.30, 0), 1);

      if k = 'towers' then
        lo := 38; hi := 105; -- seconds to clear all 3 rounds; lower is better
        elapsed := hi - (hi - lo) * pos_frac;
        final_score := greatest(0, round(300 - elapsed))::int;
      else
        case k
          when 'arithmetic' then lo := 16; hi := 27;
          when 'arithmetic_hard' then lo := 9; hi := 19;
          when 'sequence' then lo := 8; hi := 16;
          when 'risk' then lo := 22; hi := 50;
          when 'digits' then lo := 12; hi := 34;
          when 'stop' then lo := 24; hi := 37;
          when 'cards' then lo := 5; hi := 70;
          when 'arrows' then lo := 17; hi := 27;
          when 'magnitudes' then lo := 13; hi := 25;
          when 'shapes' then lo := 9; hi := 18;
          when 'nback' then lo := 8; hi := 20;
        end case;
        final_score := round(lo + (hi - lo) * pos_frac)::int;
      end if;

      insert into public.drill_scores (user_id, drill_key, score, meta, created_at)
      values (bot.user_id, k, final_score, jsonb_build_object('bot', true), p_when);
    end loop;
  end loop;
end;
$$;

create extension if not exists pg_cron with schema extensions;

-- Three staggered times a day (UTC) so bot activity doesn't all land in
-- one clump -- cron.schedule upserts by job name, so re-running this
-- migration is safe.
select cron.schedule('bot-drill-activity-morning', '15 8 * * *', $$select public.simulate_bot_drill_activity();$$);
select cron.schedule('bot-drill-activity-midday', '10 14 * * *', $$select public.simulate_bot_drill_activity();$$);
select cron.schedule('bot-drill-activity-evening', '40 20 * * *', $$select public.simulate_bot_drill_activity();$$);

-- One-time backfill so All-Time has some depth and Today isn't empty
-- the moment this migration lands, instead of waiting for the first
-- cron tick.
do $$
declare i int;
begin
  for i in 1..25 loop
    perform public.simulate_bot_drill_activity(now() - (random() * interval '45 days'));
  end loop;
  perform public.simulate_bot_drill_activity(now());
end $$;
