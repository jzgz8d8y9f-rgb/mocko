-- Social tab: friendships, activity likes, and the server-side functions that
-- read other people's data. profiles/sessions/drill_scores are owner-only
-- under RLS, so everything that crosses users goes through security definer
-- functions that build an explicit allowlist of fields and honor each
-- person's privacy settings (is_public, show_*, and the new show_activity).

alter table public.profiles
  add column show_activity boolean not null default true;

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

-- One row per pair regardless of who asked first.
create unique index friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);
create index friendships_requester_idx on public.friendships (requester_id);

alter table public.friendships enable row level security;

create policy "Users can see their own friendships"
  on public.friendships for select
  using (auth.uid() in (requester_id, addressee_id));

create policy "Users can send friend requests"
  on public.friendships for insert
  with check (auth.uid() = requester_id and status = 'pending');

create policy "Recipients can accept requests"
  on public.friendships for update
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id and status = 'accepted');

create policy "Either side can end a friendship or decline a request"
  on public.friendships for delete
  using (auth.uid() in (requester_id, addressee_id));

-- Likes are only ever read/written through the functions below.
create table public.activity_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, event_key)
);
alter table public.activity_likes enable row level security;

-- Internal helper: accepted friends of a user. Takes an arbitrary uid, so it
-- must never be callable directly by clients.
create or replace function public.friend_ids(p_uid uuid)
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select case when f.requester_id = p_uid then f.addressee_id else f.requester_id end
  from public.friendships f
  where f.status = 'accepted' and p_uid in (f.requester_id, f.addressee_id);
$$;
revoke all on function public.friend_ids(uuid) from public, anon, authenticated;

create or replace function public.get_friends()
returns table (
  user_id uuid, username text, full_name text, avatar_url text,
  location text, industry text, school text,
  activity_hidden boolean, streak int, practiced_today boolean, week_count int
)
language sql stable security definer set search_path = public
as $$
  with mine as (select public.friend_ids(auth.uid()) as fid),
  days as (
    select s.user_id as uid, (s.created_at at time zone 'UTC')::date as d
    from public.sessions s
    where s.overall_score is not null and s.user_id in (select fid from mine)
    union
    select ds.user_id, (ds.created_at at time zone 'UTC')::date
    from public.drill_scores ds
    where ds.user_id in (select fid from mine)
  ),
  islands as (
    select uid, d, d - (row_number() over (partition by uid order by d))::int as grp from days
  ),
  runs as (select uid, count(*)::int as len, max(d) as last_d from islands group by uid, grp),
  streaks as (
    select uid, max(len) as streak from runs
    where last_d >= (now() at time zone 'UTC')::date - 1 group by uid
  ),
  today as (select distinct uid from days where d = (now() at time zone 'UTC')::date),
  week as (
    select uid, count(*)::int as n from (
      select s.user_id as uid from public.sessions s
      where s.overall_score is not null and s.user_id in (select fid from mine) and s.created_at > now() - interval '7 days'
      union all
      select ds.user_id from public.drill_scores ds
      where ds.user_id in (select fid from mine) and ds.created_at > now() - interval '7 days'
    ) x group by uid
  )
  select p.user_id, p.username,
    case when p.is_public then p.full_name end,
    p.avatar_url,
    case when p.is_public and p.show_location then p.location end,
    case when p.is_public and p.show_industry then p.industry end,
    case when p.is_public and p.show_education and jsonb_typeof(p.education) = 'array' then p.education->0->>'school' end,
    not p.show_activity,
    case when p.show_activity then coalesce(st.streak, 0) end,
    case when p.show_activity then (t.uid is not null) end,
    case when p.show_activity then coalesce(w.n, 0) end
  from public.profiles p
  join mine m on m.fid = p.user_id
  left join streaks st on st.uid = p.user_id
  left join today t on t.uid = p.user_id
  left join week w on w.uid = p.user_id
  order by (t.uid is not null) desc, coalesce(st.streak, 0) desc, p.username;
$$;

