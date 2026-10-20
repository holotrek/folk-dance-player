# Folk Dance Player — Plan 14: "Same as song" for a dance's name (0.3.0, PR 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the song editor, a dance whose name is the same as its song's shows a **Same as song** checkbox and a read-only name entry. While it applies, renaming the song renames the dance too.

**Architecture:** The "same as song" state is **derived** (the spec's recommendation, open question 1): a song's **default dance** is "same as song" when it is linked to exactly one song and its name equals that song's title (ignoring case and surrounding spaces, the same equality labels use). Main computes it into `SongDance.sameAsSong`; `updateSong` renames that dance in the same transaction as the title. The renderer shows the checkbox on the default dance only and keeps unchecking as editor-session state. No schema change, no migration.

**Tech Stack:** As Plans 1–13. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-18-release-0-3-0-design.md` §3.5 (and §7, question 1). Main spec §4 (Labels) and §6.3 (the song editor) are updated by this plan.

## Global Constraints

- Test-first (Vitest); conventional-commit messages; one commit per task; a `CHANGELOG.md` line under `Unreleased` in the same commit as the user-facing change.
- Keep the data layers separate (AGENTS.md): this changes `songs`/`dances` names only, nothing personal.
- UI from Mantine components; no custom CSS.
- A dance shared by several songs never follows one of them (it is "one dance, many tunes"); a merge or a second link ends following by itself, because the dance then has two songs.
- Search stays right: `library_fts` is kept current by the existing triggers on `songs` and `dances`; this plan adds none.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A song with two dances of its own: only the default dance can be "same as song" and follow a rename; a second dance with the same name as the song, not the default, neither shows the box nor follows. Changing which dance is the default moves the box and the following to the new default.
- Names equal except for case or surrounding spaces (`hora ` vs `Hora`): treated as the same; after a rename the dance's name is the new title exactly.
- A song renamed to the same text it already has, or to a case/space variant of itself: nothing breaks and the dance ends up equal to the new title.
- A dance used by two songs whose name equals one song's title: no checkbox, no following, no matter which song is renamed.
- Unchecking and then renaming the song before touching the dance name: the dance still follows (the derived rule, since the names are still equal); the plan accepts and documents this.
- Checking the box on a dance with a different name replaces that name with the song's title, in one change, and the label, search and program items follow.
- A dance renamed by hand away from the title: the checkbox stays, unchecked, and renaming the song leaves the dance alone; checking the box sets the dance's name back to the song's title and from then on it follows.
- Search and labels after a rename: the library finds the new name, and the old one no longer matches.
- An Apple Music synced song: Music's own title change reaches the dance through the sync's field rules, unchanged by this plan.

## File Structure

- Modify `src/shared/labels.ts` (export `sameName`), `src/shared/library.ts` (`SongDance.sameAsSong`).
- Modify `src/main/library/edit.ts` (`getSongDetail`, `updateSong`).
- Modify `src/renderer/src/library/fields.tsx` (`TextField` gains `readOnly`) and `SongEditor.tsx`.
- Tests: `tests/shared/labels.test.ts`, `tests/main/library/edit.test.ts`, `tests/main/library/list.test.ts` (search), `tests/renderer/library/song-editor.test.tsx`, `e2e/app.spec.ts`.

---

### Task 1: Main — `sameAsSong`, and the dance follows a renamed song

**Files:**
- Modify: `src/shared/labels.ts` (replace the private `same` with `export const sameName = (a: string, b: string): boolean`; `labelParts` uses it), `src/shared/library.ts` (`SongDance` gains `sameAsSong: boolean`), `src/main/library/edit.ts` (`getSongDetail` at ~line 99, `updateSong` at line 186)
- Test: `tests/shared/labels.test.ts`, `tests/main/library/edit.test.ts`, `tests/main/library/list.test.ts`

**Interfaces:**
- Produces: `sameName(a, b)` — equal ignoring case and surrounding spaces (the rule `labelParts` already used). `SongDance.sameAsSong` is `true` when the dance is the song's default dance (`isDefault`), its `songCount` is 1, and `sameName(dance.name, song.title)`. `updateSong(db, songId, patch)` keeps its signature; when `patch.title` changes the title, then in the same transaction the song's default dance, if it is linked to **only** this song and its name was `sameName` as the **old** title, gets the new (trimmed) title as its name.

- [ ] **Step 1: Write failing tests:**
  - `labels.test.ts`: `'sameName ignores case and surrounding spaces'` (`sameName(' hora ', 'Hora')` is true; `'Hora'` vs `'Hora Mare'` is false).
  - `edit.test.ts` (using `addLibrarySong`, `addDance`, `link` from the fixtures):
    - `'getSongDetail marks the default dance that is the song's only use of its name as sameAsSong'`: a song `Kolo` with its automatic (default) dance `Kolo` → `sameAsSong` true; a second linked, non-default dance `Lesnoto` → false; a second non-default dance also named `Kolo` → false.
    - `'a dance shared by two songs is never sameAsSong'`: link the dance `Kolo` to a second song → false for both songs.
    - `'a dance whose name differs only by case is sameAsSong'`.
    - `'renaming the song renames its same-named default dance in the same change'`: `updateSong(db, id, { title: 'Kolo Veliko' })` → the default dance's name is `Kolo Veliko`, its `sameAsSong` stays true, and the song's other dances are untouched (including a non-default dance that was also named `Kolo`).
    - `'after Make default, the new default is the one that follows'`: with two dances named alike, `setDefaultDance` to the second, then a rename → only the second is renamed.
    - `'trims the new title for the dance too'`: title `'  Kolo X '` → dance name `Kolo X`.
    - `'a renamed song leaves a dance with a different name alone'`.
    - `'a shared dance is not renamed with one of its songs'`.
    - `'a failed title (blank) changes neither song nor dance'` (throws `LibraryEditError`, dance name unchanged).
  - `list.test.ts`: `'after a rename the library finds the new name, and the old one no longer matches'`: `listLibrary` with `search: 'Veliko'` finds the song; `search: 'Kolo'` does not match a song renamed to `Veliko` (use distinct words so the old and new names share no token), and the row's `label` is the new name.
- [ ] **Step 2:** Run `npx vitest run tests/shared/labels.test.ts tests/main/library` — expect FAIL.
- [ ] **Step 3:** Implement. In `getSongDetail` compute `sameAsSong` per dance from `isDefault`, `songCount` and `song.title`. In `updateSong`, wrap the title change and the dance rename in `inTransaction`; find the song's default dance with the same pairing rule `getSongDetail` uses (`shownPairingSql`), require its `songCount` to be 1 (a `COUNT(*)` over `dance_songs` for the dance) and `sameName(name, oldTitle)`, then update its `name` to the new trimmed title. Skip the pass when `patch.title` is undefined.
- [ ] **Step 4:** Run `npx vitest run tests/shared tests/main` — expect PASS. Update fixtures that build a `SongDance` by hand (`tests/renderer/library/song-editor.test.tsx` and any other, found with `npm run typecheck`) by adding `sameAsSong: false`.
- [ ] **Step 5:** Commit `feat: a dance named like its song follows the song's rename`.

### Task 2: The song editor shows "Same as song"

**Files:**
- Modify: `src/renderer/src/library/fields.tsx` (`FieldProps` gains optional `readOnly?: boolean`, passed to Mantine's `readOnly` on `TextField` only), `src/renderer/src/library/SongEditor.tsx` (the Dance name field, ~line 187)
- Test: `tests/renderer/library/song-editor.test.tsx`

**Interfaces:**
- Consumes: `SongDance.sameAsSong` (Task 1).
- Produces: in the card of a song's **default** dance (`d.isDefault`) with `songCount === 1`, a Mantine `Checkbox` labelled **Same as song** appears beside the **Dance name** entry. It is checked when `d.sameAsSong` is true and the dance is not unlocked; then the name entry is read-only. Unchecking it (editor state keyed by `danceId`, cleared when `songId` changes) makes the entry editable. The box stays after the name is edited away from the title, unchecked. **Checking it** removes the dance from the unlocked set and, when the name differs from the song's title, calls `library:updateDance` with `{ name: <song title> }` so the dance is the same as the song again. A dance that is not the default, or has `songCount > 1`, has neither the checkbox nor a read-only entry.

- [ ] **Step 1: Write failing tests** (in `song-editor.test.tsx`; build the detail with one dance `sameAsSong: true` and the existing fixtures' other dance `false`):
  - `'a dance named like its song shows Same as song, checked, with a read-only name'`: the checkbox is checked within that dance's group, and `getByLabelText('Dance name')` is `readOnly` (`toHaveAttribute('readonly')`).
  - `'a dance with a different name shows the box unchecked, with an editable name'`; `'checking it sets the dance's name back to the song's title'` (one `library:updateDance` call with `{ name }` equal to the song's title); `'checking it when the names are already equal (after unchecking) only locks the entry and makes no call'`.
  - `'a dance used by several songs has no checkbox and an editable name'`.
  - `'unchecking Same as song makes the name editable'`: after clicking the checkbox it is unchecked and the entry has no `readonly`; editing it and leaving the field calls `library:updateDance` with the new name.
  - `'only the default dance of a song with several dances has the box'`: with two dances, the default one shows it (a one-song dance) and the other does not; `'when the default changes, the box is on the new default'` (re-render the editor with the detail's `isDefault` flags swapped).
  - `'editing the name away from the title keeps the box, unchecked'` (the reloaded dance has `sameAsSong: false`, the box is still there).
  - `'a read-only name can't be saved'`: typing is ignored and no `library:updateDance` call is made.
- [ ] **Step 2:** Run `npx vitest run tests/renderer/library/song-editor.test.tsx` — expect FAIL.
- [ ] **Step 3:** Implement the `readOnly` prop and the checkbox. The unlocked dance ids are a `Set<number>` in `SongEditor` state, reset in the existing effect that runs when `songId` changes.
- [ ] **Step 4:** Run `npx vitest run tests/renderer` and `npm run typecheck` — expect PASS and clean.
- [ ] **Step 5:** Commit `feat: Same as song for a dance's name in the song editor`.

### Task 3: End-to-end, docs and the hardware checklist

**Files:**
- Modify: `e2e/app.spec.ts`, the main spec (§4 Labels note and §6.3), the 0.3.0 spec (§2 row 3.5 → Built, §7 question 1), `AGENTS.md`, `CHANGELOG.md`, `docs/manual-testing/pre-release-hardware.md`

- [ ] **Step 1:** e2e test `'renaming a song renames its same-named dance'`: on the Music page select **Hora** (click its row), in the editor's **Song** section set **Title** to `Hora Nova` and leave the field; expect the library row to read `Hora Nova` (one name, not `Hora ♪ Hora Nova`) and the dance card's **Same as song** box to be checked with the **Dance name** entry showing `Hora Nova` and read-only. Run `npm run test:e2e` (ask the user first: it takes over their screen) — expect all pass.
- [ ] **Step 2:** Docs: main spec §6.3 gets a bullet "**Same as song:** a dance linked to one song has a **Same as song** box, checked (with a read-only name) while the names match; renaming the song renames the dance. Unchecking makes the name editable, and checking it sets the dance's name back to the song's." The 0.3.0 spec marks §3.5 built (Plan 14) and question 1 "built as recommended (derived); revisit if a persistent opt-out is wanted".
- [ ] **Step 3:** AGENTS.md decision (dated, newest first): "**'Same as song' is derived, not stored, and belongs to the song's default dance.** A default dance is 'same as song' when it is linked to exactly one song and its name equals the song's title (case and spaces ignored, `sameName`); `getSongDetail` reports it as `sameAsSong` and `updateSong` renames that dance in the same transaction. Why: no schema change or data conversion, the rule is the one labels already use, and the default dance is the one shown for the song in the lists. The box shows for the default dance when it has one song, and checking it sets the dance's name to the song's. Consequence: unchecking while the names are still equal lasts only for the editor session, so a song renamed before the dance is edited still carries the dance along; a song's other dances never follow. _Rejected:_ a stored flag (a migration and a conversion for existing songs, for a case that rarely matters); renaming dances shared with other songs."
- [ ] **Step 4:** CHANGELOG under Unreleased → Added: "In the song editor, a dance used by one song has a **Same as song** box on its default dance: while it is checked the dance's name can't be edited, and renaming the song renames the dance too. Uncheck it to name the dance separately; check it again to set the dance's name back to the song's."
- [ ] **Step 5:** Hardware checklist item (section I): "Rename a song whose dance has the same name: the dance (and the library row, and a program item) follow; the Dance name entry is read-only while **Same as song** is checked, and editable after unchecking it. A dance used by two songs shows no checkbox." Run `npx prettier --check .`, `npm run typecheck`, `npx vitest run` — expect clean.
- [ ] **Step 6:** Commit `docs: describe Same as song`.

## Self-Review

- **Spec coverage:** the checkbox for a dance linked to one song with an equal name, the read-only entry, following the song's rename, a shared dance never following, merges and second links ending it by themselves (the dance then has two songs, so `sameAsSong` is false), search and labels staying right, and the listed tests → Tasks 1–3.
- **Types:** `sameName`, `SongDance.sameAsSong` and `updateSong` (Task 1) are what Task 2 and the e2e test use.
- **Decision recorded:** question 1 is built as recommended (derived), with the maintainer's addition that the box stays for the default dance of a song when that dance has one song, and checking it restores the song's name (2026-10-19). A persistent opt-out while the names are equal would be a stored flag and a migration (a later, separate change).
