-- Weekly leaderboard view, matching the existing daily/all-time pattern,
-- for the Home page leaderboard's Daily/Weekly toggle.
create view public.drill_leaderboard_weekly with (security_invoker = true) as
  select distinct on (drill_key, user_id) drill_key, user_id, score, created_at
  from public.drill_scores
  where created_at >= date_trunc('week', now())
  order by drill_key, user_id, score desc, created_at asc;

-- drill_rank rewritten to branch across all three periods via dynamic
-- SQL instead of duplicating the daily branch a third time.
create or replace function public.drill_rank(p_drill_key text, p_period text, p_user_id uuid)
returns integer language plpgsql stable as $$
declare
  my_score integer;
  higher_count integer;
  tbl text;
begin
  tbl := case p_period
    when 'daily' then 'public.drill_leaderboard_daily'
    when 'weekly' then 'public.drill_leaderboard_weekly'
    else 'public.drill_leaderboard_alltime'
  end;
  execute format('select score from %s where drill_key = $1 and user_id = $2', tbl)
    into my_score using p_drill_key, p_user_id;
  if my_score is null then return null; end if;
  execute format('select count(*) from %s where drill_key = $1 and score > $2', tbl)
    into higher_count using p_drill_key, my_score;
  return higher_count + 1;
end;
$$;

grant execute on function public.drill_rank(text, text, uuid) to authenticated;
