import { supabase } from './supabase-client.js';

async function uploadAndGrade({ blob, question, track, format, length }) {
  const user = window.MockoAuth.getUser();
  if (!user) throw new Error('Not signed in');

  const contentType = blob.type || 'video/webm';
  const ext = contentType.includes('mp4') ? 'mp4' : 'webm';
  const path = `${user.id}/${Date.now()}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from('recordings')
    .upload(path, blob, { contentType });
  if (uploadErr) throw uploadErr;

  const { data, error } = await supabase.functions.invoke('grade-session', {
    body: { recordingPath: path, question, track, format, length },
  });
  if (error) throw error;
  return data;
}

window.MockoRecording = { uploadAndGrade };
