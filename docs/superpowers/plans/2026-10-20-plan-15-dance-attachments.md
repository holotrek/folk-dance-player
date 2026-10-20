# Folk Dance Player — Plan 15: A PDF and a slide image on a dance (0.3.0, PRs 5a and 5b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dance can carry a **PDF** (its written notes) and a **static image** to show on the projector instead of, or as well as, its Canva slide. When it has both slides, a toggle in the editor chooses which one the projector shows.

**Architecture:** Both files are chosen with a native dialog in main and **copied into the app's data folder** (`dance-notes/`, `slide-images/`), recorded on `dance_prefs` (migration `006`). A new `AttachmentStore` in main owns copying, validating, recording and deleting; the renderer only ever names a dance ID, never a path (like the media protocol). The PDF opens in the system viewer (`shell.openPath`). The image reaches the projector through the `fdp-media://` scheme by dance ID, and the projector feed tells the window which kind of slide to draw; `LiveSlide` is only ever asked for a Canva slide, so an image dance adds no network use. Merging dances moves attachments by the same "kept dance wins, else adopt" rule as the rest of the personal data.

**Tech Stack:** As Plans 1–14. No new dependencies.

**Ships as two pull requests:** **5a = Tasks 1–5** (migration, store, PDF end to end), **5b = Tasks 6–10** (image, projector, toggle). The migration carries all five columns in 5a so there is only one.

**Spec:** `docs/superpowers/specs/2026-10-18-release-0-3-0-design.md` §3.6, §3.7 and §4. Main spec §6.3 (the dance editor) and §8.2–8.3 (projector, Canva slides) are updated by this plan.

## Global Constraints

- Test-first (Vitest); conventional-commit messages; one commit per task; a `CHANGELOG.md` line under `Unreleased` in the same commit as the user-facing change.
- No released migration is edited; this is `006-dance-attachments` (005 is the import mapping).
- **Personal data stays personal** (AGENTS.md): attachments live in `dance_prefs`, never in `dances`/`songs`.
- **The renderer never passes or receives a file path.** It sends dance IDs; main resolves paths from the database. File names stored in the database are names inside their folder, not absolute paths.
- Limits (my calls, in one constant each): a PDF is at most **50 MB** and must start with `%PDF-`; an image is at most **25 MB**, has an extension of `.png`, `.jpg`, `.jpeg`, `.webp` or `.gif`, and must match the format's magic bytes.
- Copying is **safe**: the new file is written before the old record changes, the old file is deleted only after the record points at the new one, and a failed copy leaves the dance exactly as it was.
- UI from Mantine components; custom CSS only in co-located `*.module.css`.
- Nothing may add a network request to the projector's path (spec §1 anti-goals): an image slide never starts the live Canva view.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A file named `.pdf` (or `.png`) that is not one: refused with a message, nothing copied, nothing recorded.
- A canceled file dialog: no change, no error.
- Attaching over an existing attachment, and a copy that fails halfway (disk full, source vanished): the old attachment and its record are intact; no stray new file is left behind.
- Two dances attaching files with the same original name: separate stored files (no overwrite).
- The stored file deleted outside the app: the editor says "The PDF is missing" / the image "is missing" with a way to replace it; Open and the projector do not throw.
- A name with Unicode, spaces or path-like characters (`../x.pdf`): stored under a generated name; the shown name is the base name only.
- Merging two dances that both have a PDF / image / source choice: nothing personal lost; the file that is not kept is deleted from disk only after the merge commits.
- An image dance whose image file is missing: the projector falls back to the Canva slide if there is one, else shows no slide, and never errors.
- Offline and during a projector session: an image slide needs no network and no Canva view.
- A dance used by several songs: attachments belong to the dance, so every song that shows it sees them.

## File Structure

