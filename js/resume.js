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
      let lastY = null;
      let line = '';
      for (const it of content.items) {
        const y = it.transform ? Math.round(it.transform[5]) : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
          text += line.trim() + '\n';
          line = '';
        }
        line += it.str + ' ';
        if (y !== null) lastY = y;
      }
      text += line.trim() + '\n\n';
    }
    return text.trim();
  } catch (err) {
    console.error('PDF text extraction failed:', err);
    return null;
  }
}

async function extractDocxText(file) {
  try {
    const JSZip = (await import('https://esm.sh/jszip@3.10.1')).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xml = await zip.file('word/document.xml').async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const lines = [];
    for (const p of doc.getElementsByTagName('w:p')) {
      let line = '';
      for (const el of p.getElementsByTagName('*')) {
        if (el.localName === 't') line += el.textContent;
        else if (el.localName === 'tab' || el.localName === 'br') line += ' ';
      }
      lines.push(line.trim());
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  } catch (err) {
    console.error('DOCX text extraction failed:', err);
    return null;
  }
}

function isDocx(fileOrPath) {
  const name = typeof fileOrPath === 'string' ? fileOrPath : fileOrPath.name;
  return /\.docx$/i.test(name || '');
}

async function uploadResume(file, label) {
  const user = window.MockoAuth.getUser();
  if (!user) throw new Error('Not signed in');

  const extractedText = isDocx(file) ? await extractDocxText(file) : await extractPdfText(file);
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

async function getResumeUrl(storagePath) {
  const { data, error } = await supabase.storage.from('resumes').createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

window.MockoResume = {
  uploadResume, listResumes, getPrimaryResume, setPrimaryResume, deleteResume,
  extractPdfText, extractDocxText, isDocx, getResumeUrl,
};
