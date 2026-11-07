# Projector contrast (Plan 25) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From across the room, the projector's songs read as separate rows, and the Now Playing (or Up next) section stands out as a panel with a contrasting background (issue #91).

**Architecture:** A visual change only. The look is a small set of color tokens in a new shared module (`src/shared/projector-colors.ts`) that `ProjectorView.module.css` mirrors through CSS custom properties set on `.screen` by `ProjectorView`, so one unit test can compute contrast ratios from the same values the screen uses. No IPC, schema or main-process change.

**Tech Stack:** React, CSS Modules, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-release-1-0-0-design.md` §3.3 (open question §7.2).

## Global Constraints

- UI from Mantine components; custom CSS only in co-located `*.module.css` (the projector is already plain CSS Modules).
- The projector is read-only and looks the same in light and dark appearance: one look.
- No new accent color: the existing gray scale, the red progress bar, the amber Paused/Teaching.
- Sizes stay in `vh`/`vw` so every display scales.
- Work test-first (Vitest); conventional commits; CHANGELOG line under Unreleased in the same commit.
- Run only unit tests, `npm run typecheck`, `prettier --check .` and `npm run build` (CI runs e2e).

## Proposed default look (answer to open question 2)

Page stays `#000`. All values are starting points to tune on a real projector.

| Part | Value |
| --- | --- |
| Rows (Previously played, Up next) | Alternating bands: odd rows `#1c1c1c`, even rows transparent, plus a 0.3vh rule `rgba(255,255,255,0.35)` between rows (replaces the 1px 12% line). Row padding 1.4vh vertical and 1.2vw horizontal so the band has air. |
| Row text | Dance `#f2f2f2`; played rows `#d0d0d0`; song and country `#c0c0c0` (all at least 7:1 on `#1c1c1c`). |
| Now Playing / Up next panel | A lighter step: background `#3a3a3a`, 1.5vh/1.5vw padding, rounded 1vh. Text `#ffffff`; song and country `#e4e4e4`. Lighter, not darker, because the page is already black and a lighter block is what a projector shows best. |
| Progress | Track `#121212` inside the panel, bar `#e03131` (about 3.8:1 against the track, enough for a non-text graphic at 3:1). |
| Paused label | Amber `#f0b429` on the panel (about 6:1; the amber word is bold and large). |
| Teaching marker | Unchanged; it sits inside the panel when `next`. |

Alternating bands plus a rule is chosen over either alone: a rule survives a washed-out projector, and bands show the row's extent when the dance name is short and the country is far right.

## Files

- Create: `src/shared/projector-colors.ts` (the token table and `contrastRatio(a, b)`).
- Modify: `src/renderer/src/projector/ProjectorView.module.css` (bands, rule, panel, tokens as `var(--fdp-…)`).
- Modify: `src/renderer/src/projector/ProjectorView.tsx` (set the token variables on `.screen`; no structure change except a wrapper class if the panel needs one).
- Create: `tests/shared/projector-colors.test.ts`.
- Modify: `tests/renderer/projector/projector-view.test.tsx` (the panel and band hooks).
- Modify: `CHANGELOG.md`, `AGENTS.md` (decision), main spec §8, `docs/manual-testing/pre-release-hardware.md`.

## Tasks

### Task 1: Color tokens and the contrast test

- [ ] Write `tests/shared/projector-colors.test.ts` first, failing: `contrastRatio('#000000','#ffffff')` is 21; known pair `#767676` on white is about 4.54; every text/background pair in the table meets 7:1 (dance, played dance, song, country on band and on transparent/black; panel text on panel); the red bar against the track and panel against page meet 3:1; the panel differs from the page background by at least 1.5:1 and from a band by at least 1.3:1.
- [ ] Implement `projector-colors.ts` (WCAG relative luminance, `PROJECTOR_COLORS` constant with named pairs). Run the test; commit.

### Task 2: Rows separated

- [ ] Add a failing renderer test: Previously played and Up next rows render with the row class, and the band is applied by CSS nth-child (so no markup assertion beyond the class); the Teaching rows do not take a band and do not shift the band parity (use a class on `Row` only, and `:nth-child` over `li.row` is wrong with Teaching in the list, so give `Row` an explicit `data-band` computed from the count of non-Teaching rows before it). Test the attribute.
- [ ] Implement `data-band` in `ProjectorView.tsx` and the CSS (`[data-band='odd']`), the heavier rule, and the padding. Commit.

### Task 3: The Now Playing / Up next panel

- [ ] Add a failing test: the middle section has the panel class in both `now` and `next` kinds (heading, dance, song and progress inside it) and the panel is absent when `middle` is null.
- [ ] Implement the panel CSS on `.middle`, recolor `.nowSong`, `.nowCountry`, `.track`, `.paused`. Commit.

### Task 4: Both layouts at large sizes

- [ ] With a slide, Previously played narrows and prints titles only; bands must still fill the narrowed column and the panel stay full width below the slide row. Add a renderer test with a slide (`slide-row` present, panel present). Check by eye at 1920x1080, 3840x2160 and the minimum window (1000x640) with the app run by hand (not e2e): no clipping of the panel, the played list still bottom-anchored, `Upcoming` still fills the remaining height. Adjust gaps (`.screen` gap 2.5vh) if the panel padding pushes the list off.
- [ ] Thread the screenshot-sized vertical budget: panel padding adds about 3vh, so reduce `.played` max-height 28vh only if needed after the check.

### Task 5: Docs and release hygiene

- [ ] CHANGELOG line under Unreleased ("The projector view separates songs more clearly and puts Now Playing on a lighter panel").
- [ ] AGENTS.md decision (newest first): the look, the tokens module and why the contrast is tested; rejected: darker panel, rule only, accent color for Now Playing.
- [ ] Main spec §8: describe the panel and bands. Hardware checklist: projector separation and panel, with and without a slide (also Windows list).
- [ ] `prettier --check .`, typecheck, `npm test`, `npm run build`, with exit codes.

## Review Focus

1. Every text pair in the table is at least 7:1 and the test fails if a token changes below it.
2. The Teaching rows in Up next do not break band alternation.
3. With a slide, nothing overlaps the slide box (`slideBox`), and the panel is not covered by the live Canva view.
4. Nothing shifts at the minimum window size; the Ending line is still visible.

## Risks

- The panel's padding costs vertical space; in a short window the Upcoming list loses a row. Mitigation: `vh` units, and Upcoming is already clipped by design.
- Lighter panel plus red bar can look low contrast; the track is made dark to carry the bar.
- A projector's color rendering differs from a laptop's: grays near each other (`#1c1c1c` vs `#000`) may vanish in a bright room. That is why the rule is kept as well, and why the values live in one table.
- The live Canva view sits over the slide area only; the panel is below it, so no overlap is expected, but check with a real deck.

## Open Questions for the Maintainer

1. Bands plus a heavier rule, as proposed, or rule only?
2. Lighter panel (`#3a3a3a`) as proposed, or darker?
3. Should the Previously played rows beside a slide (title only) also get bands, or only the rule?
4. After tuning on a real projector, the exact grays may change; are you happy for the contrast test to fix the minimum (7:1 text) and leave the rest free?
