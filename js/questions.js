import { supabase } from './supabase-client.js';

async function fetchQuestions({ difficulty, industry, count }) {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('category', 'behavioral')
    .eq('difficulty', difficulty)
    .overlaps('industries', [industry || 'general', 'general']);
  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Shuffle and take `count` -- overlaps() can't express "prefer exact
  // industry match" in one query, so bias toward exact matches first.
  const exact = data.filter(q => q.industries.includes(industry));
  const general = data.filter(q => !q.industries.includes(industry));
  const ordered = [...shuffle(exact), ...shuffle(general)];
  return ordered.slice(0, count);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

window.MockoQuestions = { fetchQuestions };
