# Release history

## 0.2.0-beta.1

- Rebuilt as a browser-based app (Vite + PDF.js + mammoth). Runs in Bolt's preview.
- Documents are picked with the browser folder picker and processed entirely in the browser — no Python server, no Windows OCR, no external service.
- Per-folder text index and cached PDF bytes stored in IndexedDB; preferences in localStorage.
- Focused excerpts, clause picker, original-page comparison, and on-page highlighting preserved from the Python version.
- Scanned PDF pages are read in the browser with Tesseract.js when OCR is enabled. Word-level bounding boxes from OCR feed the same on-page highlight overlays used for PDF text pages.

## 0.1.0-beta.1

- Local document processing, policy topic searches, and focused excerpts.
- Original PDF page comparison with matching text highlights and source references.
- User preferences saved outside the application folder, so updates preserve them.
- Visible version stamp, with the same version used for Git release tags.