- Create `src/main/db/migrations/006-dance-attachments.ts` (+ `index.ts`).
- Create `src/main/attachments/attachment-store.ts` — copying, validating, recording, deleting.
- Modify `src/shared/library.ts` (`SongDance` fields), `src/shared/contract.ts` (channels), `src/shared/media.ts` (dance-image URLs), `src/shared/projector.ts` (`ProjectorSlide.kind`).
- Modify `src/main/ipc/handlers.ts` (`Dialogs`, `HandlerDeps`), `src/main/ipc/library-handlers.ts`, `src/main/import/dialogs.ts`, `src/main/index.ts` (wiring, protocol), `src/main/library/edit.ts` (`getSongDetail`, `mergeDances`), `src/main/media/media-response.ts` (MIME), `src/main/projector/projector-feed.ts`.
- Modify renderer: `library/SongEditor.tsx`, new `library/NotesPdfField.tsx`, `library/DanceSlideField.tsx`, `projector/ProjectorView.tsx`.
- Tests: `tests/main/db/migration-006.test.ts`, `tests/main/attachments/attachment-store.test.ts`, `tests/main/ipc/library-handlers.test.ts`, `tests/main/library/edit.test.ts`, `tests/main/media/media-response.test.ts`, `tests/main/projector/projector-feed.test.ts`, `tests/renderer/library/*.test.tsx`, `tests/renderer/projector/projector-view.test.tsx`, `e2e/app.spec.ts`.

---

## PR 5a — the PDF

### Task 1: Migration 006

**Files:**
- Create: `src/main/db/migrations/006-dance-attachments.ts` (`export const danceAttachments: Migration`, version 6, name `'dance-attachments'`); modify `migrations/index.ts`
- Test: `tests/main/db/migration-006.test.ts`

**Interfaces:**
- Produces: `dance_prefs` gains nullable `notes_pdf_name TEXT`, `notes_pdf_path TEXT`, `slide_image_name TEXT`, `slide_image_path TEXT`, and `slide_source TEXT CHECK (slide_source IS NULL OR slide_source IN ('canva', 'image'))`. Existing rows keep all values and get NULLs.

- [ ] **Step 1: Write failing tests** (style of `migration-004.test.ts`): `'applies as version 6'` (`{ from: 5, to: 6 }`, `getSchemaVersion` 6); `'existing dance prefs keep their values and get no attachments'` (a dance with difficulty and notes survives, the five new columns are NULL); `'slide_source only accepts canva or image'` (inserting `'video'` throws); `'the new columns can be written and read'`.
- [ ] **Step 2:** Run `npx vitest run tests/main/db/migration-006.test.ts` — expect FAIL.
- [ ] **Step 3:** Implement with five `ALTER TABLE dance_prefs ADD COLUMN …` statements (the CHECK goes on `slide_source`). Update any test that hard-codes the latest version.
- [ ] **Step 4:** Run `npx vitest run tests/main/db` — expect PASS.
- [ ] **Step 5:** Commit `feat: columns for a dance's PDF and slide image`.

### Task 2: The attachment store (PDF)

**Files:**
- Create: `src/main/attachments/attachment-store.ts`
- Test: `tests/main/attachments/attachment-store.test.ts` (real temp directories, like the import tests)

**Interfaces:**
- Produces: `class AttachmentStore` constructed with `{ db: DatabaseSync; dir: string }` (`dir` is the app data folder; the store uses `dir/dance-notes` and, in Task 6, `dir/slide-images`, creating them on first use). Methods (all synchronous over the database and `node:fs`, `LibraryEditError` for refusals):
  - `attachPdf(danceId: number, source: string): void` — validates (exists, regular file, ≤ `MAX_PDF_BYTES` = 50 MB, starts with `%PDF-`), copies to `dance-notes/<danceId>-<8 random hex>.pdf`, then in one transaction records `notes_pdf_name` (the source's base name) and `notes_pdf_path` (the stored file's name), then deletes the previously stored file, if any. A failure before the record changes removes the new copy and rethrows.
  - `removePdf(danceId: number): void` — clears both columns, then deletes the stored file (a file already gone is fine).
  - `pdfPath(danceId: number): string | null` — the absolute path of the stored file, or `null` when there is none **or the file is missing**.
  - `pdfInfo(danceId: number): { name: string; missing: boolean } | null`.
