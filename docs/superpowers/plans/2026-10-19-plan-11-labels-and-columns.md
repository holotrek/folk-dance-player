# Folk Dance Player — Plan 11: Dance ♪ Song labels and Artist/Choreographer columns (0.3.0, PR 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every list names a dance with its song as `Dance ♪ Song` (Now Playing keeps two lines), and the Music table and the Program page's library list gain Artist and Choreographer columns.

**Architecture:** `formatLabel` in `src/shared/labels.ts` is the single source of the one-line text, so the format change is one function plus test expectations. Now Playing in the player bar renders `track.parts` instead of `track.label`. The columns are display plus one new sort key (`artist`); main's `SORT_SQL` gains it and a better `dance` sort.

**Tech Stack:** As Plans 1–10 (Electron, React, Mantine, `node:sqlite`, Vitest). No new dependencies, no migration.

**Spec:** `docs/superpowers/specs/2026-10-18-release-0-3-0-design.md` §3.2, §3.3 (and §5 item 2). Also read main spec §4 (Labels) and §6.2–6.3, which this plan updates. §3.1 (PR #28) is independent; this PR does not depend on it.

## Global Constraints

- Test-first (Vitest); conventional-commit messages; one commit per task.
- UI from Mantine components; custom CSS only in co-located `*.module.css`.
- No new dependency; no migration (AGENTS.md: released migrations are never edited).
- Add a `CHANGELOG.md` line under `Unreleased` in the same commit as each user-facing change.
- Label rules that stay: the song is left out when it equals the dance name (case/space-insensitive); the choreographer shows only when the song's linked dances have more than one.
- Choreographer stays attached to the dance: `Dance (Choreographer) ♪ Song` (spec §3.2, my call).
- Everything is **one line** except Now Playing (control window and projector), which stays two lines.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A song with no dance at all (`danceName` null): label is just the song title, with no stray ` ♪ `.
- A dance whose name matches the song but with a choreographer shown (`choreographerCount > 1`): `Svornato (Jaap Leegwater)`, no ♪.
- Sorting by dance when the row has no dance: it falls back to the song title rather than sorting blank rows together arbitrarily.
- Songs with null artist / choreographer sort last in both directions' blank handling (the existing `IS NULL OR = ''` rule) and render an empty cell, not "null".
- Long artist/choreographer text truncates with an ellipsis and a tooltip, and as the Program-page list narrows, columns disappear completely in the decided order (below); the Dance / Song column is never squeezed below its minimum and is never hidden.

## File Structure

- Modify `src/shared/labels.ts` — new `formatLabel`.
- Modify `src/shared/program.ts` — `Track.label` comment.
- Modify `src/renderer/src/program/PlayerBar.tsx` (+ `PlayerBar.module.css`) — two-line Now Playing.
- Modify `src/shared/library.ts` — add `'artist'` to `SortColumn`.
- Modify `src/main/library/list.ts` — `SORT_SQL.dance`, `SORT_SQL.artist`.
- Modify `src/renderer/src/library/LibraryTable.tsx` (+ `.module.css`) — columns, `data-column` hooks, container-query collapse, header rename, default sort.
- Modify `src/renderer/src/library/library-store.ts`, `src/renderer/src/program/HoldingPanel.tsx` — `title` sort → `dance` where it is the default.
- Update tests (named per task), `CHANGELOG.md`, main spec §4/§6, `AGENTS.md`.

---

### Task 1: The new one-line label

**Files:**
- Modify: `src/shared/labels.ts:33-37`, `src/shared/program.ts:18`
- Test: `tests/shared/labels.test.ts`

**Interfaces:**
- Produces: `formatLabel(parts: LabelParts): string` returning `Dance`, `Dance (Choreographer)`, `Dance ♪ Song`, or `Dance (Choreographer) ♪ Song`. `labelParts`/`LabelParts` unchanged.

- [ ] **Step 1: Rewrite the `test.each` expectations in `tests/shared/labels.test.ts`:**
  - `'Hora de la Munte', 'Hora Mare', null, 0` → `'Hora Mare ♪ Hora de la Munte'`
  - `'Svornato', 'Svornato', 'Jaap Leegwater', 2` → `'Svornato (Jaap Leegwater)'`
  - `'Pusteno Ludo', 'Pravo Rhodopsko Oro', 'Yves Moreau', 2` → `'Pravo Rhodopsko Oro (Yves Moreau) ♪ Pusteno Ludo'`
  - `'Hora Fetelor', 'Hora Fetelor', 'Someone', 1` → `'Hora Fetelor'`
  - New test `'a song with no dance is just its title'`: `danceName: null` → `formatLabel(...) === 'Solo Song'`.
- [ ] **Step 2:** Run `npx vitest run tests/shared/labels.test.ts` — expect FAIL on the changed rows.
- [ ] **Step 3:** Change `formatLabel` to build `main = choreographer ? "dance (choreographer)" : dance`, then append ` ♪ ${song}` when `parts.song`. Update the comments on `formatLabel` and `Track.label` to `"Dance (Choreographer) ♪ Song"`.
- [ ] **Step 4:** Run the same test — expect PASS.
- [ ] **Step 5:** Commit `feat: name a dance before its song in labels` (tests elsewhere are fixed in Task 2, so commit with Task 2 if you prefer a green tree per commit).

### Task 2: Update every expectation that uses the old text

**Files:**
- Modify (test expectations only): the ~20 files that assert `Song | Dance` text — find them with `grep -rlE "\w \| \w" tests`; the main ones are `tests/main/library/list.test.ts`, `edit.test.ts`, `tests/main/programs/programs.test.ts`, `history.test.ts`, `tests/main/projector/snapshot.test.ts`, `projector-feed.test.ts`, `tests/main/session/player-session.test.ts`, `tests/main/ipc/library-handlers.test.ts`, `tests/main/helpers/library-fixtures.ts`, `tests/renderer/program/*.tsx`, `tests/renderer/library/*.tsx`. Some matches are unrelated `|` in strings; change only label assertions.

- [ ] **Step 1:** Run `npm test` (or `npx vitest run`) — record the failing files.
- [ ] **Step 2:** For each failure, rewrite the expected label to the new form (`'Song | Dance'` → `'Dance ♪ Song'`; the choreographer moves with the dance). Where a fixture hand-builds a `label` string rather than calling `formatLabel`, update the fixture to match so renderer tests read like real data.
- [ ] **Step 3:** Run the full suite — expect PASS (apart from tests changed by later tasks, none yet).
- [ ] **Step 4:** Commit `feat: name a dance before its song in labels` (with Task 1) and add the CHANGELOG line under Unreleased → Changed: "Dances are named before their song everywhere (`Dance ♪ Song`)."

### Task 3: Now Playing in the player bar on two lines

**Files:**
- Modify: `src/renderer/src/program/PlayerBar.tsx:41-56,186-206`, `src/renderer/src/program/PlayerBar.module.css`
- Test: `tests/renderer/program/player-bar.test.tsx`

**Interfaces:**
- Consumes: `NowPlaying.track.parts: LabelParts` (`{ song, dance, choreographer }`), `track.country`.
- Produces: while a song is loaded (`player.current`), `data-testid="player-title-name"` holds the dance (with `(Choreographer)` when `parts.choreographer`), a new `data-testid="player-song"` holds `♪ <song>` and exists only when `parts.song`; the existing detail line (country) stays. "Next up:" / "Next:" lines keep using `nextUp.label` (one line).

- [ ] **Step 1: Write failing tests** in `player-bar.test.tsx`:
  - `'playing: the dance is the title and ♪ song is a smaller line under it'` — a track whose `parts` is `{ dance: 'Pravo Rhodopsko Oro', song: 'Pusteno Ludo', choreographer: null }`: `player-title-name` has text exactly `Pravo Rhodopsko Oro`; `player-song` has `♪ Pusteno Ludo`.
  - `'playing: no ♪ line when song and dance match'` — `parts.song: null` → `queryByTestId('player-song')` is null.
  - `'playing: the choreographer stays with the dance'` — `parts.choreographer: 'Yves Moreau'` → title text `Pravo Rhodopsko Oro (Yves Moreau)`.
  - Keep the existing country and `/^Hora$/` assertions passing (adjust the `track()` fixture in `tests/renderer/program/fixtures.ts` so `parts` is derived from title/dance).
- [ ] **Step 2:** Run `npx vitest run tests/renderer/program/player-bar.test.tsx` — expect FAIL.
- [ ] **Step 3:** In `status()`, when `player.current`, return `name` from `parts` (dance + optional choreographer) and a new `song: string | null` field; render it in `.now` as a `<Text size="xs" c="dimmed" data-testid="player-song" className={classes.label}>` between the title and the country detail. Keep country as `detail`. Check the bar still fits (two short dimmed lines under the title are acceptable; if the bar grows, put the song and country on one line separated by a gap).
- [ ] **Step 4:** Run the test file — expect PASS.
- [ ] **Step 5:** Commit `feat: show Now Playing as dance with ♪ song beneath`.

### Task 4: Library column "Dance / Song", sorted by dance then song

**Files:**
- Modify: `src/main/library/list.ts:19-29`, `src/renderer/src/library/LibraryTable.tsx:32-36,96`, `src/renderer/src/library/library-store.ts:36`, `src/renderer/src/program/HoldingPanel.tsx:13`
- Test: `tests/main/library/list.test.ts`, `tests/renderer/program/program-page.test.tsx:53`, `tests/renderer/library/music-page.test.tsx`

**Interfaces:**
- Produces: `SORT_SQL.dance = "COALESCE(NULLIF(trim(d.name), ''), s.title) COLLATE NOCASE"` (a song with no dance sorts by its title, the name it is shown under). The existing tie-break `s.title COLLATE NOCASE, s.id` supplies "then song". The first column's `sort` key becomes `'dance'`; its header label is `Dance / Song`.

- [ ] **Step 1: Write failing tests:**
  - `list.test.ts` — `'sorting by dance orders by dance name, then song title, and a dance-less song by its title'`: three songs (dance "Alunelul" with songs "Zeta" and "Alpha"; a dance-less song titled "Beta"); asc gives Alpha, Zeta (both Alunelul), then Beta… confirm the exact expected order from the fixture helpers in `tests/main/helpers/library-fixtures.ts`.
  - Renderer tests: header reads `['', 'Dance / Song ▲', 'Country', 'Teacher', 'Time', '']` style (update `program-page.test.tsx:53`, and the Music page header assertions in `music-page.test.tsx`).
- [ ] **Step 2:** Run those files — expect FAIL.
- [ ] **Step 3:** Implement: change `SORT_SQL.dance`; set the first column to `sort: 'dance', label: 'Dance / Song'` and update `COMPACT`'s string; change `TITLE_SORT` in `library-store.ts` (rename to `DEFAULT_SORT`) and HoldingPanel's sort to `column: 'dance'`. Check `grep -rn "'title'" src` for any other place that assumes the default sort is `title` (e.g. playlists falling back with `SORT_SQL.title` in `list.ts:80` — leave that fallback alone only if a test depends on it; otherwise use `dance`).
- [ ] **Step 4:** Run `npx vitest run tests/main/library tests/renderer` — expect PASS.
- [ ] **Step 5:** Commit `feat: sort the library by dance, then song`.

### Task 5: Artist and Choreographer columns

**Files:**
- Modify: `src/shared/library.ts:11-20`, `src/main/library/list.ts:19`, `src/renderer/src/library/LibraryTable.tsx:19-56,95-97`, `src/renderer/src/library/LibraryTable.module.css`
- Test: `tests/main/library/list.test.ts`, `tests/renderer/library/music-page.test.tsx`, `tests/renderer/program/program-page.test.tsx`

**Interfaces:**
- Produces: `SortColumn` gains `'artist'`; `SORT_SQL.artist = 's.artist COLLATE NOCASE'`. `LibraryRow.artist` and `.choreographer` already exist.
- Column order, Music page: `''`, Dance / Song, **Artist**, Country, Teacher, Choreographer, Type, Difficulty, Time. Program page (compact): `''`, Dance / Song, Country, Teacher, **Artist**, **Choreographer**, Time.

- [ ] **Step 1: Write failing tests:**
  - `list.test.ts` — `'sorts by artist, blanks last'`: three songs with artists "Zoran", "alma", none; asc → alma, Zoran, none; desc → Zoran, alma, none.
  - `music-page.test.tsx` — column headers include `Artist` directly after `Dance / Song`; a row shows its artist; clicking the Artist header sorts (`library:list` called with `sort: { column: 'artist', direction: 'asc' }`).
  - `program-page.test.tsx` — the Artist, Teacher, Choreographer, Country and Time headers and cells carry `data-column` values `artist`, `teacher`, `choreographer`, `country`, `time` (jsdom has no container queries, so the collapse itself is checked on hardware); compact headers equal `['', 'Dance / Song ▲', 'Country', 'Teacher', 'Artist', 'Choreographer', 'Time', '']`; an artist cell has a `title` attribute with its full text.
- [ ] **Step 2:** Run the three files — expect FAIL.
- [ ] **Step 3:** Implement: add the `artist` column (`sort: 'artist'`, renders `r.artist`) after the first column in `ALL_COLUMNS`; extend `COMPACT` with `'Artist'`; build `COMPACT_COLUMNS` by mapping an ordered label list rather than filtering, since the compact order differs from `ALL_COLUMNS`. Render text cells with `title={text ?? undefined}`. Give each `Column` a `key` (`'artist'`, `'teacher'`, `'choreographer'`, `'country'`, `'time'`, …) and render it as `data-column` on its header and cell so CSS can target it.
  - **Collapse order (decided by the maintainer), compact list only:** as the list narrows, columns disappear completely in this order: **Artist, then Teacher, then Choreographer, then Country, then Time**. Dance / Song and the favorite and ⋯ columns never collapse.
  - **How:** make `.table` a size container (`container-type: inline-size`). Build each row's `grid-template-columns` from custom properties, one per column (for example `--col-artist: minmax(60px, 1fr)`), and use `@container (max-width: …)` rules that set a column's property to `0px` and its `[data-column]` cells to `visibility: hidden; padding: 0; overflow: hidden`. Set the grid's `column-gap` to 0 and give cells inline padding instead, so a collapsed track leaves no gap. One breakpoint per column, each at the width where the remaining columns' minimums no longer fit; keep the breakpoints in one commented block. Apply the same properties to the `.numbered` variant instead of duplicating its template.
  - The Music page (non-compact) never collapses columns; it scrolls as today.
- [ ] **Step 4:** Run `npx vitest run tests/main/library tests/renderer` — expect PASS.
- [ ] **Step 5:** Commit `feat: Artist and Choreographer columns`; add CHANGELOG line: "The Music page shows an Artist column; the Program page's library list shows Artist and Choreographer."

### Task 6: Docs, end-to-end and the hardware checklist

**Files:**
- Modify: `docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md` (§4 label table and line ~136, §6.3 line ~332 "Song / Dance"), `AGENTS.md`, `docs/manual-testing/pre-release-hardware.md`, `e2e/` specs that read the old label text (`grep -rn " | " e2e`)

- [ ] **Step 1:** Update the main spec's §4 table and §6 column list to the new label and columns; in the 0.3.0 spec's §2 table nothing changes until release.
- [ ] **Step 2:** Add an AGENTS.md decision (newest first, dated 2026-10-19): "Labels read `Dance (Choreographer) ♪ Song`; the library's first column sorts by dance then song." Why: one name in every list, matching the projector. _Rejected:_ keeping `Song | Dance` in the lists only.
- [ ] **Step 3:** Fix e2e expectations; run `npm run typecheck`, `npm run lint`, `npm test`, then `npm run test:e2e` (ask the user first if the run will take over their screen — project memory).
- [ ] **Step 4:** Add to the hardware checklist: Now Playing's two lines on the control bar and projector for a dance with a different song name; the Program page list narrowed step by step, with columns vanishing in the order Artist, Teacher, Choreographer, Country, Time. Record the collapse order and the §7.7 answer in the 0.3.0 spec (§3.3 Open → Decided) and in the AGENTS.md decision.
- [ ] **Step 5:** Commit `docs: describe the Dance ♪ Song labels and new columns`.

## Self-Review

- **Spec coverage:** §3.2 → Tasks 1–4 (format, Now Playing, rename and sort; the projector already renders `parts.song`, confirmed in `ProjectorView.tsx`, so it needs no change). §3.3 → Task 5. §6 docs → Task 6.
- **Decided by the maintainer (2026-10-19):** Program-page columns collapse in the order Artist, Teacher, Choreographer, Country, Time (answers the spec's §3.3 open question; record it in the spec). The default sort moving to dance, and `Dance (Choreographer) ♪ Song` (§7.7), were both confirmed.
- **Not in this PR:** §3.1 (PR #28).
