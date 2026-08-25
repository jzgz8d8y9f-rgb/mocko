import { supabase } from './supabase-client.js';

async function fetchSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function fetchDrillStats() {
  const user = window.MockoAuth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('drill_scores')
    .select('drill_key, score, created_at')
    .eq('user_id', user.id);
  if (error) throw error;
  return data;
}

window.MockoHistory = { fetchSessions, fetchDrillStats };
