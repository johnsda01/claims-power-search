# Claims Power Search

Current development version: **0.1.0-beta.1**. The version stamp appears on screen and comes from `VERSION`.

User preferences are saved automatically in `%LOCALAPPDATA%\Claims Power Search\settings.json`. OCR, original-page highlighting, and the search mode are restored when the app reopens. This file lives outside the application folder: upgrades must replace application files only and leave this user-data folder intact. The settings file has its own schema version, independent of the app version. Unknown fields are retained when saving. Unreadable files or newer schemas are preserved and reported, rather than overwritten. Claim facts, searches, selected documents, and document contents are not stored in settings.

## Development and releases

Track only this application folder in a private GitHub repository. Documents, screenshots, generated text, local settings, credentials, and build output are excluded. Before committing additional files, check the staged file list for private material.

Update `VERSION` and `CHANGELOG.md` together for each release. Tag that commit with `v` followed by the exact version, such as `v0.1.0-beta.1`. GitHub checks validate that tags match the on-screen version and run the application tests. Standalone packaging and downloadable release binaries remain separate work; do not distribute a source archive as the Windows installer.

Install development dependencies from `requirements.txt`. Run `python -m unittest test_app test_highlights test_settings` and `node test_previews.cjs`. Checks that require the private local policy library run only when those files are present; the library is not uploaded to GitHub.

## Using the app

Double-click **Start Claims Power Search.cmd**. The app opens in your browser at http://127.0.0.1:8777. Keep its launch window open while you use it. Close that window to stop the app. If the app is already running, the launcher opens that copy.

1. Click **Browse** to choose a folder on this computer, or paste a folder path and click **Load folder**. The app lists PDF, Word (.docx), TXT, and Markdown files directly in that folder. It does not include subfolders.
2. Check the files you want, or check **Select all files**.
3. Click **Process selected files**. Scanned PDFs use Windows OCR when that option is checked. Progress, errors, and processing notes appear beside the file list. **OCR used** means the app read a scanned page to make it searchable. It does not mean an error was found or that you must review the entire file. Search normally, then check any wording you plan to copy against the original page.
4. Type search words, check claim topics, or use both. Choose **Any word**, **All words on the page**, or **Exact phrase**. Checked topics match any of those issues; typed words narrow those results.
5. Results show a **focused excerpt** with the relevant parent headings and clause labels. An ellipsis (**…**) marks omitted source wording. Click **Copy excerpt** to copy those lines together with the source filename and page.
6. Click **Compare & copy** to see the excerpt beside the original PDF page. **Focus on** lets you choose another matching clause. Switch between **Focused excerpt** and **Full page text**, then copy either view. **Open original PDF** opens the source at that page. Word and plain-text documents have no reliable page mapping.

Focused excerpts include the governing section, coverage heading, and parent clauses when those labels are present in the extracted text. If a parent begins on an earlier PDF page, the excerpt identifies that page. Use **Original page** in the comparison panel to switch between the parent context and the matching clause. Copied excerpts retain these page references. The app uses the selected document's own text for this context.

**Highlight selected text** marks the matching words within the selected excerpt on the original-page preview, using the same search terms as the left pane. Repeated wording outside that excerpt stays unmarked. Highlights update when you choose another clause. In **Full page text** mode, search terms are highlighted across the whole page. Turn the checkbox off to see an unmarked preview. Scanned pages may take a few seconds while OCR locates the words; the status beside the checkbox reports when some wording could not be located. Highlights are display overlays and do not alter your PDF files.

Text copies are saved in a new **claim-text** subfolder of the folder you selected, with names such as **DP-3 Policy.pdf.txt**. Its index lets you reopen the app and search without processing unchanged files again. Reprocessing replaces the app's text copies and index. It does not edit the original documents. Choose a folder where you have permission to save files.

The ten common topics are starting points for policy review, not a statistical ranking: trees and debris; wind, hail, and hurricanes; wear and maintenance; mold and rot; food loss and power failure; matching; deductibles and payment limits; notice and claim duties; loss of use; and sudden water discharge. Seven water topics provide more specific lookups. Hover over a checkbox to see its search terms. The topic phrases can be changed in `TOPICS` in app.py.

Search returns matching pages, including coverage, exclusions, limits, and exceptions. It does not interpret coverage or recommend claim decisions. Focused excerpts select source lines using clause labels; they may omit conditions, limits, or exceptions elsewhere on the page. The original page stays beside the excerpt for review. If the app cannot identify clause labels, it shows a short passage around the match. OCR can misread words or reading order. Check exact quotations against the original, especially when a scan contains columns or poor print.

The app runs on this computer and sends no documents to an external service. It uses the Python runtime bundled with Codex, pypdf, python-docx, pypdfium2, and Windows OCR. No subscription or API key is required. **Browse** opens the Windows folder picker on this computer, even if the browser is shown inside Codex.

If a file is marked **Not processed**, or search says it needs processing, select it and process it again. A changed source file cannot be searched using its older index. Password-protected PDFs need an unlocked copy. Files that fail processing are listed individually and omitted from search.
