import { supabase } from './supabase-client.js';

// A session set to one difficulty still mostly draws from that tier, but
// leans on neighboring tiers too so a session doesn't feel monotone --
// real interviews don't ask questions of uniform difficulty back-to-back.
const DIFFICULTY_MIX = {
  easy: { easy: 0.75, medium: 0.20, hard: 0.05 },
  medium: { easy: 0.15, medium: 0.70, hard: 0.15 },
  hard: { easy: 0.05, medium: 0.20, hard: 0.75 },
};

function pickWeightedTier(targetDifficulty) {
  const mix = DIFFICULTY_MIX[targetDifficulty] || DIFFICULTY_MIX.medium;
  let r = Math.random();
  for (const tier of ['easy', 'medium', 'hard']) {
    r -= mix[tier];
    if (r <= 0) return tier;
  }
  return targetDifficulty;
}

// Picks `count` questions from `pool`, rolling a difficulty tier per slot
// against DIFFICULTY_MIX (falling back to neighboring tiers, then anything
// left, if the rolled tier is thin), preferring exact-industry matches
// within whichever tier gets picked, and never repeating a question.
function pickWeightedByDifficulty(pool, count, difficulty, industry) {
  const usedIds = new Set();
  const picked = [];
  for (let i = 0; i < count; i++) {
    const available = pool.filter((q) => !usedIds.has(q.id));
    if (!available.length) break;
    const targetTier = pickWeightedTier(difficulty);
    const tierOrder = [targetTier, ...['easy', 'medium', 'hard'].filter((t) => t !== targetTier)];
    let tierPool = [];
    for (const tier of tierOrder) {
      tierPool = available.filter((q) => q.difficulty === tier);
      if (tierPool.length) break;
    }
    const exact = tierPool.filter((q) => q.industries.includes(industry));
    const general = tierPool.filter((q) => !q.industries.includes(industry));
    const [chosen] = weightedSample(exact.length ? exact : general, 1);
    if (!chosen) break;
    usedIds.add(chosen.id);
    picked.push(chosen);
  }
  return picked;
}

async function fetchQuestions({ difficulty, industry, count, category = 'behavioral' }) {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('category', category)
    .eq('opener', false)
    .eq('closing_friendly', false)
    .overlaps('industries', [industry || 'general', 'general']);
  if (error) throw error;
  if (!data || data.length === 0) return [];
  return pickWeightedByDifficulty(data, count, difficulty, industry);
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
    .overlaps('industries', [industry || 'general', 'general']);
  if (error) throw error;
  if (!data || !data.length) return [];
  return pickWeightedByDifficulty(data, count, difficulty, industry);
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
