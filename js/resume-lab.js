import { supabase } from './supabase-client.js';

async function gradeResume(resumeId) {
  const { data, error } = await supabase.functions.invoke('grade-resume', {
    body: { resumeId },
  });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data;
}

async function rewriteResume({ resumeId, jobTitle, company, jobDescription }) {
  const { data, error } = await supabase.functions.invoke('rewrite-resume', {
    body: { resumeId, jobTitle, company, jobDescription },
  });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data;
}

async function writeCoverLetter({ resumeId, jobTitle, company, jobDescription, additionalInfo, wordLength }) {
  const { data, error } = await supabase.functions.invoke('write-cover-letter', {
    body: { resumeId, jobTitle, company, jobDescription, additionalInfo, wordLength },
  });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data;
}

async function listResumeReviews() {
  const { data, error } = await supabase
    .from('resume_reviews')
    .select('*, resumes(label)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function listCoverLetters() {
  const { data, error } = await supabase
    .from('cover_letters')
    .select('*, resumes(label)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

window.MockoResumeLab = {
  gradeResume, rewriteResume, writeCoverLetter, listResumeReviews, listCoverLetters,
};
