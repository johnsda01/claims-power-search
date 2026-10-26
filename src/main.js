// Claims Power Search — browser app. Replaces the Python server: documents are
// picked with the File System Access API, extracted in the browser with PDF.js
// and mammoth, and stored in IndexedDB. Settings live in localStorage.

import { TOPIC_CATALOG, COMMON, WATER, ROOF, STRUCTURE } from './lib/topics.js';
import { esc, highlight, excerpt, focusedExcerpt, copyText, normalized } from './lib/text.js';
import { locate } from './lib/highlights.js';
import { extract, sha256, renderPageImage, pageWords, isSupported, getDocument } from './lib/extract.js';
import {
  loadSettings,
  saveSettings,
  loadIndex,
  saveIndex,
  storePdfBytes,
  getPdfBytes,
  deletePdfBytes,
  buildFileId,
} from './lib/library.js';
import { searchDocuments } from './lib/search.js';

const VERSION = '0.2.0-beta.1';

const $ = (id) => document.getElementById(id);
const state = {
  folderName: '',
  folderHandle: null,
  files: [], // [{ id, name, file, size }]
  selected: new Set(),
  topics: new Set(),
  results: [],
  documents: {}, // id -> { name, pdf, sha256, size, mtime, pages, warnings }
  busy: false,
  cancel: false,
  current: null,
  previewMode: 'excerpt',
  focusedChoice: null,
  originalPreviewPage: null,
  highlightRequest: 0,
};

function notice(message = '') {
  $('notice').hidden = !message;
  $('notice').textContent = message;
}

function resetResults() {
  state.results = [];
  $('resultsTitle').textContent = 'Your results will appear here';
  $('resultMeta').textContent = '';
  $('searchWarning').textContent = '';
  $('results').innerHTML =
    '<div class="empty"><div class="empty-icon">⌕</div><h3>Search your selected documents</h3><p>Type a phrase or check a topic in step 04 to find source language.</p></div>';
}

function updateSelection() {
  const n = state.files.filter((f) => state.selected.has(f.id)).length;
  $('selectedCount').textContent = `${n} selected`;
  $('selectAll').checked = n > 0 && n === state.files.length;
  $('selectAll').indeterminate = n > 0 && n < state.files.length;
  $('process').disabled = state.busy || !n;
  $('rescan').disabled = state.busy || !n;
  $('search').disabled = state.busy || !n;
}

function setBusy(value) {
  state.busy = value;
  for (const id of ['loadFolder', 'browse', 'folder', 'ocr', 'selectAll', 'process', 'rescan']) $(id).disabled = value;
  document.querySelectorAll('.file-row input').forEach((el) => (el.disabled = value));
  $('stop').hidden = !value;
  $('progress').hidden = !value;
  updateSelection();
}

function renderFiles() {
  $('folder').value = state.folderName;
  $('fileCount').textContent = `${state.files.length} supported file${state.files.length === 1 ? '' : 's'}`;
  $('fileTotal').textContent = `${state.files.length} file${state.files.length === 1 ? '' : 's'} in folder`;
  const writeSupported = !!state.folderHandle && typeof state.folderHandle.removeEntry !== 'undefined';
  $('output').textContent = writeSupported
    ? `Converted text saved in the same folder as the originals, labeled .searchable.txt — for "${state.folderName}".`
    : state.folderName
      ? `This browser cannot write back to the source folder. Text copies are kept in this browser for "${state.folderName}".`
      : 'Pick a folder to see where text copies are saved.';
  $('fileList').replaceChildren();
  for (const f of state.files) {
    const doc = state.documents[f.id];
    const ready = !!doc && doc.size === f.size;
    let status = 'Not processed';
    if (ready) {
      if (doc.pages.some((p) => p.method === 'Needs OCR')) status = 'Some pages need OCR';
      else if (doc.pages.some((p) => p.method === 'Browser OCR')) status = 'OCR used';
      else status = 'Ready';
    }
    const row = document.createElement('label');
    row.className = 'file-row';
    row.innerHTML = `<input type="checkbox" ${state.selected.has(f.id) ? 'checked' : ''} aria-label="Select ${esc(f.name)}"><span class="file-type">${esc(f.name.split('.').pop().toUpperCase())}</span><span class="file-info"><div class="file-name" title="${esc(f.name)}">${esc(f.name)}</div><div class="file-detail">${f.size < 1048576 ? Math.ceil(f.size / 1024) + ' KB' : (f.size / 1048576).toFixed(1) + ' MB'}${doc && ready ? ' · ' + doc.pages.length + (f.name.toLowerCase().endsWith('.pdf') ? ' pages' : ' text section') : ''}</div></span><span title="${status === 'OCR used' ? 'Scanned pages were converted to searchable text. This is not an error or a required review step.' : esc(status)}" class="badge ${status === 'Ready' ? 'ready' : status === 'OCR used' ? 'ocr' : status === 'Some pages need OCR' ? 'review' : ''}">${esc(status)}</span>`;
    row.querySelector('input').addEventListener('change', (e) => {
      e.target.checked ? state.selected.add(f.id) : state.selected.delete(f.id);
      updateSelection();
      resetResults();
    });
    $('fileList').append(row);
  }
  if (!state.files.length)
    $('fileList').innerHTML = '<div class="empty">No PDF, Word (.docx), or text files in this folder.</div>';
  updateSelection();
}