create or replace function public.get_friend_requests()
returns table (user_id uuid, username text, full_name text, avatar_url text, requested_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select p.user_id, p.username, case when p.is_public then p.full_name end, p.avatar_url, f.created_at
  from public.friendships f
  join public.profiles p on p.user_id = f.requester_id
  where f.addressee_id = auth.uid() and f.status = 'pending'
  order by f.created_at desc;
$$;

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
        and lower(trim(coalesce(p.industry, ''))) = (select industry from me)) as si
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
    c.sl, c.ss, c.si,
    (select count(*)::int from public.friendships f
      where f.status = 'accepted' and c.user_id in (f.requester_id, f.addressee_id)
        and (case when f.requester_id = c.user_id then f.addressee_id else f.requester_id end) in (select fid from my_friends)) as mutual_count
  from cand c
  where c.sl or c.ss or c.si
  order by (c.sl::int + c.ss::int + c.si::int) desc, mutual_count desc, c.created_at desc
  limit 150;
$$;

create or replace function public.get_friend_activity(p_limit int default 40)
returns table (
  event_key text, user_id uuid, username text, full_name text, avatar_url text,
  kind text, detail jsonb, created_at timestamptz, like_count int, liked_by_me boolean
)
language sql stable security definer set search_path = public
as $$
  with vis as (
    select p.user_id, p.username, case when p.is_public then p.full_name end as full_name, p.avatar_url
    from public.profiles p
    where p.show_activity and p.user_id in (select public.friend_ids(auth.uid()))
  ),
  ev as (
    select 'session:' || s.id::text as event_key, s.user_id, 'session'::text as kind,
      jsonb_build_object('mode', s.mode, 'length', s.length, 'difficulty', s.difficulty, 'score', s.overall_score) as detail,
      s.created_at
    from public.sessions s join vis on vis.user_id = s.user_id
    where s.overall_score is not null and s.created_at > now() - interval '30 days'
    union all
    select 'drill:' || d.id::text, d.user_id, 'drill'::text,
      jsonb_build_object('drill_key', d.drill_key, 'score', d.score), d.created_at
    from public.drill_scores d join vis on vis.user_id = d.user_id
    where d.created_at > now() - interval '30 days'
  )
  select ev.event_key, ev.user_id, vis.username, vis.full_name, vis.avatar_url, ev.kind, ev.detail, ev.created_at,
    (select count(*)::int from public.activity_likes l where l.event_key = ev.event_key),
    exists (select 1 from public.activity_likes l where l.event_key = ev.event_key and l.user_id = auth.uid())
  from ev join vis on vis.user_id = ev.user_id
  order by ev.created_at desc
  limit greatest(1, least(p_limit, 100));
$$;

create or replace function public.toggle_activity_like(p_event_key text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_kind text;
  v_id uuid;
  v_owner uuid;
  v_liked boolean;
  v_count int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  v_kind := split_part(p_event_key, ':', 1);
  begin
    v_id := split_part(p_event_key, ':', 2)::uuid;
  exception when others then
    raise exception 'Invalid event';
  end;

  if v_kind = 'session' then
    select s.user_id into v_owner from public.sessions s where s.id = v_id and s.overall_score is not null;
  elsif v_kind = 'drill' then
    select d.user_id into v_owner from public.drill_scores d where d.id = v_id;
  else
    raise exception 'Invalid event';
  end if;
  if v_owner is null then raise exception 'Event not found'; end if;

  if v_owner <> auth.uid() then
    if not exists (
      select 1 from public.friendships f
      where f.status = 'accepted' and auth.uid() in (f.requester_id, f.addressee_id) and v_owner in (f.requester_id, f.addressee_id)
    ) or not (select p.show_activity from public.profiles p where p.user_id = v_owner) then
      raise exception 'Not allowed';
    end if;
  end if;

  if exists (select 1 from public.activity_likes where user_id = auth.uid() and event_key = p_event_key) then
    delete from public.activity_likes where user_id = auth.uid() and event_key = p_event_key;
    v_liked := false;
  else
    insert into public.activity_likes (user_id, event_key) values (auth.uid(), p_event_key);
    v_liked := true;
  end if;
  select count(*)::int into v_count from public.activity_likes where event_key = p_event_key;
  return jsonb_build_object('liked', v_liked, 'like_count', v_count);
end;
$$;

revoke all on function public.get_friends() from public, anon;
revoke all on function public.get_friend_requests() from public, anon;
revoke all on function public.get_friend_suggestions() from public, anon;
revoke all on function public.get_friend_activity(int) from public, anon;
revoke all on function public.toggle_activity_like(text) from public, anon;
grant execute on function public.get_friends() to authenticated;
grant execute on function public.get_friend_requests() to authenticated;
grant execute on function public.get_friend_suggestions() to authenticated;
grant execute on function public.get_friend_activity(int) to authenticated;
grant execute on function public.toggle_activity_like(text) to authenticated;
