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

  // Prefer exact industry matches over general ones, and within each
  // group do weighted sampling without replacement so common questions
  // come up far more often than rare/curveball ones (low `weight`).
  const exact = data.filter((q) => q.industries.includes(industry));
  const general = data.filter((q) => !q.industries.includes(industry));
  const picked = weightedSample(exact, count);
  if (picked.length < count) {
    picked.push(...weightedSample(general, count - picked.length));
  }
  return picked;
}

function weightedSample(pool, count) {
  const remaining = [...pool];
  const picked = [];
  while (remaining.length > 0 && picked.length < count) {
    const totalWeight = remaining.reduce((sum, q) => sum + (q.weight || 10), 0);
    let r = Math.random() * totalWeight;
    let idx = 0;
    for (; idx < remaining.length; idx++) {
      r -= remaining[idx].weight || 10;
      if (r <= 0) break;
    }
    picked.push(remaining.splice(Math.min(idx, remaining.length - 1), 1)[0]);
  }
  return picked;
}

window.MockoQuestions = { fetchQuestions };
