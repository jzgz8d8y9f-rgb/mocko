import { supabase } from './supabase-client.js';

async function submitScore({ drillKey, score, meta = {} }) {
  const user = window.MockoAuth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('drill_scores')
    .insert({ user_id: user.id, drill_key: drillKey, score, meta })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function fetchLeaderboard({ drillKey, period = 'alltime', limit = 20 }) {
  const view = period === 'daily' ? 'drill_leaderboard_daily' : 'drill_leaderboard_alltime';
  const { data: rows, error } = await supabase
    .from(view)
    .select('user_id, score, created_at')
    .eq('drill_key', drillKey)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!rows || !rows.length) return [];
  const profiles = await window.MockoProfile.getProfilesByIds([...new Set(rows.map(r => r.user_id))]);
  const byId = Object.fromEntries(profiles.map(p => [p.user_id, p]));
  return rows.map((r, i) => ({ rank: i + 1, ...r, profile: byId[r.user_id] }));
}

async function fetchPercentile({ drillKey, score }) {
  const { data, error } = await supabase.rpc('drill_percentile', { p_drill_key: drillKey, p_score: score });
  if (error) throw error;
  return data;
}

window.MockoDrills = { submitScore, fetchLeaderboard, fetchPercentile };
