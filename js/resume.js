import { supabase } from './supabase-client.js';

async function extractPdfText(file) {
  if (file.type !== 'application/pdf') return null;
  try {
    const pdfjsLib = await import('https://esm.sh/pdfjs-dist@4.0.379/build/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.mjs';
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(' ') + '\n';
    }
    return text.trim();
  } catch (err) {
    console.error('PDF text extraction failed:', err);
    return null;
  }
}

async function uploadResume(file, label) {
  const user = window.MockoAuth.getUser();
  if (!user) throw new Error('Not signed in');

  const extractedText = await extractPdfText(file);
  const path = `${user.id}/${Date.now()}-${file.name}`;
  const { error: uploadErr } = await supabase.storage.from('resumes').upload(path, file);
  if (uploadErr) throw uploadErr;

  const existing = await listResumes();
  const { data, error } = await supabase
    .from('resumes')
    .insert({
      user_id: user.id,
      label: label || file.name,
      storage_path: path,
      is_primary: existing.length === 0,
      extracted_text: extractedText,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listResumes() {
  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getPrimaryResume() {
  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('is_primary', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function setPrimaryResume(id) {
  const user = window.MockoAuth.getUser();
  await supabase.from('resumes').update({ is_primary: false }).eq('user_id', user.id);
  const { error } = await supabase.from('resumes').update({ is_primary: true }).eq('id', id);
  if (error) throw error;
}

async function deleteResume(id, storagePath) {
  await supabase.storage.from('resumes').remove([storagePath]);
  const { error } = await supabase.from('resumes').delete().eq('id', id);
  if (error) throw error;
}

window.MockoResume = { uploadResume, listResumes, getPrimaryResume, setPrimaryResume, deleteResume };
