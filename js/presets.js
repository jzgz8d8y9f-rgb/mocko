import { supabase } from './supabase-client.js';

function requireUser() {
  const user = window.MockoAuth.getUser();
  if (!user) throw new Error('Not signed in');
  return user;
}

// Favorites first, then most recently used. Presets that were never used
// fall back to when they were created.
function sortPresets(list) {
  const stamp = (p) => new Date(p.last_used_at || p.created_at).getTime();
  return [...list].sort((a, b) => {
    if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
    return stamp(b) - stamp(a);
  });
}

async function listPresets() {
  const { data, error } = await supabase.from('presets').select('*');
  if (error) throw error;
  return sortPresets(data || []);
}

async function createPreset(fields) {
  const user = requireUser();
  const { data, error } = await supabase
    .from('presets')
    .insert({ ...fields, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updatePreset(id, fields) {
  const { data, error } = await supabase.from('presets').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function deletePreset(id) {
  const { error } = await supabase.from('presets').delete().eq('id', id);
  if (error) throw error;
}

async function markPresetUsed(id) {
  const { error } = await supabase.from('presets').update({ last_used_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

async function listRoles() {
  const { data, error } = await supabase.from('saved_roles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function createRole({ title, company, description, industry }) {
  const user = requireUser();
  const { data, error } = await supabase
    .from('saved_roles')
    .insert({ user_id: user.id, title, company: company || '', description, industry: industry || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteRole(id) {
  const { error } = await supabase.from('saved_roles').delete().eq('id', id);
  if (error) throw error;
}

async function getLastSetup() {
  const user = requireUser();
  const { data, error } = await supabase.from('profiles').select('last_setup').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data ? data.last_setup : null;
}

async function saveLastSetup(setup) {
  const user = requireUser();
  const { error } = await supabase.from('profiles').update({ last_setup: setup }).eq('user_id', user.id);
  if (error) throw error;
}

window.MockoPresets = {
  sortPresets, listPresets, createPreset, updatePreset, deletePreset, markPresetUsed,
  listRoles, createRole, deleteRole, getLastSetup, saveLastSetup,
};