function renderTopics() {
  for (const [target, ids] of [
    ['commonTopics', COMMON],
    ['waterTopics', WATER],
    ['roofTopics', ROOF],
    ['structureTopics', STRUCTURE],
  ]) {
    $(target).replaceChildren();
    for (const id of ids) {
      const item = TOPIC_CATALOG.find((t) => t.id === id);
      const label = document.createElement('label');
      label.className = 'topic';
      label.title = 'Looks for: ' + item.terms.join(', ');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = state.topics.has(id);
      input.addEventListener('change', () => {
        input.checked ? state.topics.add(id) : state.topics.delete(id);
        renderTopics();
      });
      label.append(input, document.createTextNode(item.label));
      $(target).append(label);
    }
  }
}

// ---- Folder picking (File System Access API, with webkit fallback) ----

async function pickFolder() {
  if (window.showDirectoryPicker) {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      return handle;
    } catch (e) {
      if (e.name === 'AbortError') return null;
      // Fall through to input fallback.
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.addEventListener('change', () => {
      resolve({ input, files: input.files });
    });
    input.click();
  });
}

// Write a .searchable.txt copy of a processed file back to the source folder,
// next to the original. Returns a short status string or null if it couldn't.
async function writeSearchableCopy(fileName, pages) {
  if (!state.folderHandle) return null;
  const base = fileName.replace(/\.[^.]+$/, '');
  const outName = `${base}.searchable.txt`;
  const text = pages
    .map((p) => {
      const head = p.page > 1 || fileName.toLowerCase().endsWith('.pdf')
        ? `--- ${fileName} · page ${p.page} (${p.method}) ---\n`
        : `--- ${fileName} (${p.method}) ---\n`;
      return head + (p.text || '') + '\n';
    })
    .join('\n');
  try {
    const writable = await state.folderHandle.getFileHandle(outName, { create: true });
    const sync = await writable.createWritable();
    await sync.write(text);
    await sync.close();
    return outName;
  } catch (e) {
    return null;
  }
}