- Consumes: `dance_prefs` columns from Task 1; `LibraryEditError` from `../library/edit`.

- [ ] **Step 1: Write failing tests:**
  - `'attaching copies the file into dance-notes and records its name'`: the copy exists with the same bytes, the shown name is the source's base name, the stored name is not the source's name.
  - `'the original can be deleted or moved afterwards'`: `pdfPath` still resolves and the file reads.
  - `'a file that is not a PDF is refused, even named .pdf'` (no copy, no row change); `'a missing source, a directory, and a file over the limit are refused'` (use a small injected limit through a constructor option `maxPdfBytes`).
  - `'attaching again replaces the file and deletes the old copy'`; `'a failed copy leaves the old attachment intact'` (make the destination unwritable or pass a source that disappears between check and copy through an injectable `copyFile`, constructor option defaulting to `fs.copyFileSync`).
  - `'two dances with the same file name get separate stored files'`.
  - `'a path-like or Unicode source name shows only its base name and stores under a generated name'` (`/tmp/x/../évé 1.pdf`).
  - `'removePdf clears the record and deletes the file; removing twice is fine'`.
  - `'pdfInfo reports missing when the stored file was deleted outside the app, and pdfPath is null'`.
- [ ] **Step 2:** Run the file — expect FAIL.
- [ ] **Step 3:** Implement the class. The record update uses `INSERT … ON CONFLICT (dance_id) DO UPDATE` on `dance_prefs` (a dance may have no prefs row yet), inside `inTransaction`.
- [ ] **Step 4:** Run the file — expect PASS.
- [ ] **Step 5:** Commit `feat: store a dance's PDF in the app data folder`.

### Task 3: PDF channels, details and wiring

**Files:**
- Modify: `src/shared/contract.ts`, `src/shared/library.ts`, `src/main/ipc/handlers.ts`, `src/main/ipc/library-handlers.ts`, `src/main/import/dialogs.ts`, `src/main/library/edit.ts` (`getSongDetail`), `src/main/index.ts`
- Test: `tests/main/ipc/library-handlers.test.ts`, `tests/main/library/edit.test.ts`, `tests/renderer/fake-api.ts` (the fake answers the new channels with `undefined` where a test does not set them)

**Interfaces:**
- Produces: `SongDance.notesPdf: { name: string; missing: boolean } | null`. Invoke channels: `'library:attachNotesPdf': { args: [danceId: number]; result: boolean }` (opens the PDF dialog in main; `false` when canceled), `'library:openNotesPdf': { args: [danceId: number]; result: void }`, `'library:removeNotesPdf': { args: [danceId: number]; result: void }`. `Dialogs` gains `pickPdf(): Promise<string | null>` (filter name "PDF", extension `pdf`). `HandlerDeps` gains `attachments: Pick<AttachmentStore, 'attachPdf' | 'removePdf' | 'pdfPath' | 'pdfInfo'>` and `openPath: (path: string) => Promise<string>` (Electron's `shell.openPath`, which returns an error string or `''`). `getSongDetail(db, songId, attachments?)` fills `notesPdf` from `pdfInfo` (the parameter defaults to a store over `db` only for the information call; keep `getSongDetail`'s existing signature working for its tests, e.g. by making `attachments` optional and `notesPdf` null without it).
- Behavior: attach/remove call `onLibraryChanged` (via the existing `edit()` wrapper); open resolves the path through `pdfPath(danceId)`, refuses with `LibraryEditError('The PDF is missing.')` when it is null, and throws `LibraryEditError(<message>)` when `openPath` returns a non-empty error string.
- `main/index.ts`: builds `new AttachmentStore({ db, dir: app.getPath('userData') })`, passes `shell.openPath`, and gives `importDialogs` a `pickPdf`. **Test hook:** when the environment variable `FDP_PICK_ATTACHMENT` is set, `pickPdf` and (Task 7) `pickImage` return it without opening a dialog (like `FDP_APPLE_LIBRARY`; documented in AGENTS.md).

