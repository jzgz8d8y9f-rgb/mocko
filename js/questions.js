import { supabase } from './supabase-client.js';

async function fetchQuestions({ difficulty, industry, count, category = 'behavioral' }) {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('category', category)
    .eq('difficulty', difficulty)
    .eq('opener', false)
    .eq('closing_friendly', false)
    .overlaps('industries', [industry || 'general', 'general']);
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const exact = data.filter((q) => q.industries.includes(industry));
  const general = data.filter((q) => !q.industries.includes(industry));
  const picked = weightedSample(exact, count);
  if (picked.length < count) {
    picked.push(...weightedSample(general, count - picked.length));
  }
  return picked;
}

async function fetchOpeners(count = 1) {
  const { data, error } = await supabase.from('questions').select('*').eq('opener', true);
  if (error) throw error;
  return weightedSample(data || [], count);
}

async function fetchClosingQuestions({ difficulty, industry, count = 1 }) {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('closing_friendly', true)
    .eq('difficulty', difficulty)
    .overlaps('industries', [industry || 'general', 'general']);
  if (error) throw error;
  if (data && data.length > 0) return weightedSample(data, count);
  // Soft fallback: no closing-friendly row at this exact difficulty -- any difficulty is fine, still closing-friendly.
  const { data: anyDifficulty, error: err2 } = await supabase
    .from('questions')
    .select('*')
    .eq('closing_friendly', true)
    .overlaps('industries', [industry || 'general', 'general']);
  if (err2) throw err2;
  return weightedSample(anyDifficulty || [], count);
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

// Assembles a 5-question Full Interview set: opener, two guide questions,
// a fourth slot (resume-tailored when available, else another guide
// question), and a closing-biased question. `resumeQuestions` (from
// tailor-resume-questions) is optional and capped at 2, never two from
// the same anchor type -- when present it replaces the middle guide
// slots (Q3, Q4) rather than the opener/closing.
async function buildFullInterviewSet({ difficulty, category, industry, resumeQuestions = [] }) {
  const [opener] = await fetchOpeners(1);
  const closing = (await fetchClosingQuestions({ difficulty, industry, count: 1 }))[0];

  const seenAnchorTypes = new Set();
  const tailored = [];
  for (const q of resumeQuestions) {
    if (tailored.length >= 2) break;
    if (q.anchorType && seenAnchorTypes.has(q.anchorType)) continue;
    if (q.anchorType) seenAnchorTypes.add(q.anchorType);
    tailored.push({ text: q.text, category, difficulty, industries: [industry || 'general'], id: null, source: 'resume', anchorType: q.anchorType });
  }

  const guideNeeded = 3 - tailored.length; // fills the Q2/Q3/Q4 middle slots not covered by resume-tailored ones
  const guideQuestions = await fetchQuestions({ difficulty, industry, count: guideNeeded, category });

  const middle = [...guideQuestions.slice(0, Math.max(0, 3 - tailored.length)), ...tailored];
  // Keep resume-tailored slots toward the back (Q3/Q4 region) rather than immediately after the opener.
  middle.sort((a, b) => (a.source === 'resume' ? 1 : 0) - (b.source === 'resume' ? 1 : 0));

  const questions = [opener, ...middle, closing].filter(Boolean).map((q, i) => ({
    ...q,
    index: i,
    source: q.source || (q.opener ? 'opener' : q.closing_friendly ? 'closing' : 'guide'),
  }));
  return questions;
}

async function buildQuickRoundSet({ difficulty, category, industry }) {
  const guideQuestions = await fetchQuestions({ difficulty, industry, count: 3, category });
  return guideQuestions.map((q, i) => ({ ...q, index: i, source: 'guide' }));
}

window.MockoQuestions = { fetchQuestions, fetchOpeners, fetchClosingQuestions, buildFullInterviewSet, buildQuickRoundSet };
