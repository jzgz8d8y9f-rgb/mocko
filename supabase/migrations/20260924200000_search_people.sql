-- Search by name or @username for the "Add friend" flow. Same public-safe
-- allowlist as get_friend_suggestions, plus a computed relationship status
-- so the client doesn't need a second round trip per result.
create or replace function public.search_people(p_query text)
returns table (
  user_id uuid, username text, full_name text, avatar_url text,
  location text, industry text, school text, status text
)
language sql stable security definer set search_path = public
as $$
  select p.user_id, p.username,
    case when p.is_public then p.full_name end,
    p.avatar_url,
    case when p.is_public and p.show_location then p.location end,
    case when p.is_public and p.show_industry then p.industry end,
    case when p.is_public and p.show_education and jsonb_typeof(p.education) = 'array' then p.education->0->>'school' end,
    case
      when f.status = 'accepted' then 'friends'
      when f.status = 'pending' and f.requester_id = auth.uid() then 'requested'
      when f.status = 'pending' and f.requester_id = p.user_id then 'incoming'
      else 'none'
    end
  from public.profiles p
  left join public.friendships f
    on (f.requester_id = auth.uid() and f.addressee_id = p.user_id)
    or (f.requester_id = p.user_id and f.addressee_id = auth.uid())
  where p.is_public and not p.is_bot and p.onboarding_completed and p.user_id <> auth.uid()
    and length(trim(p_query)) > 0
    and (p.username ilike '%' || regexp_replace(trim(p_query), '^@', '') || '%'
      or p.full_name ilike '%' || trim(p_query) || '%')
  order by
    (lower(p.username) = lower(regexp_replace(trim(p_query), '^@', ''))) desc,
    (p.username ilike regexp_replace(trim(p_query), '^@', '') || '%') desc,
    p.username
  limit 30;
$$;

revoke all on function public.search_people(text) from public, anon;
grant execute on function public.search_people(text) to authenticated;