- [ ] **Step 1: Write failing tests:** in `library-handlers.test.ts` (with a fake `Dialogs` and a real `AttachmentStore` on a temp dir): `'attaching a PDF through the dialog records it and announces the change'`; `'a canceled dialog returns false and changes nothing'`; `'Open passes the stored path to openPath, never a path from the caller'` (call with a danceId only; assert the path equals the store's); `'Open on a missing PDF is refused with "The PDF is missing."'`; `'an openPath error string becomes an error'`; `'Remove deletes the file and announces the change'`; in `edit.test.ts`: `'getSongDetail carries each dance's PDF name and whether it is missing'`.
- [ ] **Step 2:** Run `npx vitest run tests/main` — expect FAIL.
- [ ] **Step 3:** Implement as specified; add the three channel names to `INVOKE_CHANNELS` and the typed contract; add `pickPdf` to `importDialogs` (in `src/main/import/dialogs.ts`, with the env hook); wire in `index.ts`. Update test helpers that build `HandlerDeps`/`Dialogs`.
- [ ] **Step 4:** Run `npx vitest run tests/main` and `npm run typecheck:node` — expect PASS / clean. (`typecheck:web` stays red until Task 5 adds the new `SongDance` field to the web fixtures.)
- [ ] **Step 5:** Commit `feat: attach, open and remove a dance's PDF`.

### Task 4: Merging dances moves the PDF

**Files:**
- Modify: `src/main/library/edit.ts` (`mergeDances`), `src/main/ipc/library-handlers.ts`
- Test: `tests/main/library/edit.test.ts`, `tests/main/ipc/library-handlers.test.ts`

**Interfaces:**
- Produces: `mergeDances(db, keepId, removeId): string[]` now returns the **stored files the merge left unreferenced**, as paths relative to the app data folder (`'dance-notes/<name>'`; the removed dance's PDF, when the kept dance has its own). The kept dance keeps its PDF; if it has none it takes the removed dance's (name and stored file name). The `library:mergeDances` handler deletes the returned files from `dance-notes/` after the merge succeeded (through a new `AttachmentStore.deleteUnreferenced(relativePaths: string[])`, which deletes only files no row references and never anything outside `dance-notes/` and `slide-images/`).

- [ ] **Step 1: Write failing tests:** `edit.test.ts`: `'merge keeps the kept dance's PDF and reports the removed dance's file as unreferenced'`; `'merge gives the kept dance the removed dance's PDF when it has none (nothing is reported)'`; `'merge with neither changes nothing and reports nothing'`. `library-handlers.test.ts`: `'after a merge the unreferenced PDF is deleted from disk, and the adopted one is not'`; `'a failed merge deletes nothing'`.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement. The column copy goes next to the existing `fillEmptyFrom(dance_prefs …)` call (add the PDF columns to its list so they move together as a pair — name and stored name are never taken from different dances: treat the pair as one unit in code, not two independent fills).
- [ ] **Step 4:** Run `npx vitest run tests/main` — expect PASS.
- [ ] **Step 5:** Commit `feat: merging dances keeps the PDF`.

### Task 5: The PDF in the song editor, docs, and end-to-end

**Files:**
- Create: `src/renderer/src/library/NotesPdfField.tsx`
- Modify: `src/renderer/src/library/SongEditor.tsx` (below the dance's notes), `tests/renderer/library/song-editor.test.tsx` fixtures, `e2e/app.spec.ts`, `CONTRIBUTING.md`, `CHANGELOG.md`, `AGENTS.md`, the specs, `docs/manual-testing/pre-release-hardware.md`
- Test: `tests/renderer/library/notes-pdf.test.tsx`

**Interfaces:**
- Consumes: `SongDance.notesPdf`, the three channels (Task 3).
- Produces: `NotesPdfField({ danceId, pdf })` inside each dance card, under **Notes**: with no PDF a **Attach PDF…** button; with one, the file name with **Open** and **Remove** buttons; when `pdf.missing`, the text "The PDF is missing" with **Attach PDF…** and **Remove**. Errors from the channels show in the card's alert (the editor's existing `run()` path) — pass `run` down or catch and show locally as `DanceSlideField` does.

- [ ] **Step 1: Write failing tests** (`notes-pdf.test.tsx`, rendered through `SongEditor` with a detail fixture whose dance has `notesPdf`): `'no PDF: Attach PDF… calls library:attachNotesPdf with the dance id'`; `'a canceled dialog (false) shows nothing'`; `'with a PDF: shows the file name, Open calls library:openNotesPdf, Remove calls library:removeNotesPdf'`; `'a missing PDF says so and offers Attach PDF… and Remove'`; `'an error from Open is shown'`; `'a dance used by several songs shows its PDF in each song's editor'`. Add `notesPdf: null` to the hand-built `SongDance` fixtures (found by `npm run typecheck:web`).
- [ ] **Step 2:** Run `npx vitest run tests/renderer` — expect FAIL.
- [ ] **Step 3:** Implement the component and add it to the dance card.
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck` — expect PASS and clean.
- [ ] **Step 5:** e2e `'a PDF can be attached to a dance and opened from the editor'`: generate a minimal PDF in a temp folder in the test (a few bytes starting `%PDF-1.4`), start the app with `FDP_PICK_ATTACHMENT` set to it (extend `launch()`'s `extraEnv`, as the Apple sync test does), select a song, click **Attach PDF…**, expect the file name and **Open**/**Remove** to appear and the copy to exist under `<userData>/dance-notes/`; click **Remove** and expect the copy to be gone. (Do not click Open: it would launch the real viewer.) Run `npm run test:e2e` — **ask the user first**, it takes over their screen.
- [ ] **Step 6:** Docs: main spec §6.3 (the dance editor: Attach PDF…, Open, Remove, missing); the 0.3.0 spec §2 row 3.6 → Built; CONTRIBUTING.md where backups are described: "Attached PDFs and images live in the app data folder (`dance-notes/`, `slide-images/`) and are not part of the startup backup, which copies the database only"; AGENTS.md decision "Dance attachments are copies in the app data folder, named and recorded by main; the renderer sends only dance IDs" (why: moving or deleting the original must not break a dance; the media protocol already works by ID; _Rejected:_ referencing the original path; a PDF viewer inside the app) plus the `FDP_PICK_ATTACHMENT` test hook; CHANGELOG Added: "Attach a PDF (its written notes, for example) to a dance in the song editor; **Open** shows it in your PDF viewer."; hardware checklist item: attach a real PDF, Open it, delete the app's copy in Finder and see "The PDF is missing", Remove.
- [ ] **Step 7:** Commit `feat: attach a PDF to a dance in the song editor`. **Open PR 5a here** (after the independent review).

---

## PR 5b — the slide image

### Task 6: Image storage and the slide choice

**Files:**
- Modify: `src/main/attachments/attachment-store.ts`, `src/shared/library.ts`, `src/main/library/edit.ts` (`getSongDetail`)
- Test: `tests/main/attachments/attachment-store.test.ts`, `tests/main/library/edit.test.ts`

**Interfaces:**
- Produces on `AttachmentStore`: `attachImage(danceId, source)` (≤ `MAX_IMAGE_BYTES` = 25 MB; extension in `.png .jpg .jpeg .webp .gif`; magic bytes of PNG / JPEG / WebP / GIF; stored as `slide-images/<danceId>-<8 hex>.<ext>`; same safe-copy order as the PDF), `removeImage(danceId)`, `imagePath(danceId): string | null` (null when none or missing), `imageInfo(danceId): { name: string; version: string; missing: boolean } | null` (`version` = the stored file name, which changes on every attach so a replaced image loads fresh), `setSlideSource(danceId, source: 'canva' | 'image')`, and `slideShows(danceId): 'canva' | 'image' | null` — **`null` unless the dance has both a Canva slide and an image**; when it has both, the stored `slide_source` or `'canva'` by default.
- Rules: attaching an image clears `slide_source` when it does not yet have two sources (the toggle appears only with both); `removeImage` and clearing the Canva slide (the existing `clearDanceSlide`) set `slide_source` to NULL; `setSlideSource` throws `LibraryEditError` unless the dance has both.
- `SongDance` gains `slideImage: { name: string; url: string; missing: boolean } | null` (`url` is the `fdp-media://dance-image/<id>?v=<version>` URL from Task 7; for this task build it with the helper added there — add the helper first in this task's Step 3) and `slideShows: 'canva' | 'image' | null`.

- [ ] **Step 1: Write failing tests** (store, same style as the PDF's, with PNG / JPEG / WebP / GIF byte headers built in the test): `'attaching an image copies it into slide-images and records its name'`; `'a file that is not an image is refused, even named .png'`; `'an unsupported extension is refused'`; `'attaching again replaces the file; a failed copy leaves the old image'`; `'slideShows is null with only an image, null with only a Canva slide, and canva by default with both'`; `'setSlideSource changes the choice only with both, and refuses otherwise'`; `'removing the image or clearing the Canva slide clears the choice'`; `'imageInfo reports missing when the file was deleted'`. `edit.test.ts`: `'getSongDetail carries slideImage and slideShows'`.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement. `getDanceSlide`'s consumers are unchanged; `clearDanceSlide` (in `canva/decks.ts`) also nulls `slide_source`.
- [ ] **Step 4:** Run `npx vitest run tests/main` — expect PASS.
- [ ] **Step 5:** Commit `feat: store a dance's slide image and which slide the projector shows`.

### Task 7: Image channels and the media protocol

**Files:**
- Modify: `src/shared/contract.ts`, `src/shared/media.ts`, `src/main/ipc/handlers.ts` (`Dialogs.pickImage`), `src/main/ipc/library-handlers.ts`, `src/main/import/dialogs.ts`, `src/main/index.ts` (protocol handler), `src/main/media/media-response.ts` (MIME for `.jpg .jpeg .webp .gif`)
- Test: `tests/shared/media.test.ts` (or the existing media URL tests), `tests/main/media/media-response.test.ts`, `tests/main/ipc/library-handlers.test.ts`

**Interfaces:**
- Produces: `danceImageUrl(danceId: number, version: string): string` = `fdp-media://dance-image/<id>?v=<encoded version>` and `parseDanceImageUrl(url): number | null` in `shared/media.ts`; channels `'library:attachSlideImage': { args: [danceId: number]; result: boolean }`, `'library:removeSlideImage': { args: [danceId: number]; result: void }`, `'library:setSlideSource': { args: [danceId: number, source: 'canva' | 'image']; result: void }`; `Dialogs.pickImage(): Promise<string | null>` (filter "Images", the five extensions; honors `FDP_PICK_ATTACHMENT`). The protocol handler serves `dance-image` URLs from `attachments.imagePath(danceId)` through `mediaResponse` (404 when none).

- [ ] **Step 1: Write failing tests:** URL helper round trip and rejection of malformed URLs / other schemes; `mediaResponse` content types for `.jpg .jpeg .webp .gif`; handlers: attach via dialog announces the change, cancel returns false, remove, `setSlideSource` refused without both and accepted with both.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Run `npx vitest run tests/shared tests/main` — expect PASS.
- [ ] **Step 5:** Commit `feat: attach a slide image to a dance, served by dance ID`.

### Task 8: Merging dances moves the image and the choice

**Files:**
- Modify: `src/main/library/edit.ts` (`mergeDances`), `src/main/attachments/attachment-store.ts` (`deleteUnreferenced` handles both folders), `src/main/ipc/library-handlers.ts`
- Test: `tests/main/library/edit.test.ts`, `tests/main/ipc/library-handlers.test.ts`

**Interfaces:**
- Produces: `mergeDances` keeps returning the flat list of unreferenced stored files (relative paths, now also `'slide-images/<name>'`), so the handler stays one line. The kept dance keeps its image; if it has none it adopts the removed dance's (name, stored name together). `slide_source`: the kept dance's own choice wins when it has both sources after the merge; otherwise the removed dance's choice is adopted when its sources came across; then normalized to NULL unless the merged dance has both a Canva slide and an image.

- [ ] **Step 1: Write failing tests:** image kept / adopted / reported unreferenced; `'the kept dance's source choice wins'`; `'the removed dance's choice is adopted when the kept dance had no choice and both sources now exist'`; `'the choice is cleared when the merged dance does not have both'`; handler deletes unreferenced images after the merge and not before (a failing merge deletes nothing).
- [ ] **Step 2:** Run — expect FAIL. **Step 3:** Implement. **Step 4:** Run `npx vitest run tests/main` — expect PASS.
- [ ] **Step 5:** Commit `feat: merging dances keeps the slide image and the slide choice`.

### Task 9: The projector shows the chosen slide

**Files:**
- Modify: `src/shared/projector.ts` (`ProjectorSlide`), `src/main/projector/projector-feed.ts`, `src/main/index.ts` (pass the store to the feed), `src/renderer/src/projector/ProjectorView.tsx`
- Test: `tests/main/projector/projector-feed.test.ts`, `tests/renderer/projector/projector-view.test.tsx`

**Interfaces:**
- Produces: `ProjectorSlide` becomes `{ kind: 'canva'; deckId: number; pageId: string; imageUrl: string | null; live: boolean } | { kind: 'image'; imageUrl: string }`. In `createProjectorFeed`'s `slideFor(danceId)`: when `attachments.slideShows(danceId)` is `'image'`, or the dance has an image and no Canva slide, and the image file exists, return `{ kind: 'image', imageUrl }` **and call `deps.live.show(null)`** (the live view is never started for it); when the image file is missing, fall back to the Canva slide path as today. A dance with only a Canva slide behaves exactly as before. `createProjectorFeed` gains `attachments: Pick<AttachmentStore, 'slideShows' | 'imageInfo' | 'imagePath'>`.
- The projector page draws a `kind: 'image'` slide in the same slide area and layout as a Canva slide's saved image (`slideBox`, on black); nothing else changes.

- [ ] **Step 1: Write failing tests:** feed: `'a dance whose slide choice is image sends an image slide and never asks the live view to show'` (the fake `live.show` is called with `null`); `'both sources, choice canva: the Canva slide as before'`; `'both sources, no choice yet: the Canva slide'`; `'only an image: an image slide'`; `'the image file is missing: falls back to the Canva slide, or no slide'`; `'a replaced image changes the URL version'`. View: `'draws an image slide in the slide area with the slide layout'` and `'an image slide has the same box as a Canva slide image'`; update existing snapshot fixtures to `kind: 'canva'`.
- [ ] **Step 2:** Run — expect FAIL. **Step 3:** Implement. **Step 4:** Run `npx vitest run tests/main/projector tests/renderer/projector` and `npm run typecheck` — expect PASS and clean (the editor fixtures may need `slideImage: null`, `slideShows: null` — add them).
- [ ] **Step 5:** Commit `feat: the projector shows a dance's slide image`.

### Task 10: The slide image in the song editor, docs, and end-to-end

**Files:**
- Modify: `src/renderer/src/library/DanceSlideField.tsx`, `src/renderer/src/library/SongEditor.tsx` (pass the new props), `e2e/app.spec.ts`, `CHANGELOG.md`, `AGENTS.md`, the specs, `docs/manual-testing/pre-release-hardware.md`
- Test: `tests/renderer/library/dance-slide.test.tsx` (extend)

**Interfaces:**
- Consumes: `SongDance.slideImage`, `SongDance.slideShows`, the Task 7 channels.
- Produces: `DanceSlideField` props gain `image: SongDance['slideImage']` and `shows: SongDance['slideShows']`. The Slide section keeps its Canva controls and adds **Upload image…** (or, with an image: a thumbnail of it with its file name, **Replace…** and **Remove**; "The image is missing" with **Upload image…** when `image.missing`). When `shows` is not null (both sources exist) a Mantine `SegmentedControl` labelled "Show on the projector" with **Canva slide** / **Image** appears, selected by `shows`, and choosing calls `library:setSlideSource`. With only one source there is no toggle.

- [ ] **Step 1: Write failing tests:** `'Upload image… calls library:attachSlideImage with the dance id'`; `'with an image: thumbnail, file name, Replace… and Remove'`; `'the toggle is hidden with only a Canva slide, and with only an image'`; `'with both, the toggle shows the current choice and choosing Image calls library:setSlideSource(danceId, "image")'`; `'a missing image says so and offers Upload image…'`; `'an error from attaching is shown'`.
- [ ] **Step 2:** Run — expect FAIL. **Step 3:** Implement. **Step 4:** Run `npx vitest run` and `npm run typecheck` — expect PASS and clean.
- [ ] **Step 5:** e2e `'an image slide is attached, and the projector snapshot carries it'`: with `FDP_PICK_ATTACHMENT` set to a small PNG generated in the test, select a song, **Upload image…**, expect the thumbnail; add the song to a program and play it (as the existing play test does); `invoke('projector:getSnapshot')` has `middle.slide.kind === 'image'` and an `fdp-media://dance-image/` URL; then **Remove** the image and the snapshot has no slide. Run `npm run test:e2e` — **ask the user first**.
- [ ] **Step 6:** Docs: main spec §6.3 and §8.3 (an image as an alternative slide, the toggle, offline); the 0.3.0 spec §2 row 3.7 → Built and open question 4 answered ("Canva slide is the default until the toggle is used"); AGENTS.md decision "A dance's slide image is a copy served by dance ID; the projector feed carries `kind: 'canva' | 'image'` and an image slide never starts the live Canva view"; CHANGELOG Added: "Give a dance a slide **image** instead of, or as well as, a Canva slide; when it has both, choose which one the projector shows. An image slide works offline."; hardware checklist: upload an image, play the dance on the projector (letterboxed on black, no Canva controls, works offline); with both sources toggle between them; delete the app's copy and see the projector fall back.
- [ ] **Step 7:** Commit `feat: a slide image for a dance, and the choice of slide`. **Open PR 5b here** (after the independent review).

## Self-Review

- **Spec coverage:** §3.6 (one PDF per dance, native dialog limited to PDFs, copied to `dance-notes/`, Attach PDF… / Open / Remove, Open through the system viewer by dance ID, "The PDF is missing", merge rule, CONTRIBUTING.md note, tests) → Tasks 1–5. §3.7 (image copy, `slide_image_*`, `slide_source`, editor controls and toggle hidden with one source, default Canva, projector letterboxing and no live view, served by dance ID, removal rules, merge rule, tests) → Tasks 6–10. §4's migration → Task 1 (numbered 006). The spec's optional "startup check for orphans" is not planned (note in AGENTS.md).
- **Types:** `AttachmentStore` methods (Tasks 2, 6), `SongDance.notesPdf/slideImage/slideShows` (Tasks 3, 6), the channel names (Tasks 3, 7), `danceImageUrl` (Task 7, used in Task 6's `getSongDetail`), `ProjectorSlide.kind` (Task 9) and `mergeDances`'s flat list of relative paths (Tasks 4, 8; Task 4 first returns PDF names under `dance-notes/` in the same relative form) are consistent.
- **Order note:** Task 6 uses `danceImageUrl`, which Task 7 lists; Task 6 Step 3 adds the helper first (it is a pure function with its test in Task 7).
- **Open for the maintainer:** the size limits (50 MB PDF, 25 MB image) and the `FDP_PICK_ATTACHMENT` test hook are this plan's calls.
