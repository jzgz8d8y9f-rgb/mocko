import { supabase } from './supabase-client.js';

async function getProfile() {
  const user = window.MockoAuth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (error) throw error;
  return data;
}

async function updateProfile({
  username, bio, social_links, industry, phone_number, gender, full_name, location, education,
  is_public, show_industry, show_education, show_location, leaderboard_visible,
  notify_weekly_summary, notify_streak_reminders, notify_leaderboard_activity, notify_product_updates,
  onboarding_completed,
}) {
  const user = window.MockoAuth.getUser();
  if (!user) throw new Error('Not signed in');
  const fields = {
    username, bio, social_links, industry, phone_number, gender, full_name, location, education,
    is_public, show_industry, show_education, show_location, leaderboard_visible,
    notify_weekly_summary, notify_streak_reminders, notify_leaderboard_activity, notify_product_updates,
    onboarding_completed,
  };
  Object.keys(fields).forEach((key) => { if (fields[key] === undefined) delete fields[key]; });
  const { data, error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function uploadAvatar(file) {
  const user = window.MockoAuth.getUser();
  if (!user) throw new Error('Not signed in');
  const path = `${user.id}/${Date.now()}-${file.name}`;
  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true });
  if (uploadErr) throw uploadErr;

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: urlData.publicUrl })
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function uploadBanner(file) {
  const user = window.MockoAuth.getUser();
  if (!user) throw new Error('Not signed in');
  const path = `${user.id}/${Date.now()}-${file.name}`;
  const { error: uploadErr } = await supabase.storage
    .from('banners')
    .upload(path, file, { upsert: true });
  if (uploadErr) throw uploadErr;

  const { data: urlData } = supabase.storage.from('banners').getPublicUrl(path);
  const { data, error } = await supabase
    .from('profiles')
    .update({ banner_url: urlData.publicUrl })
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function fetchAccountPercentile() {
  const user = window.MockoAuth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.rpc('account_percentile', { p_user_id: user.id });
  if (error) throw error;
  return data;
}

async function suggestSchool(name) {
  const user = window.MockoAuth.getUser();
  if (!user || !name) return;
  const { error } = await supabase.from('pending_schools').insert({ name, requested_by: user.id });
  if (error) console.error('Could not record school suggestion:', error);
}

// Masked server-side by get_public_profile(): a private profile collapses
// to just enough to say so, and industry/education/location are stripped
// individually per that user's own show_* toggles -- unless userId is the
// caller's own, in which case they always get the full row back.
async function getProfileById(userId) {
  const { data, error } = await supabase.rpc('get_public_profile', { target_user_id: userId });
  if (error) throw error;
  return data;
}

async function getProfilesByIds(userIds) {
  const { data, error } = await supabase.rpc('get_profile_basics', { user_ids: userIds });
  if (error) throw error;
  return data;
}

window.MockoProfile = { getProfile, updateProfile, uploadAvatar, uploadBanner, fetchAccountPercentile, suggestSchool, getProfileById, getProfilesByIds };
