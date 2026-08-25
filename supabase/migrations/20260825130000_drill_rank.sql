-- "My rank" for a drill+period, mirroring drill_percentile's style but
-- returning an exact integer position instead of a rough percentile,
-- and respecting daily vs. all-time (drill_percentile never did).
create or replace function public.drill_rank(p_drill_key text, p_period text, p_user_id uuid)
returns integer language plpgsql stable as $$
declare
  my_score integer;
  higher_count integer;
begin
  if p_period = 'daily' then
    select score into my_score from public.drill_leaderboard_daily
      where drill_key = p_drill_key and user_id = p_user_id;
    if my_score is null then return null; end if;
    select count(*) into higher_count from public.drill_leaderboard_daily
      where drill_key = p_drill_key and score > my_score;
  else
    select score into my_score from public.drill_leaderboard_alltime
      where drill_key = p_drill_key and user_id = p_user_id;
    if my_score is null then return null; end if;
    select count(*) into higher_count from public.drill_leaderboard_alltime
      where drill_key = p_drill_key and score > my_score;
  end if;
  return higher_count + 1;
end;
$$;

grant execute on function public.drill_rank(text, text, uuid) to authenticated;
