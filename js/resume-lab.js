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

// --- Word (.docx) editing: replace text in place so formatting is kept ---

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

function setRunText(wt, text) {
  wt.textContent = text;
  wt.setAttributeNS(XML_NS, 'xml:space', 'preserve');
}

function makeRunLike(doc, run, text, opts) {
  const copy = run.cloneNode(true);
  for (const child of Array.from(copy.childNodes)) {
    if (child.localName !== 'rPr') copy.removeChild(child);
  }
  const wt = doc.createElementNS(W_NS, 'w:t');
  setRunText(wt, text);
  copy.appendChild(wt);
  if (opts && opts.highlight) {
    let rPr = Array.from(copy.childNodes).find((c) => c.localName === 'rPr');
    if (!rPr) {
      rPr = doc.createElementNS(W_NS, 'w:rPr');
      copy.insertBefore(rPr, copy.firstChild);
    }
    const hl = doc.createElementNS(W_NS, 'w:highlight');
    hl.setAttributeNS(W_NS, 'w:val', 'yellow');
    rPr.appendChild(hl);
    if (opts.superscript) {
      const va = doc.createElementNS(W_NS, 'w:vertAlign');
      va.setAttributeNS(W_NS, 'w:val', 'superscript');
      rPr.appendChild(va);
    }
  }
  return copy;
}

// Finds `edit.original` inside one paragraph and swaps in `edit.tailored`.
// Only the changed words are touched, so fonts, spacing and bullets stay.
function applyOneEdit(doc, edit, number, preview) {
  const words = String(edit.original || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'i');

  for (const p of Array.from(doc.getElementsByTagNameNS(W_NS, 'p'))) {
    const segs = [];
    let text = '';
    for (const el of Array.from(p.getElementsByTagName('*'))) {
      if (el.localName === 't') {
        segs.push({ wt: el, start: text.length, end: text.length + el.textContent.length });
        text += el.textContent;
      } else if (el.localName === 'tab' || el.localName === 'br') {
        text += ' ';
      }
    }
    const m = re.exec(text);
    if (!m) continue;
    const s = m.index, e = m.index + m[0].length;
    const hit = segs.filter((g) => g.end > g.start && g.end > s && g.start < e);
    if (!hit.length) continue;

    const first = hit[0], last = hit[hit.length - 1];
    const firstRun = first.wt.parentNode;
    const firstText = first.wt.textContent;
    const before = firstText.slice(0, Math.max(0, s - first.start));
    const hl = preview ? { highlight: true } : null;
    const newRun = makeRunLike(doc, firstRun, edit.tailored, hl);
    const badge = preview ? makeRunLike(doc, firstRun, String(number), { highlight: true, superscript: true }) : null;

    if (hit.length === 1) {
      const after = firstText.slice(e - first.start);
      setRunText(first.wt, before);
      let anchor = firstRun;
      firstRun.parentNode.insertBefore(newRun, anchor.nextSibling);
      anchor = newRun;
      if (badge) { anchor.parentNode.insertBefore(badge, anchor.nextSibling); anchor = badge; }
      if (after) anchor.parentNode.insertBefore(makeRunLike(doc, firstRun, after), anchor.nextSibling);
    } else {
      setRunText(first.wt, before);
      for (const g of hit.slice(1, -1)) setRunText(g.wt, '');
      setRunText(last.wt, last.wt.textContent.slice(e - last.start));
      firstRun.parentNode.insertBefore(newRun, firstRun.nextSibling);
      if (badge) newRun.parentNode.insertBefore(badge, newRun.nextSibling);
    }
    return true;
  }
  return false;
}

async function loadZip(blob) {
  const JSZip = (await import('https://esm.sh/jszip@3.10.1')).default;
  return JSZip.loadAsync(blob);
}

// Returns { blob, applied: [bool per edit] }. preview=true highlights the
// changed text and adds a number after it; preview=false is the clean file.
async function applyDocxEdits(docxBlob, edits, preview) {
  const zip = await loadZip(docxBlob);
  const xml = await zip.file('word/document.xml').async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const applied = edits.map((edit, i) => applyOneEdit(doc, edit, i + 1, preview));
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  return { blob, applied };
}

async function downloadResumeFile(storagePath) {
  const { data, error } = await supabase.storage.from('resumes').download(storagePath);
  if (error) throw error;
  return data;
}

async function renderDocxPreview(blob, container) {
  const docxPreview = await import('https://esm.sh/docx-preview@0.3.3');
  container.innerHTML = '';
  await docxPreview.renderAsync(blob, container, null, { inWrapper: true, ignoreLastRenderedPageBreak: true });
}

window.MockoResumeLab = {
  applyDocxEdits, downloadResumeFile, renderDocxPreview,
  gradeResume, rewriteResume, writeCoverLetter, listResumeReviews, listCoverLetters,
};
