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

// --- Show the user's own resume (original layout) with numbered problem marks ---

function flagRegex(quote, loose) {
  const words = String(quote || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(loose ? '\\s*' : '\\s+'), 'i');
}

function makeFlagBadge(n) {
  const b = document.createElement('span');
  b.className = 'rl-flag rl-flag-pin';
  b.dataset.flag = String(n);
  b.tabIndex = 0;
  b.textContent = String(n);
  return b;
}

// Marks flagged phrases inside already-rendered text (a Word preview).
// Returns how many flags were placed.
function markRenderedText(root, flags) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let full = '';
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.nodeValue) continue;
    nodes.push({ n, start: full.length, end: full.length + n.nodeValue.length });
    full += n.nodeValue;
  }
  const found = [];
  (flags || []).forEach((f, i) => {
    const re = flagRegex(f.quote, true);
    const m = re && re.exec(full);
    if (!m) return;
    const start = m.index, end = m.index + m[0].length;
    if (found.some((x) => start < x.end && end > x.start)) return;
    found.push({ start, end, n: i + 1 });
  });
  found.sort((a, b) => b.start - a.start);
  for (const x of found) {
    const segs = nodes.filter((g) => g.end > x.start && g.start < x.end);
    let lastMark = null;
    for (const g of segs) {
      const a = Math.max(x.start, g.start) - g.start;
      const b = Math.min(x.end, g.end) - g.start;
      if (b <= a || !g.n.parentNode) continue;
      const r = document.createRange();
      r.setStart(g.n, a);
      r.setEnd(g.n, b);
      const mark = document.createElement('mark');
      mark.className = 'rl-mark';
      r.surroundContents(mark);
      lastMark = mark;
    }
    if (lastMark) lastMark.after(makeFlagBadge(x.n));
  }
  return found.length;
}

// Draws the PDF pages as images and puts marks over the flagged phrases.
async function renderPdfWithMarks(blob, container, flags) {
  const pdfjsLib = await import('https://esm.sh/pdfjs-dist@4.0.379/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.mjs';
  const pdf = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
  container.innerHTML = '';
  const width = Math.max(container.clientWidth, 300);
  const dpr = window.devicePixelRatio || 1;
  const placed = new Set();

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const scale = width / base.width;
    const viewport = page.getViewport({ scale });

    const wrap = document.createElement('div');
    wrap.className = 'rl-pdf-page';
    wrap.style.width = viewport.width + 'px';
    wrap.style.height = viewport.height + 'px';
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    wrap.appendChild(canvas);
    container.appendChild(wrap);
    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
    }).promise;

    // Position of each piece of text, in page pixels (top-left origin).
    const content = await page.getTextContent();
    const items = content.items.filter((it) => it.str && it.str.trim()).map((it) => {
      const t = pdfjsLib.Util.transform(viewport.transform, it.transform);
      const h = Math.hypot(t[2], t[3]);
      return { str: it.str, x: t[4], y: t[5] - h, w: it.width * scale, h };
    });
    let full = '';
    items.forEach((it) => { it.start = full.length; full += it.str; it.end = full.length; full += ' '; });

    const taken = [];
    (flags || []).forEach((f, i) => {
      if (placed.has(i)) return;
      const re = flagRegex(f.quote, true);
      const m = re && re.exec(full);
      if (!m) return;
      const start = m.index, end = m.index + m[0].length;
      if (taken.some((x) => start < x.end && end > x.start)) return;
      taken.push({ start, end });
      placed.add(i);
      // One highlight per line, covering all the text pieces of the phrase on that line.
      const lines = [];
      for (const it of items) {
        if (it.end <= start || it.start >= end) continue;
        const len = it.end - it.start || 1;
        const a = Math.max(start, it.start) - it.start;
        const b = Math.min(end, it.end) - it.start;
        const x1 = it.x + (it.w * a) / len;
        const x2 = it.x + (it.w * b) / len;
        const line = lines.find((l) => Math.abs(l.y - it.y) < it.h * 0.5);
        if (line) { line.x1 = Math.min(line.x1, x1); line.x2 = Math.max(line.x2, x2); }
        else lines.push({ x1, x2, y: it.y, h: it.h });
      }
      let lastRect = null;
      for (const l of lines) {
        const rect = document.createElement('div');
        rect.className = 'rl-pdf-mark';
        rect.style.left = l.x1 + 'px';
        rect.style.top = l.y + 'px';
        rect.style.width = (l.x2 - l.x1) + 'px';
        rect.style.height = l.h + 'px';
        wrap.appendChild(rect);
        lastRect = rect;
      }
      if (lastRect) {
        const badge = makeFlagBadge(i + 1);
        badge.classList.add('rl-flag-abs');
        lastRect.appendChild(badge);
      }
    });
  }
  return placed.size;
}

// One shared hover/tap tip: shows the comment for a numbered mark.
function attachFlagTips(container, flags) {
  let tip = document.getElementById('rl-flag-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'rl-flag-tip';
    document.body.appendChild(tip);
  }
  const show = (el) => {
    const f = (flags || [])[Number(el.dataset.flag) - 1];
    if (!f) return;
    tip.textContent = '';
    const q = document.createElement('div');
    q.className = 'rl-tip-quote';
    q.textContent = '"' + f.quote + '"';
    const c = document.createElement('div');
    c.textContent = f.comment;
    tip.append(q, c);
    tip.style.display = 'block';
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    let top = r.top - th - 8;
    if (top < 8) top = r.bottom + 8;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  };
  const hide = () => { tip.style.display = 'none'; };
  container.addEventListener('mouseover', (e) => { const el = e.target.closest('.rl-flag-pin'); if (el) show(el); });
  container.addEventListener('mouseout', (e) => { if (e.target.closest('.rl-flag-pin')) hide(); });
  container.addEventListener('focusin', (e) => { const el = e.target.closest('.rl-flag-pin'); if (el) show(el); });
  container.addEventListener('focusout', hide);
  container.addEventListener('click', (e) => { const el = e.target.closest('.rl-flag-pin'); if (el) show(el); else hide(); });
  window.addEventListener('scroll', hide, { passive: true });
}

// Shows the resume file the way it looks, with numbered marks. Returns
// the number of marks placed. Throws if the file cannot be drawn.
async function renderResumeWithMarks(blob, isDocxFile, container, flags) {
  attachFlagTips(container, flags);
  if (isDocxFile) {
    await renderDocxPreview(blob, container);
    return markRenderedText(container, flags);
  }
  return renderPdfWithMarks(blob, container, flags);
}

window.MockoResumeLab = {
  renderResumeWithMarks,
  applyDocxEdits, downloadResumeFile, renderDocxPreview,
  gradeResume, rewriteResume, writeCoverLetter, listResumeReviews, listCoverLetters,
};