async function readFolder(handle) {
  const files = [];
  if (handle && handle.input) {
    // webkitdirectory fallback: FileList with relative paths.
    state.folderHandle = null;
    for (const file of handle.files) {
      if (!isSupported(file.name)) continue;
      const rel = file.webkitRelativePath || file.name;
      const top = rel.split('/').slice(0, -1).join('/');
      state.folderName = top || handle.files[0]?.webkitRelativePath?.split('/').slice(0, -1).join('/') || 'Selected folder';
      const id = await buildFileId(state.folderName, file.name);
      files.push({ id, name: file.name, file, size: file.size });
    }
  } else if (handle) {
    state.folderHandle = handle;
    state.folderName = handle.name;
    for await (const entry of handle.values()) {
      if (entry.kind !== 'file') continue;
      if (!isSupported(entry.name)) continue;
      const file = await entry.getFile();
      const id = await buildFileId(state.folderName, entry.name);
      files.push({ id, name: entry.name, file, size: file.size });
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  state.files = files;
  state.selected = new Set(files.map((f) => f.id));
  state.documents = await loadIndex(state.folderName);
  renderFiles();
  resetResults();
  $('status').textContent = 'Folder loaded. Select files in step 02, then Process in step 03.';
  $('issues').textContent = '';
}

// ---- Processing ----

async function processSelected(force = false) {
  notice();
  const ids = [...state.selected];
  if (!ids.length) return;
  state.cancel = false;
  setBusy(true);
  const useOcr = $('ocr').checked;
  const total = ids.length;
  $('progress').max = Math.max(total, 1);
  $('progress').value = 0;
  const errors = [];
  const warnings = [];
  const documents = { ...state.documents };
  for (let i = 0; i < ids.length; i++) {
    if (state.cancel) break;
    const file = state.files.find((f) => f.id === ids[i]);
    $('status').textContent = `${file.name} · Starting…`;
    try {
      const signature = await sha256(file.file);
      const old = documents[file.id];
      const reuse =
        old &&
        old.sha256 === signature &&
        old.size === file.size &&
        !force && (!useOcr || !old.pages.some((p) => p.method === 'Needs OCR'));
      let pages;
      if (reuse) {
        pages = old.pages;
        if (old.pdf) {
          try {
            await storePdfBytes(file.id, file.file);
          } catch {}
        }
        $('status').textContent = `${file.name} · Text copy is current.`;
      } else {
        const extracted = await extract(file.file, (msg) => ($('status').textContent = `${file.name} · ${msg}`), useOcr);
        pages = extracted.pages;
        if ((await sha256(file.file)) !== signature) throw new Error('File changed while processing. Process it again.');
        if (!pages.some((p) => p.text.trim())) throw new Error('No readable text found. Enable OCR for scanned PDFs.');
        for (const p of pages) {
          if (p.method === 'Browser OCR')
            warnings.push(`${file.name}: Page ${p.page}: OCR text; verify against the original.`);
          else if (p.method === 'Needs OCR')
            warnings.push(`${file.name}: Page ${p.page}: Little or no readable text; enable OCR.`);
        }
        documents[file.id] = {
          name: file.name,
          pdf: file.name.toLowerCase().endsWith('.pdf'),
          sha256: signature,
          size: file.size,
          pages,
          warnings: [],
        };
        if (documents[file.id].pdf) {
          try {
            await storePdfBytes(file.id, file.file);
          } catch {
            // PDF previews unavailable for this file; non-fatal.
          }
        }
      }
      const copyName = await writeSearchableCopy(file.name, pages);
      if (copyName) {
        $('status').textContent = `${file.name} · Text copy saved as ${copyName}`;
      } else if (state.folderHandle) {
        $('status').textContent = `${file.name} · Could not write .searchable.txt to folder (saved in browser only).`;
      }
      const doc = documents[file.id];
      const missingText = doc.pages.some((p) => p.method === 'Needs OCR');
      if (missingText)
        warnings.push(`${file.name}: Some pages have little or no text. Enable OCR and process again.`);
      else if (doc.pages.some((p) => p.method === 'Browser OCR'))
        warnings.push(`${file.name}: OCR used. Check wording you copy against the original.`);
    } catch (e) {
      errors.push(`${file.name}: ${e.message}`);
      delete documents[file.id];
      try {
        await deletePdfBytes(file.id);
      } catch {}
    }
    $('progress').value = i + 1;
    state.documents = documents;
    await saveIndex(state.folderName, documents);
  }
  state.documents = documents;
  await saveIndex(state.folderName, documents);
  setBusy(false);
  $('status').textContent = state.cancel
    ? 'Stopped after the current file.'
    : `Processing complete. ${total} file(s) converted. Ready to search in step 04.`;
  const issues = [...errors, ...warnings];
  $('issues').innerHTML = issues.length
    ? `<details ${errors.length ? 'open' : ''}><summary>${errors.length} error(s) · ${warnings.length} processing note(s)</summary>${issues.map((e) => '<p>' + esc(e) + '</p>').join('')}</details>`
    : '';
  renderFiles();
}

// ---- Search ----

function runSearch() {
  const ids = [...state.selected];
  if (!ids.length) {
    $('resultsTitle').textContent = 'Select a policy file first';
    $('resultMeta').textContent = '0 selected files';
    $('searchWarning').textContent = 'Select at least one policy file in step 02, then process it in step 03 before searching.';
    $('results').innerHTML = '<div class="empty"><h3>No policy files selected</h3><p>Choose a file in step 02, process it in step 03, then search its policy language here.</p></div>';
    $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const query = $('query').value;
  const topicIds = [...state.topics];
  const mode = $('mode').value;
  let data;
  try {
    data = searchDocuments(state.documents, ids, query, topicIds, mode);
  } catch (e) {
    notice(e.message);
    return;
  }
  renderResults(data);
  $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderResults(data) {
  state.results = data.results;
  for (const r of state.results) r.contextPages = data.context[r.id] || [];
  $('resultsTitle').textContent = data.total ? `${data.total} matching page${data.total === 1 ? '' : 's'}` : 'No matching language found';
  $('resultMeta').textContent = `${state.selected.size} selected file(s)${data.total > 300 ? ' · Showing first 300' : ''}`;
  $('searchWarning').textContent = data.skipped.length
    ? 'These selected files need processing before they can be searched: ' + data.skipped.map((id) => state.documents[id]?.name || id).join('; ')
    : '';
  $('results').replaceChildren();
  for (const r of state.results) {
    const focus = focusedExcerpt(r);
    const card = document.createElement('article');
    card.className = 'result';
    card.innerHTML = `<div class="result-top"><div><h3>${esc(r.source)}</h3><div class="result-meta">${r.pdf ? 'PDF page ' + r.page : 'Document text (no page mapping)'} · ${esc(r.method)}</div></div><button class="primary view-result">Compare & copy</button></div><div class="excerpt-label">Focused excerpt · … marks omitted wording</div><blockquote class="focused-quote">${highlight(focus.text, r.terms)}</blockquote><div class="result-bottom"><div class="tags">${esc(r.topics.join(' · '))}</div><div class="snippet-actions"><button class="primary copy-snippet">Copy excerpt</button><span class="open-note">Open original from the Compare view</span></div></div>`;
    card.querySelector('.view-result').addEventListener('click', () => openResult(r));
    card.querySelector('.copy-snippet').addEventListener('click', (event) => copySnippet(r, focus.text, event.currentTarget));
    $('results').append(card);
  }
  if (!state.results.length)
    $('results').innerHTML =
      '<div class="empty"><h3>Try another term or a broader topic</h3><p>Check that the selected files are processed. Unchecked topics do not restrict the search.<br>Some provisions use terms such as “power failure” instead of “food loss.”</p></div>';
}

// ---- Compare & copy dialog ----

async function copySnippet(result, text, button) {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(copyText(result, text));
    button.textContent = 'Copied';
    setTimeout(() => (button.textContent = label), 1500);
  } catch {
    notice('Copy unavailable. Open Compare & copy, then select and copy the excerpt text.');
  }
}

async function getPreviewPdfBytes(id) {
  const stored = await getPdfBytes(id);
  if (stored) return stored;
  const file = state.files.find((item) => item.id === id)?.file;
  return file ? file.arrayBuffer() : null;
}

async function openResult(result) {
  state.current = result;
  state.previewMode = 'excerpt';
  state.focusedChoice = null;
  state.originalPreviewPage = result.page;
  $('previewTitle').textContent = result.source;
  $('previewMeta').textContent = (result.pdf ? 'PDF page ' + result.page : 'Document text; original page numbers unavailable') + ' · ' + result.method;
  $('originalPage').hidden = !result.pdf;
  $('textLink').hidden = true;
  $('originalLink').hidden = true;
  await renderComparison();
  $('preview').showModal();
}

async function renderComparison() {
  const current = state.current;
  const focus = focusedExcerpt(current, state.focusedChoice);
  const full = state.previewMode === 'full';
  state.focusedChoice = focus.selected;
  $('pageText').innerHTML = highlight(full ? current.text : focus.text, current.terms);
  $('excerptTab').setAttribute('aria-pressed', String(!full));
  $('fullTextTab').setAttribute('aria-pressed', String(full));
  $('excerptNote').textContent = full
    ? 'Complete extracted page text. Compare exact wording with the original.'
    : 'Selected source lines. … marks omitted wording; other limits and exceptions may appear elsewhere on the page.';
  $('clausePicker').replaceChildren();
  for (const node of focus.options) {
    const option = document.createElement('option');
    option.value = String(node.start);
    option.textContent = node.label.slice(0, 110);
    option.selected = node.start === focus.selected;
    $('clausePicker').append(option);
  }
  $('clauseChoice').hidden = full || focus.options.length < 2;
  $('copyPage').textContent = full ? 'Copy full page text' : 'Copy excerpt';
  const pages = full ? [current.page] : [...new Set([...focus.pages, current.page])].sort((a, b) => a - b);
  if (!pages.includes(state.originalPreviewPage)) state.originalPreviewPage = current.page;
  $('originalPageSelect').replaceChildren();
  for (const page of pages) {
    const option = document.createElement('option');
    option.value = String(page);
    option.textContent = 'PDF page ' + page + (page === current.page ? ' · matching clause' : ' · parent context');
    option.selected = page === state.originalPreviewPage;
    $('originalPageSelect').append(option);
  }
  $('originalPageChoice').hidden = !current.pdf || pages.length < 2;
  if (current.pdf) {
    try {
      const bytes = await getPreviewPdfBytes(current.id);
      if (bytes) {
        const pdf = await getDocument(bytes);
        const dataUrl = await renderPageImage(pdf, state.originalPreviewPage);
        $('pdfImage').src = dataUrl;
        $('originalHighlightStatus').textContent = 'Original page loaded';
        pdf.destroy();
      } else {
        throw new Error('PDF data is unavailable. Re-scan the selected file.');
      }
    } catch (error) {
      $('pdfImage').removeAttribute('src');
      $('originalHighlightStatus').textContent = error.message;
    }
  }
  await updateOriginalHighlight(focus);
}

async function updateOriginalHighlight(focus) {
  const request = ++state.highlightRequest;
  $('pageHighlights').replaceChildren();
  const current = state.current;
  if (!current.pdf || !$('highlightOriginal').checked) {
    $('originalHighlightStatus').textContent = 'Highlights off';
    return;
  }
  $('originalHighlightStatus').textContent = 'Finding text on the original page…';
  const segments =
    state.previewMode === 'full'
      ? current.terms
      : (focus.pageSegments[state.originalPreviewPage] || []).map((s) => s.trim()).filter(Boolean);
  try {
    const bytes = await getPreviewPdfBytes(current.id);
    if (!bytes) throw new Error('PDF unavailable');
    const pdf = await getDocument(bytes);
    const ocrPage = state.documents[current.id]?.pages.find((p) => p.page === state.originalPreviewPage);
    const ocrWords = ocrPage?.method === 'Browser OCR' ? ocrPage.words : null;
    const { words } = await pageWords(pdf, state.originalPreviewPage, ocrWords);
    pdf.destroy();
    const result = locate(words, segments, current.terms, state.previewMode !== 'full');
    if (request !== state.highlightRequest) return;
    for (const box of result.boxes) {
      const rect = document.createElement('span');
      rect.className = 'page-highlight';
      rect.style.left = box.x * 100 + '%';
      rect.style.top = box.y * 100 + '%';
      rect.style.width = box.w * 100 + '%';
      rect.style.height = box.h * 100 + '%';
      $('pageHighlights').append(rect);
    }
    $('originalHighlightStatus').textContent = result.boxes.length
      ? result.matched < result.requested
        ? 'Some matching words located; check the original.'
        : 'Matching words highlighted within the selected text'
      : state.originalPreviewPage !== current.page
        ? 'Parent context page. The matching clause is on page ' + current.page + '.'
        : 'Could not locate the matching words reliably on the original.';
  } catch {
    if (request === state.highlightRequest)
      $('originalHighlightStatus').textContent = 'Highlights unavailable for this page. The original is still shown.';
  }
}

// ---- Event wiring ----

function savePreference(key, value) {
  try {
    saveSettings({ [key]: value });
  } catch (e) {
    notice('Could not save preferences: ' + e.message);
  }
}

$('browse').addEventListener('click', async () => {
  try {
    $('browse').disabled = true;
    const handle = await pickFolder();
    if (handle) await readFolder(handle);
  } catch (e) {
    notice(e.message);
  } finally {
    $('browse').disabled = state.busy;
  }
});

$('selectAll').addEventListener('change', (e) => {
  state.selected = e.target.checked ? new Set(state.files.map((f) => f.id)) : new Set();
  for (const input of document.querySelectorAll('.file-row input')) input.checked = e.target.checked;
  updateSelection();
  resetResults();
});

$('process').addEventListener('click', () => processSelected().catch((e) => notice(e.message)));
$('rescan').addEventListener('click', () => processSelected(true).catch((e) => notice(e.message)));
$('stop').addEventListener('click', () => {
  state.cancel = true;
  $('status').textContent = 'Stopping after the current file…';
});

$('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  notice();
  runSearch();
});

$('clearTopics').addEventListener('click', () => {
  state.topics.clear();
  renderTopics();
});
$('commonAll').addEventListener('click', () => {
  COMMON.forEach((id) => state.topics.add(id));
  renderTopics();
});
$('waterAll').addEventListener('click', () => {
  WATER.forEach((id) => state.topics.add(id));
  renderTopics();
});
$('roofAll').addEventListener('click', () => {
  ROOF.forEach((id) => state.topics.add(id));
  renderTopics();
});
$('structureAll').addEventListener('click', () => {
  STRUCTURE.forEach((id) => state.topics.add(id));
  renderTopics();
});

$('closePreview').addEventListener('click', () => $('preview').close());
$('preview').addEventListener('close', () => {
  state.highlightRequest++;
  $('pdfImage').removeAttribute('src');
  $('pageHighlights').replaceChildren();
});

$('copyPage').addEventListener('click', (event) =>
  copySnippet(state.current, state.previewMode === 'full' ? state.current.text : focusedExcerpt(state.current, state.focusedChoice).text, event.currentTarget),
);
$('excerptTab').addEventListener('click', () => {
  state.previewMode = 'excerpt';
  renderComparison();
});
$('fullTextTab').addEventListener('click', () => {
  state.previewMode = 'full';
  renderComparison();
});
$('clausePicker').addEventListener('change', (event) => {
  state.focusedChoice = Number(event.target.value);
  renderComparison();
});
$('highlightOriginal').addEventListener('change', () => {
  savePreference('highlightOriginal', $('highlightOriginal').checked);
  if (state.current) updateOriginalHighlight(focusedExcerpt(state.current, state.focusedChoice));
});
$('ocr').addEventListener('change', () => savePreference('ocr', $('ocr').checked));
$('mode').addEventListener('change', () => savePreference('searchMode', $('mode').value));
$('originalPageSelect').addEventListener('change', async (event) => {
  state.originalPreviewPage = Number(event.target.value);
  await renderComparison();
});

// ---- Init ----

(async () => {
  try {
    const { settings, warning } = loadSettings();
    $('appVersion').textContent = 'v' + VERSION;
    $('ocr').checked = settings.ocr;
    $('highlightOriginal').checked = settings.highlightOriginal;
    $('mode').value = settings.searchMode;
    renderTopics();
    $('fileList').innerHTML =
      '<div class="empty"><div class="empty-icon">⌕</div><h3>Pick a folder to begin</h3><p>Use Browse… in step 01 to choose a folder of policy PDFs, Word documents, or text files.<br>Files stay on this PC.</p></div>';
    if (warning) notice(warning);
  } catch (e) {
    notice(e.message);
  }
})();
