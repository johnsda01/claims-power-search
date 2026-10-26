# Claims Power Search

Current development version: **0.1.0-beta.1**. The version stamp appears on screen and comes from `VERSION`.

A browser-based tool for searching insurance policy documents. Pick a folder of PDF, Word, or text files, process them into searchable text, then look up claim-issue wording with focused excerpts and side-by-side original-page comparison. All processing happens in your browser — documents never leave your computer.

## Stack

- **Vite** dev server and build.
- **PDF.js** for PDF text extraction and page rendering.
- **mammoth** for Word `.docx` text extraction.
- **Tesseract.js** for in-browser OCR of scanned PDF pages.
- **idb-keyval** (IndexedDB) for the per-folder document index and cached PDF bytes.
- **localStorage** for user preferences (OCR toggle, search mode, highlight toggle).

## Development

```bash
npm install
npm run dev      # start the Vite dev server
npm run build    # production build into dist/
npm test         # run preview-logic tests
```

The preview runs in Bolt. Open the app, click **Browse…** to choose a folder, process selected files, and search.

## Using the app

1. Click **Browse…** to choose a folder of policy documents. PDF, Word (.docx), TXT, and Markdown files are listed.
2. Check the files you want, or check **Select all files**.
3. Click **Process selected files**. Progress, errors, and processing notes appear beside the file list. When OCR is enabled, pages with little or no extractable text are read in your browser with Tesseract.js and flagged "OCR used" — OCR wording should be checked against the original. Pages that still have no text are flagged "Some pages need OCR."
4. Type search words, check claim topics, or use both. Choose **Any word**, **All words on the page**, or **Exact phrase**. Checked topics match any of those issues; typed words narrow those results.
5. Results show a **focused excerpt** with the relevant parent headings and clause labels. An ellipsis (**…**) marks omitted source wording. Click **Copy excerpt** to copy those lines together with the source filename and page.
6. Click **Compare & copy** to see the excerpt beside the original PDF page. **Focus on** lets you choose another matching clause. Switch between **Focused excerpt** and **Full page text**, then copy either view. **Highlight selected text** marks the matching words on the original-page preview.

Text copies and the document index are stored in your browser's IndexedDB, keyed by folder name. They persist across reloads. Processing the same folder again replaces the index for that folder.

The ten common topics are starting points for policy review, not a statistical ranking. Hover over a checkbox to see its search terms. Topic phrases can be changed in `src/lib/topics.js`.

Search returns matching pages, including coverage, exclusions, limits, and exceptions. It does not interpret coverage or recommend claim decisions. Focused excerpts select source lines using clause labels; they may omit conditions, limits, or exceptions elsewhere on the page. The original page stays beside the excerpt for review.

## Files stay local

The app runs entirely in your browser. No documents, settings, or search data are sent to any external service, and the app makes no network requests at runtime: the OCR engine, its WebAssembly core and the English language data are served from this app's own origin out of `public/tesseract/` (vendored from `node_modules` by `npm run vendor:tesseract`, which `dev` and `build` run automatically). A content security policy in `index.html` confines the page to same-origin loads so a regression cannot reintroduce an outbound request silently.

Extracted text and cached PDF bytes are persisted in this browser's IndexedDB. They stay on this machine, but they do persist across reloads; use **Clear stored documents** in step 01 to erase them. The Supabase project configured in `.env` is not used by this app — all persistence is browser-local.
