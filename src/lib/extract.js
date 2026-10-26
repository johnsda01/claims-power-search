// Browser document extraction. Replaces the Python pypdf/python-docx/pypdfium2
// pipeline: PDF.js pulls per-page text and rasterizes pages, mammoth reads
// Word .docx files, and text/markdown files decode directly. The output shape
// matches the original { page, text, method } pages list.

import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import mammoth from 'mammoth/mammoth.browser.js';
import Tesseract from 'tesseract.js/dist/tesseract.esm.min.js';
const { createWorker } = Tesseract;

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const SUPPORTED = new Set(['.pdf', '.docx', '.txt', '.md']);

export function supportedExtensions() {
  return [...SUPPORTED];
}

export function isSupported(name) {
  const lower = name.toLowerCase();
  return (
    SUPPORTED.has(lower.slice(lower.lastIndexOf('.'))) &&
    !name.startsWith('~$') &&
    !lower.endsWith('.searchable.txt') &&
    name.toLowerCase() !== 'agents.md'
  );
}

async function fileSignature(file) {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function decodeBytes(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function formatPdfText(items) {
  const positioned = items
    .filter((item) => item.str && item.str.trim())
    .map((item) => ({
      text: item.str,
      x: item.transform?.[4] || 0,
      y: item.transform?.[5] || 0,
      width: item.width || 0,
      fontSize: Math.abs(item.transform?.[3] || item.height || 10),
      hasEOL: item.hasEOL === true,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const item of positioned) {
    const line = lines.find((candidate) => !candidate.closed && Math.abs(candidate.y - item.y) <= Math.max(2, item.fontSize * 0.35));
    if (line) {
      line.items.push(item);
      line.closed = item.hasEOL;
    } else lines.push({ y: item.y, items: [item], closed: item.hasEOL });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => {
      line.items.sort((a, b) => a.x - b.x);
      let end = null;
      return line.items
        .map((item) => {
          const needsSpace = end !== null && item.x - end > Math.max(1, item.fontSize * 0.2);
          end = item.x + item.width;
          return (needsSpace ? ' ' : '') + item.text;
        })
        .join('');
    })
    .join('\n')
    .replace(/\u00ad/g, '')
    .trim();
}

// Serve the OCR engine, its wasm core and the language data from this app's own
// origin. Without these, tesseract.js silently falls back to a third-party CDN and
// executes remote script in the page that holds the user's document text.
const OCR_PATHS = {
  workerPath: new URL('tesseract/worker.min.js', document.baseURI).href,
  corePath: new URL('tesseract/', document.baseURI).href,
  langPath: new URL('tesseract/lang/', document.baseURI).href,
  gzip: true,
};

async function extractPdf(file, progress, useOcr) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: buffer,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  const pages = [];
  let ocrWorker = null;
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      progress(`Extracting page ${i} of ${pdf.numPages}…`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = formatPdfText(content.items);
      if (text.replace(/\W/g, '').length >= 35) {
        pages.push({ page: i, text, method: 'PDF text' });
        page.cleanup();
        continue;
      }
      if (!useOcr) {
        pages.push({ page: i, text, method: 'Needs OCR' });
        page.cleanup();
        continue;
      }
      progress(`Page ${i}: reading with OCR…`);
      if (!ocrWorker) {
        ocrWorker = await createWorker('eng', undefined, OCR_PATHS);
      }
      const viewport0 = page.getViewport({ scale: 1 });
      const scale = Math.min(2400 / Math.max(viewport0.width, viewport0.height), 4);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();
      const ocr = await ocrWorker.recognize(canvas);
      const words = [];
      const pw = canvas.width;
      const ph = canvas.height;
      for (const w of ocr.data.words || []) {
        words.push({
          text: w.text,
          x: w.bbox.x0 / pw,
          y: w.bbox.y0 / ph,
          w: (w.bbox.x1 - w.bbox.x0) / pw,
          h: (w.bbox.y1 - w.bbox.y0) / ph,
        });
      }
      const ocrText = (ocr.data.text || '').trim();
      pages.push({
        page: i,
        text: ocrText,
        method: 'Browser OCR',
        words,
        width: pw,
        height: ph,
      });
    }
  } finally {
    if (ocrWorker) await ocrWorker.terminate();
  }
  return { pages, pdf };
}

async function extractDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return [{ page: 1, text: result.value, method: 'Word text; page numbers unavailable' }];
}

async function extractText(file) {
  const bytes = await file.arrayBuffer();
  const text = await decodeBytes(new Uint8Array(bytes));
  return [{ page: 1, text, method: 'Text file; page numbers unavailable' }];
}

export async function extract(file, progress, useOcr = false) {
  const lower = file.name.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.'));
  if (ext === '.pdf') {
    const { pages, pdf } = await extractPdf(file, progress, useOcr);
    return { pages, pdfHandle: pdf };
  }
  if (ext === '.docx') return { pages: await extractDocx(file), pdfHandle: null };
  if (ext === '.txt' || ext === '.md') return { pages: await extractText(file), pdfHandle: null };
  throw new Error('Unsupported file type.');
}

export async function sha256(file) {
  return fileSignature(file);
}

// Render a PDF page to an image data URL for the original-page preview.
// Re-open a PDF.js document handle from stored bytes (for page images/words).
export async function getDocument(bytes) {
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  return pdfjsLib.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
}

export async function renderPageImage(pdfHandle, pageNumber, maxDim = 2200) {
  const page = await pdfHandle.getPage(pageNumber);
  const viewport0 = page.getViewport({ scale: 1 });
  const scale = Math.min(maxDim / Math.max(viewport0.width, viewport0.height), 4);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas.toDataURL('image/png');
}

// Word-level geometry for highlight overlays, in 0..1 page coordinates.
// For PDF text pages, geometry comes from the live text layer. For OCR'd
// pages (no text layer), cached words captured during OCR are returned.
export async function pageWords(pdfHandle, pageNumber, ocrWords = null) {
  if (ocrWords && ocrWords.length) {
    return { words: ocrWords, method: 'Browser OCR' };
  }
  const page = await pdfHandle.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const width = viewport.width;
  const height = viewport.height;
  const content = await page.getTextContent();
  const words = [];
  for (const item of content.items) {
    if (!item.str || !item.str.trim()) continue;
    const transform = item.transform;
    const x = transform[4];
    const y = height - transform[5];
    const fontHeight = Math.hypot(transform[2], transform[3]) || item.height || 10;
    const w = item.width || 0;
    // Split into words on whitespace, preserving geometry per token.
    const tokens = item.str.split(/(\s+)/).filter((s) => s.length);
    if (tokens.length <= 1) {
      words.push({ text: item.str, x: x / width, y: y / height, w: w / width, h: fontHeight / height });
    } else {
      // Approximate even distribution of tokens across the item width.
      const charWidth = w / item.str.length || 0;
      let cursorX = x;
      for (const token of tokens) {
        if (/^\s+$/.test(token)) {
          cursorX += token.length * charWidth;
          continue;
        }
        const tw = token.length * charWidth;
        words.push({ text: token, x: cursorX / width, y: y / height, w: tw / width, h: fontHeight / height });
        cursorX += tw;
      }
    }
  }
  page.cleanup();
  // Sort into reading order (top-to-bottom, left-to-right) with line-band
  // tolerance, matching how formatPdfText groups items into lines. Without this
  // the word stream follows raw PDF content-stream order and locate() cannot
  // match excerpt segments against it, so no highlight boxes are drawn.
  words.sort(
    (a, b) => Math.round(a.y * 200) - Math.round(b.y * 200) || a.x - b.x,
  );
  return { words, method: 'PDF text' };
}
