import { supabase } from './supabase-client.js';

async function fetchSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

window.MockoHistory = { fetchSessions };
