import { supabase } from './supabase-client.js';

async function insertSession({ difficulty, format, length, firstQuestionText }) {
  const user = window.MockoAuth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      mode: 'voice',
      difficulty,
      track: 'Finance',
      format,
      length,
      question_text: firstQuestionText,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateSession(sessionId, { overallScore, categoryScores, pointersGood, pointersWork, transcript, candidateQuestions }) {
  const fields = {
    overall_score: overallScore,
    category_scores: categoryScores,
    pointers_good: pointersGood,
    pointers_work: pointersWork,
    transcript,
    saved_state: null,
  };
  // Only sent when the ask-the-interviewer setting produced a result, so
  // sessions without it never touch the column.
  if (candidateQuestions) fields.candidate_questions = candidateQuestions;
  const { data, error } = await supabase
    .from('sessions')
    .update(fields)
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function saveSessionState(sessionId, savedState) {
  const { error } = await supabase.from('sessions').update({ saved_state: savedState }).eq('id', sessionId);
  if (error) throw error;
}

async function discardSavedState(sessionId) {
  const { error } = await supabase.from('sessions').update({ saved_state: null }).eq('id', sessionId);
  if (error) throw error;
}

async function fetchResumableSession() {
  const user = window.MockoAuth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', user.id)
    .eq('mode', 'voice')
    .is('overall_score', null)
    .not('saved_state', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function gradeAnswer({
  sessionId, questionIndex, questionId, questionText, questionType, difficulty, source,
  transcript, durationSec, note, followUpAsked, followUpTranscript,
}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  const res = await fetch('https://exiiyhlyhtoxmpjecper.supabase.co/functions/v1/grade-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      mode: 'voice',
      sessionId,
      questionIndex,
      questionId,
      question: questionText,
      questionType,
      difficulty,
      source,
      transcript,
      durationSec,
      note,
      followUpAsked,
      followUpTranscript,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Grading failed.');
  return body;
}

async function updateSessionQuestion(id, fields) {
  const { data, error } = await supabase
    .from('session_questions')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteSessionQuestion(id) {
  const { error } = await supabase.from('session_questions').delete().eq('id', id);
  if (error) throw error;
}

async function fetchSessionQuestions(sessionId) {
  const { data, error } = await supabase
    .from('session_questions')
    .select('*')
    .eq('session_id', sessionId)
    .order('question_index', { ascending: true });
  if (error) throw error;
  return data;
}

async function analyzeAnswer({ questionText, questionType, difficulty, transcript, priorSummaries, nextQuestionText }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  const res = await fetch('https://exiiyhlyhtoxmpjecper.supabase.co/functions/v1/analyze-answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ questionText, questionType, difficulty, transcript, priorSummaries, nextQuestionText }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Answer analysis failed.');
  return body;
}

async function tailorResumeQuestions({ resumeText, difficulty, industry }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  const res = await fetch('https://exiiyhlyhtoxmpjecper.supabase.co/functions/v1/tailor-resume-questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ resumeText, difficulty, industry }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Resume tailoring failed.');
  return body;
}

const FUNCTIONS_URL = 'https://exiiyhlyhtoxmpjecper.supabase.co/functions/v1';

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token;
}

// Neural text-to-speech for the AI interviewer. Resolves to an audio Blob.
async function synthesizeSpeech(text) {
  const res = await fetch(`${FUNCTIONS_URL}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await accessToken()}` },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    let msg = 'Voice unavailable.';
    try { msg = (await res.json()).error || msg; } catch (e) {}
    throw new Error(msg);
  }
  return res.blob();
}

async function callCandidateQuestions(payload) {
  const res = await fetch(`${FUNCTIONS_URL}/candidate-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await accessToken()}` },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Could not process your question.');
  return body;
}

function candidateReply({ question, industry, format, interviewQuestions }) {
  return callCandidateQuestions({ mode: 'reply', question, industry, format, interviewQuestions });
}

function gradeCandidateQuestions({ questions, industry, format, interviewQuestions }) {
  return callCandidateQuestions({ mode: 'grade', questions, industry, format, interviewQuestions });
}

window.MockoVoiceSession = {
  synthesizeSpeech, candidateReply, gradeCandidateQuestions,
  insertSession, updateSession, gradeAnswer, updateSessionQuestion, deleteSessionQuestion,
  fetchSessionQuestions, analyzeAnswer, tailorResumeQuestions,
  saveSessionState, discardSavedState, fetchResumableSession,
};
