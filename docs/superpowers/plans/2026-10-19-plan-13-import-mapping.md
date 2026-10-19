# Folk Dance Player — Plan 13: Import mapping chosen per destination (0.3.0, PR 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The import mapping asks, for each destination (Artist, Teacher, Choreographer), which tag feeds it: the Artist tag, the Album Artist tag, or neither. Two tags can no longer be set to feed one field.

**Architecture:** `ImportMapping` changes shape from "where does each tag go" to "where does each field come from". `mapTags` becomes a plain pick per destination (the "artist tag wins" tie-break disappears because a conflict can't be expressed). Three new settings replace the two old ones, converted by migration `005-import-mapping`. The renderer's four copies of "settings ↔ mapping" are replaced by two shared helpers.

**Tech Stack:** As Plans 1–12. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-18-release-0-3-0-design.md` §3.4 (and §4 for the migration). Main spec §5.2 is updated by this plan.

## Global Constraints

- Test-first (Vitest); conventional-commit messages; one commit per task; a `CHANGELOG.md` line under `Unreleased` in the same commit as the user-facing change.
- No released migration is edited; this is a new migration. The next free number is **005** (the 0.3.0 spec's table says 006 because it was written before the numbering was settled; this plan updates the spec's §4 so the attachments migration becomes 006 and Holding 007).
- Settings are JSON per key, validated on write and read; a corrupt stored value falls back to the default (AGENTS.md).
- UI from Mantine components; no custom CSS needed.
- Defaults equal today's behavior: `artistFrom: 'artistTag'`, `teacherFrom: 'ignore'`, `choreographerFrom: 'ignore'`, `genreIsCountry: true`.
- Conversion rule when an old mapping sent both tags to one destination: **the Artist tag keeps it; the Album Artist tag's mapping is dropped** (spec §3.4, confirmed by the maintainer).
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Every old combination converts to the same behavior, including both tags to one destination, both `ignore`, and only one of the two old keys being stored (the other is its default).
- An old key holding a corrupt or unknown value (for example `"composer"`) is treated as its default, not copied.
- A user who never changed the mapping gets no new settings rows, and keeps getting the defaults.
- One tag feeding two destinations works end to end (an import, Re-apply and a sync's tag rule).
- A tag that is empty for a song: the destination is empty, not the other tag's value.
- Re-apply still overwrites only destinations whose source is not "Ignore", and still skips a default dance shared with other songs.
- Apple Music sync's baseline rule gives the same results with the same effective mapping (old shape vs new shape).
- A database already at version 5 (a user who opens the new version twice) is not converted twice; the migration is idempotent by version.

## File Structure

- Create `src/main/db/migrations/005-import-mapping.ts`; modify `migrations/index.ts`.
- Modify `src/shared/settings.ts` (`TagSource`, three settings, validators; remove `TagTarget` and the two old keys), `src/shared/import.ts` (`ImportMapping`, `mappingFromSettings`, `mappingSettings`).
- Modify `src/main/import/mapping.ts`, `src/main/library/mapping.ts`, `src/main/import/import-service.ts` (`savedMapping`).
- Modify renderer: `import/ImportMappingFields.tsx`, `import/useImportFlow.ts`, `apple-sync/useAppleSyncFlow.ts`, `library/ReapplyDialog.tsx`, `pages/SettingsPage.tsx`.
- Tests: `tests/main/db/migration-005.test.ts`; update the tests listed in Tasks 2–3.

---

### Task 1: Migration 005

**Files:**
- Create: `src/main/db/migrations/005-import-mapping.ts` (`export const importMapping: Migration`, version 5, name `'import-mapping'`); modify `src/main/db/migrations/index.ts` (append it)
- Test: `tests/main/db/migration-005.test.ts`

**Interfaces:**
- Produces: after migration, the `settings` table holds `import.artistFrom`, `import.teacherFrom` and `import.choreographerFrom` (JSON strings `"artistTag"`, `"albumArtistTag"` or `"ignore"`) when either old key `import.artistTagTarget` / `import.albumArtistTagTarget` was stored, and neither old key remains. `import.genreIsCountry` is untouched. When neither old key was stored, no rows are written.

- [ ] **Step 1: Write failing tests** in `migration-005.test.ts`, in the style of `migration-004.test.ts` (migrate `MIGRATIONS.slice(0, 4)`, insert old settings rows with `INSERT INTO settings (key, value) VALUES (?, ?)` using JSON-encoded values, then `migrate(db, MIGRATIONS)` and read the settings rows back):
  - `'applies as version 5'`: `migrate` returns `{ from: 4, to: 5 }`; `getSchemaVersion` is 5.
  - A `test.each` over these (stored artist key, stored album key) → (artistFrom, teacherFrom, choreographerFrom). A `null` means the old key was not stored (its default applies: artist → `'artist'`, album → `'ignore'`):
    - `('artist', 'ignore')` → `('artistTag', 'ignore', 'ignore')`
    - `('artist', 'teacher')` → `('artistTag', 'albumArtistTag', 'ignore')`
    - `('choreographer', 'ignore')` → `('ignore', 'ignore', 'artistTag')`
    - `('teacher', 'artist')` → `('albumArtistTag', 'artistTag', 'ignore')`
    - `('artist', 'artist')` (conflict) → `('artistTag', 'ignore', 'ignore')`
    - `('teacher', 'teacher')` (conflict) → `('ignore', 'artistTag', 'ignore')`
    - `('ignore', 'ignore')` → `('ignore', 'ignore', 'ignore')`
    - `(null, 'teacher')` → `('artistTag', 'albumArtistTag', 'ignore')`
    - `('choreographer', null)` → `('ignore', 'ignore', 'artistTag')`
    - `('composer', 'teacher')` (an invalid stored artist value counts as the default `'artist'`) → `('artistTag', 'albumArtistTag', 'ignore')`
  - `'removes the two old keys and leaves genreIsCountry alone'`.
  - `'writes nothing for a database that never changed the mapping'`: no `import.%From` rows after migrating.
  - `'a database already at version 5 is not converted again'`: migrate twice; the second returns `{ from: 5, to: 5 }` and the rows are unchanged.
- [ ] **Step 2:** Run `npx vitest run tests/main/db/migration-005.test.ts` — expect FAIL (migration missing).
- [ ] **Step 3:** Implement the migration in SQL (`sql` string, like migration 003). The rule per destination `d` in `artist`, `teacher`, `choreographer`: let `a` = the stored `import.artistTagTarget` and `b` = the stored `import.albumArtistTagTarget`, each read with `json_valid` + `json_extract` and counted as its default (`'artist'`, `'ignore'`) when absent, not valid JSON, or not one of the four old values; the new value is `'artistTag'` if `a = d`, else `'albumArtistTag'` if `b = d`, else `'ignore'`. Insert the three rows only when at least one old key row exists, then delete the two old keys.
- [ ] **Step 4:** Run the file — expect PASS; run `npx vitest run tests/main/db` — expect PASS (update any test that hard-codes the latest version number).
- [ ] **Step 5:** Commit `feat: migrate the import mapping to one source per destination`.

### Task 2: The new mapping through shared code and main

**Files:**
- Modify: `src/shared/settings.ts`, `src/shared/import.ts`, `src/main/import/mapping.ts`, `src/main/library/mapping.ts`, `src/main/import/import-service.ts:25-31`
- Test: `tests/main/import/mapping.test.ts`, `tests/main/library/mapping.test.ts`, `tests/main/settings/settings-store.test.ts`, `tests/main/import/import-service.test.ts`, and the fixtures that build an `ImportMapping` (`tests/main/import/save-file.test.ts`, `sync-rules.test.ts`, `tests/main/apple-sync/sync-tags.test.ts`, `save-synced.test.ts`, `tests/main/ipc/library-handlers.test.ts`)

**Interfaces:**
- Produces, in `src/shared/settings.ts`: `export type TagSource = 'artistTag' | 'albumArtistTag' | 'ignore'`; settings `'import.artistFrom'`, `'import.teacherFrom'`, `'import.choreographerFrom'` of type `TagSource` with defaults `'artistTag'`, `'ignore'`, `'ignore'`; the old `TagTarget`, `'import.artistTagTarget'` and `'import.albumArtistTagTarget'` are removed.
- Produces, in `src/shared/import.ts`: `interface ImportMapping { artistFrom: TagSource; teacherFrom: TagSource; choreographerFrom: TagSource; genreIsCountry: boolean }`; `mappingFromSettings(s: Settings): ImportMapping`; `mappingSettings(m: ImportMapping): Pick<Settings, 'import.artistFrom' | 'import.teacherFrom' | 'import.choreographerFrom' | 'import.genreIsCountry'>`.
- `mapTags(tags, path, mapping)` keeps its signature and result shape; `reapplyMapping(db, songIds, mapping)` keeps its signature.

- [ ] **Step 1: Write failing tests:**
  - `mapping.test.ts` (rewrite its fixtures to the new shape; default `{ artistFrom: 'artistTag', teacherFrom: 'ignore', choreographerFrom: 'ignore', genreIsCountry: true }`): `'the Artist tag feeds Artist by default'`; `'the Album Artist tag can feed Teacher'` (`teacherFrom: 'albumArtistTag'`); `'one tag can feed two destinations'` (`artistFrom` and `choreographerFrom` both `'artistTag'`: the same value lands in `song.artist` and `dance.choreographer`); `'an empty tag leaves its destination empty'` (`teacherFrom: 'albumArtistTag'` with a null album artist → `teacher` null even when the artist tag has a value); `'Ignore leaves a destination empty'`; `'Genre is Country still copies the genre'`.
  - `library/mapping.test.ts`: `'Re-apply overwrites only destinations that have a source'` (with `teacherFrom: 'ignore'` an existing teacher is left alone; with `'albumArtistTag'` it is replaced) and `'a shared default dance is still skipped and counted'`; adjust the existing cases to the new fixtures.
  - `settings-store.test.ts`: the three keys default to `'artistTag'`, `'ignore'`, `'ignore'`; `store.set('import.teacherFrom', 'composer')` throws `InvalidSettingError`; the old keys are now unknown settings (`store.set('import.artistTagTarget', 'artist')` throws).
  - `import-service.test.ts` (the test that sets `import.albumArtistTagTarget`, line ~66): sets `import.teacherFrom` to `'albumArtistTag'` and still expects the Album Artist tag to become the teacher.
  - A new `shared` test `tests/shared/import-mapping.test.ts`: `mappingFromSettings(DEFAULT_SETTINGS)` equals the defaults above; `mappingSettings(m)` round-trips: `mappingFromSettings({ ...DEFAULT_SETTINGS, ...mappingSettings(m) })` equals `m`.
- [ ] **Step 2:** Run `npx vitest run tests/main tests/shared` — expect FAIL.
- [ ] **Step 3:** Implement. `mapTags`: for each destination pick `clean(tags.artist)` / `clean(tags.albumArtist)` / `null` by its `*From`; delete the tie-break loop and its comment. `reapplyMapping`: a destination is targeted when its `*From` is not `'ignore'` (replace the `targets` set). `savedMapping` uses `mappingFromSettings(settings.getAll())`. Validators: one `isTagSource` for the three keys. Update the other fixtures to the new shape.
- [ ] **Step 4:** Run `npx vitest run tests/main tests/shared` — expect PASS. (`npm run typecheck:web` fails until Task 3 updates the renderer; that is expected here.)
- [ ] **Step 5:** Commit `feat: choose each field's source tag in the import mapping`.

### Task 3: The renderer asks per destination

**Files:**
- Modify: `src/renderer/src/import/ImportMappingFields.tsx`, `src/renderer/src/import/useImportFlow.ts:55-70`, `src/renderer/src/apple-sync/useAppleSyncFlow.ts:75-100`, `src/renderer/src/library/ReapplyDialog.tsx:30-37`, `src/renderer/src/pages/SettingsPage.tsx:55-70`
- Test: `tests/renderer/music-import.test.tsx`, `tests/renderer/settings-page.test.tsx`, `tests/renderer/apple-sync/apple-sync-controls.test.tsx`, `tests/renderer/library/music-page.test.tsx`

**Interfaces:**
- Consumes: `ImportMapping`, `mappingFromSettings`, `mappingSettings` (Task 2).
- Produces: `ImportMappingFields` shows three Mantine `Radio.Group`s labelled **Populate Artist from**, **Populate Teacher from** and **Populate Choreographer from**, each with the options **Artist tag**, **Album Artist tag**, **Ignore**, and the existing **Genre is Country** switch. Each radio's accessible name is `<Destination> from <Option>` (for example `Teacher from Album Artist tag`). Every place that read or saved the four old settings uses the two helpers instead: loading is `mappingFromSettings(await api.invoke('settings:getAll'))`; saving writes each entry of `mappingSettings(mapping)` whose value changed through `settings:set`.

- [ ] **Step 1: Write failing tests** (update the existing assertions that name the old radios and keys):
  - `music-import.test.tsx` (~line 85): choose `Teacher from Album Artist tag`, import, and expect `fake.settings['import.teacherFrom']` to be `'albumArtistTag'`.
  - `settings-page.test.tsx` (~line 105): `'saves the import mapping defaults'` clicks `Teacher from Album Artist tag` and expects the call `['settings:set', 'import.teacherFrom', 'albumArtistTag']`; a new `'shows each destination with one source and defaults'`: the checked radios are `Artist from Artist tag`, `Teacher from Ignore`, `Choreographer from Ignore`.
  - `music-page.test.tsx` (~line 277, the Re-apply dialog): the dialog starts from the saved settings (set `import.choreographerFrom` to `'artistTag'` in `fake.settings` first and expect `Choreographer from Artist tag` checked), and confirming sends a mapping with the new shape to `library:reapplyMapping`.
  - `apple-sync-controls.test.tsx` (~line 64): turning sync on saves the mapping through `settings:set` for `import.artistFrom` (and any changed key).
  - `ImportMappingFields` (a short new test in `tests/renderer/import-mapping-fields.test.tsx` or inside an existing file): one tag may feed two destinations (checking `Choreographer from Artist tag` leaves `Artist from Artist tag` checked), and each group has exactly three radios.
- [ ] **Step 2:** Run `npx vitest run tests/renderer` — expect FAIL.
- [ ] **Step 3:** Implement the component and replace the four read/save blocks with the helpers (the SettingsPage's per-key `save` loop and the flows' sequential `settings:set` both iterate `mappingSettings`).
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck` — expect PASS and clean.
- [ ] **Step 5:** Commit `feat: ask which tag feeds Artist, Teacher and Choreographer`.

### Task 4: Docs and the hardware checklist

**Files:**
- Modify: `docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md` (§5.2 and the settings-keys list in §4), the 0.3.0 spec (§2 table row 3.4 → Built, §4 migration numbers, §5), `AGENTS.md`, `CHANGELOG.md`, `docs/manual-testing/pre-release-hardware.md`

- [ ] **Step 1:** Main spec §5.2: replace the two "tag goes to" bullets with three "**Populate Artist / Teacher / Choreographer from:** Artist tag | Album Artist tag | Ignore" bullets and one sentence that a tag may feed several fields but a field has exactly one source; update the settings keys in §4 (`import.artistFrom`, `import.teacherFrom`, `import.choreographerFrom`) and the Re-apply paragraph ("overwrites the fields that have a source").
- [ ] **Step 2:** 0.3.0 spec: mark §3.4 built (Plan 13), renumber the migrations table (`005-import-mapping`, `006-dance-attachments`, `007-holding-items`) and the matching mentions in §3.6, §3.7 and §3.12 (`grep -n "00[567]" docs/superpowers/specs/2026-10-18-release-0-3-0-design.md`).
- [ ] **Step 3:** AGENTS.md decision (dated, newest first): "The import mapping is per destination: `import.artistFrom`, `import.teacherFrom`, `import.choreographerFrom`, each `artistTag | albumArtistTag | ignore`." Why: two tags could be set to one field, which has no sensible meaning, and one tag could not feed two fields; one source per destination makes the bad state unrepresentable, so no validation. Migration 005 converts saved settings; where both old tags targeted one field the Artist tag kept it. _Rejected:_ keeping tag-to-target and validating.
- [ ] **Step 4:** CHANGELOG under Unreleased → Changed: "The import mapping now asks, for Artist, Teacher and Choreographer, which tag fills each (the Artist tag, the Album Artist tag, or neither). Your saved choices are converted automatically."
- [ ] **Step 5:** Hardware checklist item (section I): "Import a few songs with the new mapping (for example Teacher from the Album Artist tag): the fields fill from the chosen tags. Open Settings, then relaunch: the choices were kept. A library whose mapping was changed in 0.2.0 shows the equivalent choices." Run `npx prettier --check .`, `npm run typecheck`, `npx vitest run` — expect clean.
- [ ] **Step 6:** Commit `docs: describe the per-destination import mapping`.

## Self-Review

- **Spec coverage:** §3.4's new shape, three radio groups, defaults equal to today's, settings migration including the conflict rule, Re-apply starting from saved settings with the same three choices, Apple sync's baseline reading the new shape (via `mapTags`), doc updates, and tests for each source/destination pairing, the migration per old combination, the radio groups and Re-apply → Tasks 1–4.
- **Types:** `TagSource`, `ImportMapping`, `mappingFromSettings`, `mappingSettings` (Task 2) are what Task 3 consumes; the settings key names are identical in every task.
- **Deliberate ordering:** `npm run typecheck:web` is red between Tasks 2 and 3 because the renderer still reads the removed keys; Task 3 restores it.
- **Open for the maintainer:** none; the conflict rule (Artist tag wins) was confirmed. The option labels ("Artist tag", "Album Artist tag", "Ignore") are the spec's.
