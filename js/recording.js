import { supabase } from './supabase-client.js';

async function uploadAndGrade({ blob, question, track, format, length }) {
  const user = window.MockoAuth.getUser();
  if (!user) throw new Error('Not signed in');

  const path = `${user.id}/${Date.now()}.webm`;
  const { error: uploadErr } = await supabase.storage
    .from('recordings')
    .upload(path, blob, { contentType: 'video/webm' });
  if (uploadErr) throw uploadErr;

  const { data, error } = await supabase.functions.invoke('grade-session', {
    body: { recordingPath: path, question, track, format, length },
  });
  if (error) throw error;
  return data;
}

window.MockoRecording = { uploadAndGrade };
