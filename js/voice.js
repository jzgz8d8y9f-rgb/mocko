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

async function updateSession(sessionId, { overallScore, categoryScores, pointersGood, pointersWork, transcript }) {
  const { data, error } = await supabase
    .from('sessions')
    .update({
      overall_score: overallScore,
      category_scores: categoryScores,
      pointers_good: pointersGood,
      pointers_work: pointersWork,
      transcript,
    })
    .eq('id', sessionId)
    .select()
    .single();
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

window.MockoVoiceSession = {
  insertSession, updateSession, gradeAnswer, updateSessionQuestion,
  fetchSessionQuestions, analyzeAnswer, tailorResumeQuestions,
};
