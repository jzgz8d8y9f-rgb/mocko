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

async function updateProfile({ username, bio, social_links, industry, phone_number, gender }) {
  const user = window.MockoAuth.getUser();
  if (!user) throw new Error('Not signed in');
  const fields = { username, bio, social_links, industry, phone_number, gender };
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

async function getProfileById(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data;
}

async function getProfilesByIds(userIds) {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, avatar_url')
    .in('user_id', userIds);
  if (error) throw error;
  return data;
}

window.MockoProfile = { getProfile, updateProfile, uploadAvatar, getProfileById, getProfilesByIds };
