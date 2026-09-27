-- Suggestions now also include friends-of-friends (anyone sharing at least one
-- mutual friend), not just people matching on city/school/industry. The
-- client uses mutual_count to rank every section and to fill the "General"
-- section, where an industry match carries no signal.
create or replace function public.get_friend_suggestions()
returns table (
  user_id uuid, username text, full_name text, avatar_url text,
  location text, industry text, school text,
  same_location boolean, same_school boolean, same_industry boolean, mutual_count int
)
language sql stable security definer set search_path = public
as $$
  with me as (
    select p.user_id,
      nullif(lower(trim(split_part(coalesce(p.location, ''), ',', 1))), '') as city,
      nullif(lower(trim(case when jsonb_typeof(p.education) = 'array' then p.education->0->>'school' end)), '') as school,
      nullif(lower(trim(coalesce(p.industry, ''))), '') as industry
    from public.profiles p where p.user_id = auth.uid()
  ),
  my_friends as (select public.friend_ids(auth.uid()) as fid),
  cand as (
    select p.user_id, p.username, p.full_name, p.avatar_url, p.location, p.industry, p.education,
      p.show_location, p.show_industry, p.show_education, p.created_at,
      (p.show_location and (select city from me) is not null
        and nullif(lower(trim(split_part(coalesce(p.location, ''), ',', 1))), '') = (select city from me)) as sl,
      (p.show_education and (select school from me) is not null and jsonb_typeof(p.education) = 'array'
        and exists (
          select 1 from jsonb_array_elements(p.education) e
          where nullif(lower(trim(e->>'school')), '') = (select school from me))) as ss,
      (p.show_industry and (select industry from me) is not null
        and lower(trim(coalesce(p.industry, ''))) = (select industry from me)) as si,
      (select count(*)::int from public.friendships f
        where f.status = 'accepted' and p.user_id in (f.requester_id, f.addressee_id)
          and (case when f.requester_id = p.user_id then f.addressee_id else f.requester_id end) in (select fid from my_friends)) as mc
    from public.profiles p
    where p.is_public and not p.is_bot and p.onboarding_completed and p.user_id <> auth.uid()
      and not exists (
        select 1 from public.friendships f
        where auth.uid() in (f.requester_id, f.addressee_id) and p.user_id in (f.requester_id, f.addressee_id))
  )
  select c.user_id, c.username, c.full_name, c.avatar_url,
    case when c.show_location then c.location end,
    case when c.show_industry then c.industry end,
    case when c.show_education and jsonb_typeof(c.education) = 'array' then c.education->0->>'school' end,
    c.sl, c.ss, c.si, c.mc
  from cand c
  where c.sl or c.ss or c.si or c.mc > 0
  order by (c.sl::int + c.ss::int + c.si::int) desc, c.mc desc, c.created_at desc
  limit 150;
$$;
