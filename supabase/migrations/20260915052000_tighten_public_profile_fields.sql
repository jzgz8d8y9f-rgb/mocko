-- get_public_profile()'s "public" branch started from the full row and
-- only deleted industry/education/location -- so phone_number, gender, and
-- every privacy/notification setting itself (show_industry, is_public,
-- notify_*, leaderboard_visible, ...) were still handed to any other
-- viewer who called it. None of that belongs to anyone but the profile
-- owner. Rebuilt to build an explicit allowlist of public-appropriate
-- fields instead of a denylist of three.
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

  result := jsonb_build_object(
    'user_id', row_data.user_id,
    'username', row_data.username,
    'full_name', row_data.full_name,
    'avatar_url', row_data.avatar_url,
    'banner_url', row_data.banner_url,
    'bio', row_data.bio,
    'social_links', row_data.social_links,
    'created_at', row_data.created_at,
    'is_public', true
  );
  if row_data.show_industry is true then
    result := result || jsonb_build_object('industry', row_data.industry);
  end if;
  if row_data.show_education is true then
    result := result || jsonb_build_object('education', row_data.education);
  end if;
  if row_data.show_location is true then
    result := result || jsonb_build_object('location', row_data.location);
  end if;
  return result;
end;
$$;
