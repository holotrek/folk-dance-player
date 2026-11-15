# Slide picker dropdown (Plan 31) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** In the dance's slide link dialog, choose the slide from a searchable dropdown whose options read "12 · Hava Nagila", instead of typing a slide number. Typing part of a title (or a number) narrows the list. Slides without a title are pickable by position.

**Architecture:** Renderer only. `SlideLinkDialog` already holds `pages: CanvaPage[]` (`{ id, title: string | null }`, from `canva:deckPages`), so no channel, main or migration change. The `NumberInput` plus title text is replaced by a Mantine `Select` (`searchable`) whose option value is the slide's **page ID** and whose label is `${position} · ${title ?? 'Untitled slide'}`. On Link, the position is looked up from the current `pages` list (`pages.findIndex(id) + 1`) and sent to the unchanged `canva:linkSlide(danceId, deckId, position)`. The saved link is still the page ID; position is still looked up from the deck's current list.

**Spec:** Issue #106 (not in the 1.0.0 spec yet; add a line to it).

## Global Constraints

- Main owns all state; no new IPC channel, no migration.
- UI from Mantine (`Select`); custom CSS only in a co-located `*.module.css`, and none is expected.
- Test first (Vitest). Conventional commits. CHANGELOG line under Unreleased in the same commit. Agents run unit tests, typecheck, `prettier --check .` and build (no e2e).

## Findings

- The renderer already receives every slide's title (`CanvaPage.title`, null when untitled); today it shows `page.title ?? 'Untitled slide'` beside the number.
- `SlideLinkDialog` keeps a selected `position`; `typed` ref stops the dance's current slide from re-setting it once the person chose. The "start on the current slide and follow it after a re-read" effect (`initialPageId`) must survive.
- Re-read: `canva:refreshDecks` then `canva:decks`, then `reread` bumps and `canva:deckPages` is fetched again. The dialog stays usable meanwhile.
- Only `tests/renderer/library/dance-slide.test.tsx` references "Slide number" (lines 59, 87, 102, 120, 132). No e2e spec and no tour step types a slide number (tour has no Canva steps: Canva isn't in the practice library).
- Mantine `Select` has `searchable`, `limit`, `nothingFoundMessage`, `filter`; `Autocomplete` in `fields.tsx` is for free text, not for picking an existing item, so `Select` is the right fit.

## Decisions made in this plan

- **Select, not Autocomplete:** the value must be one of the deck's slides.
- **Option value = page ID (string), not position:** duplicate titles stay distinct, and the selection follows the slide when a re-read renumbers the deck. The label is rebuilt from the current list each render, so the shown number updates after a re-read.
- **Label:** `12 · Hava Nagila`; untitled: `12 · Untitled slide`. Searching "12" or "hava" both match (default label filter, case-insensitive; set `filter` to also fold diacritics only if cheap, else leave).
- **Selection state:** `pageId: string | null` replaces `position`. Starts on `initialPageId` when it is in the deck (same deck), else on the first slide of the deck; reset to the first slide when the deck changes (as `position` reset to 1 before); `typed` ref keeps its meaning.
- **Gone slide:** if `initialPageId` is not in the list, the field starts on slide 1 as today (existing test "a slide that is no longer in its deck leaves the number at 1" keeps its meaning).
- **Empty deck (0 slides):** Select disabled with placeholder "This deck has no slides"; Link disabled.
- **Long decks:** Mantine's Combobox renders all options; a few hundred slides is fine. Set `limit={100}` is NOT used by default because it would hide slides that a person scrolling expects; see open question 1.
- **Paste-a-link mode and deck Select:** unchanged.

## Files touched

- Modify: `src/renderer/src/library/SlideLinkDialog.tsx`.
- Modify: `tests/renderer/library/dance-slide.test.tsx` (the five "Slide number" tests).
- Docs: `CHANGELOG.md`, 1.0.0 spec (one line), main spec §6.3 if it describes the number input, `AGENTS.md` decision (only a short one: "slide chosen from a searchable list, value is page ID"), `docs/manual-testing/pre-release-hardware.md` only if open question 2 is answered yes.
- No changes: `src/shared/contract.ts`, `src/main/**`, tour, e2e.

## Tasks

### Task 1: Picker replaces the number (test first)

- [ ] Rewrite the failing tests in `dance-slide.test.tsx` around the label "Slide": open the dialog, the Select lists "1 · Intro", "2 · Hava Nagila", "3 · Untitled slide" (an untitled page); choosing one and pressing Link calls `canva:linkSlide(danceId, deckId, position)` with that slide's position.
- [ ] Typeahead: typing "hava" leaves only the matching option; typing "3" matches slide 3 (and 13, 30 in a longer deck); "No slides match" appears when nothing does (`nothingFoundMessage`).
- [ ] Untitled slides are listed as "N · Untitled slide" and can be linked.
- [ ] Change… starts on the dance's current slide (shown selected); after the deck is re-read and the slide moved, the selection follows it (page ID), and the option label shows the new number; once the person picked a slide, a re-read does not change their pick.
- [ ] A slide gone from its deck: selection starts on the first slide.
- [ ] While `canva:refreshDecks` is pending the list is usable and "Checking Canva for changes…" shows; Link works; a failed re-read still shows "Couldn't reach Canva; showing the last saved slide list."
- [ ] A re-read that removes the picked slide clears the pick (Link disabled) rather than linking a different slide.
- [ ] Implement in `SlideLinkDialog.tsx`: `pageId` state, `Select` with `searchable`, `nothingFoundMessage`, `allowDeselect={false}`; derive `position` at Link time; delete `NumberInput` and the title `Text`. Keep paste mode and deck selection.
- [ ] Tests pass; `npm run typecheck`, `npx prettier --check .`, `npm test`, `npm run build`.

### Task 2: Docs

- [ ] `CHANGELOG.md` under Unreleased: "Choose a dance's Canva slide from a searchable list of the deck's slides instead of typing its number."
- [ ] AGENTS.md decision (dated, newest first): picker value is the page ID; label rebuilt from the current list; selection follows a re-read until the person picks; no limit/virtualization (or the outcome of open question 1). _Rejected:_ keeping the number box beside the list (two ways to say one thing); a free-text Autocomplete (could hold a non-slide).
- [ ] Add the item to the 1.0.0 spec's list.

## Risks

- A deck of many hundreds of slides makes the dropdown heavy; mitigated by search, and `limit` is a one-line change if needed.
- Selection racing with a re-read (page ID vs deck switch): covered by the follow/clear tests above.
- jsdom: Mantine `Select` options appear only after opening; tests open it by clicking the input (the test theme already sets `hideDetached: false`).
- Two slides with identical titles are told apart only by position in the label; that is why the number leads.

## E2E / tour impact

None expected: no e2e spec or tour step uses the slide number (the tour's practice library has no Canva). Re-confirm with `grep -rn "Slide number" e2e src tests` before opening the implementation PR.

## Hardware checklist

The existing step linking a dance to a Canva slide (`pre-release-hardware.md`, line ~21) stays valid; add "pick the slide from the dropdown" wording only if the maintainer wants a real-Canva check (open question 2).

## Open questions

1. Very long decks: leave all options in the list (default), or cap with `limit` (for example 100, typing narrows)? Default proposed: no cap.
2. Should the hardware checklist gain a step for the picker against a real deck?
3. Keep a way to jump by number? The search matches the number text, so typing "12" finds slide 12 (and 112); proposed as enough.
