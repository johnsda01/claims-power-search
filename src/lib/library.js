// In-browser document library: keeps the per-folder text index and cached
// extracted pages in IndexedDB. Replaces the on-disk claim-text/index.json.
// Settings use localStorage so they persist across reloads.

import { get, set, del, createStore } from 'idb-keyval';
import { sha256 } from './extract.js';

const INDEX_KEY = 'cps:index:v1';
const PDF_KEY = 'cps:pdfhandles:v1';
const store = createStore('claims-power-search', 'library');
const pdfStore = createStore('claims-power-search', 'pdfs');

const DEFAULT_SETTINGS = { ocr: true, highlightOriginal: true, searchMode: 'any' };
const SETTINGS_KEY = 'cps:settings:v1';

export function defaultSettings() {
  return { ...DEFAULT_SETTINGS };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { settings: defaultSettings(), warning: '' };
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') throw new Error('bad');
    return { settings: { ...defaultSettings(), ...data }, warning: '' };
  } catch {
    return { settings: defaultSettings(), warning: 'Saved settings could not be read; defaults are in use.' };
  }
}

export function saveSettings(patch) {
  const { settings } = loadSettings();
  const next = { ...settings };
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) throw new Error('Unknown preference: ' + key);
    if (key === 'searchMode') {
      if (!['any', 'all', 'phrase'].includes(value)) throw new Error('Invalid search mode.');
    } else if (typeof value !== 'boolean') throw new Error('Invalid checkbox preference.');
    next[key] = value;
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

function normalizeFolderName(name) {
  return name.replace(/[\\/]+$/, '');
}

function folderKey(name) {
  return `${INDEX_KEY}:${normalizeFolderName(name)}`;
}

function pdfKey(id) {
  return `${PDF_KEY}:${id}`;
}

export async function loadIndex(folderName) {
  const data = (await get(folderKey(folderName), store)) || { version: 1, folder: folderName, documents: {} };
  return data.documents;
}

export async function saveIndex(folderName, documents) {
  const data = { version: 1, folder: normalizeFolderName(folderName), documents };
  await set(folderKey(folderName), data, store);
}

export async function clearIndex(folderName) {
  await del(folderKey(folderName), store);
}

// Cache a PDF.js document handle by file id so page images and words can be
// fetched later. We re-open the handle from the stored ArrayBuffer because
// PDF.js handles are not structured-cloneable.
export async function storePdfBytes(id, file) {
  const buf = await file.arrayBuffer();
  await set(pdfKey(id), new Uint8Array(buf), pdfStore);
}

export async function getPdfBytes(id) {
  const bytes = await get(pdfKey(id), pdfStore);
  if (!bytes) return null;
  if (bytes instanceof ArrayBuffer) return bytes;
  if (ArrayBuffer.isView(bytes)) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  return null;
}

export async function deletePdfBytes(id) {
  await del(pdfKey(id), pdfStore);
}

// Build the file id: stable per (folder, name). The original used a hash of
// the name; we keep that so previews remain stable across reloads.
export async function buildFileId(folderName, fileName) {
  const data = new TextEncoder().encode(`${normalizeFolderName(folderName)}::${fileName}`);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hashBuf)].slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export { sha256 };
