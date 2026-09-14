-- Profile expansion for the new banner-style profile page: college,
-- graduation year, hometown, an optional custom banner image, and an
-- account-wide activity percentile (mirrors drill_percentile's style,
-- but ranks total activity across all drills+sessions instead of one
-- drill's scores, since raw scores aren't comparable across drills).
alter table public.profiles
  add column college text,
  add column graduation_year text,
  add column hometown text,
  add column banner_url text;

-- Banners bucket: same public-read / owner-write shape as avatars.
insert into storage.buckets (id, name, public)
values ('banners', 'banners', true)
on conflict (id) do nothing;

create policy "Anyone can view banners"
  on storage.objects for select
  using (bucket_id = 'banners');

create policy "Users can upload their own banner"
  on storage.objects for insert
  with check (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own banner"
  on storage.objects for update
  using (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.account_percentile(p_user_id uuid)
returns numeric language sql stable as $$
  with activity_counts as (
    select user_id, count(*) as total
    from (
      select user_id from public.sessions where overall_score is not null
      union all
      select user_id from public.drill_scores
    ) all_activity
    group by user_id
  ),
  my_total as (
    select total from activity_counts where user_id = p_user_id
  )
  select case when not exists (select 1 from my_total) then null
    else round(100.0 * count(*) filter (where total < (select total from my_total)) / greatest(count(*), 1), 1)
  end
  from activity_counts;
$$;

grant execute on function public.account_percentile(uuid) to authenticated;
