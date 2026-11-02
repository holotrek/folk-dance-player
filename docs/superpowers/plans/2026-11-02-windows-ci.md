# Windows CI and Release Implementation Plan

> **Status (2026-11-02):** executed, then the signing parts (Task 4's SignPath chain, Task 1's `refresh-feed`, Task 2's no-blockmap setting and Task 6's secrets docs) were removed when SignPath declined the project. The rest stands.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows is built, tested and released by CI next to macOS: a Windows unit-test job, Windows in the end-to-end matrix, a Windows build in Create Release that is signed through SignPath once its secrets are filled in, a checked `latest.yml`, and the Windows hardware checklist in the release PR.

**Architecture:** The build job's matrix gets a `windows-latest` entry. Signing is staged because Smart App Control judges every executable: build the unpacked app, have SignPath sign `Folk Dance Player.exe`, pack the NSIS installer from that signed folder (`--prepackaged`), have SignPath sign the installer, then recompute `latest.yml`'s checksum (signing changes the file's bytes) and check the feed. Every SignPath value is a GitHub secret; with no token the Windows job builds an unsigned installer (so it can be tried today), but a real (non-dry) release refuses to publish unsigned.

**Tech Stack:** GitHub Actions, `signpath/github-action-submit-signing-request` v3, electron-builder 26.17 (NSIS), Node 24 `.mts` scripts, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-windows-release-design.md` §7.2 (signing), §8 (release flow and CI). Earlier plan: `docs/superpowers/plans/2026-11-01-windows-beta-build.md`.

## Global Constraints

- Actions are pinned to a commit SHA with the version in a comment, each at least 14 days old (AGENTS.md, 2026-10-15). SignPath: `signpath/github-action-submit-signing-request@f6d04783b4569d051e0c80105fe66e82819d0092 # v3.0` (commit dated 2026-09-10).
- Secrets live in the `Package` environment (it requires the maintainer's approval). Only the PR Gate runs without secrets.
- Job names that are required checks today stay exactly as they are: `Typecheck, test and build`, `End-to-end (macos-latest)`, `CHANGELOG`. New jobs are new names; the maintainer adds them to the `main` ruleset by hand once green.
- The Windows installer name has no spaces: `Folk-Dance-Player-Setup-${version}.exe`; the feed is `latest.yml` (macOS: `latest-mac.yml`).
- Run `prettier --check .`, `npm run typecheck`, `npm test` and read exit codes before pushing.
- No user-facing app change: no CHANGELOG line (CI, docs and scripts only).
- Nothing here can be proven on a Mac. The workflow steps run only on GitHub; Task 7 pushes and reads the PR Gate run. A Create Release dry run needs the maintainer's say-so (it signs and notarizes the Mac build).

## Review Focus

- A real release with no SignPath secrets must fail the Windows build, not publish an unsigned installer.
- A dry run with no secrets must still build and check an unsigned Windows installer.
- `latest.yml` must name the *signed* installer's checksum and size; a stale checksum strands every installed copy.
- Mac and Windows feeds sit in one release: `check-feed` must check every feed in `dist/`, and fail when there is none.
- A secret's value must never be printed (the token only appears in the `env:`/`with:` of the SignPath step).

## File Structure

- `scripts/release.mts`: `checkUpdateFeed` takes the feed's name for its messages; new `refreshFeedChecksum`; CLI `check-feed` checks every feed found, new `refresh-feed`.
- `tests/scripts/release.test.ts`: tests for those.
- `electron-builder.yml`: `nsis.differentialPackage: false` (no blockmap; a signed file would invalidate it).
- `tests/project.test.ts`: asserts that, and the workflow rules in Task 3.
- `.github/workflows/pr-gate.yml`, `create-release.yml`, `prepare-release.yml`.
- `tests/scripts/workflows.test.ts` (new): rules about the workflow files.
- `CONTRIBUTING.md`, `AGENTS.md`, the Windows spec §8.

---

### Task 1: The update feed check covers `latest.yml`, and can be refreshed

**Files:**
- Modify: `scripts/release.mts`
- Test: `tests/scripts/release.test.ts`

**Interfaces:**
- Consumes: existing `checkUpdateFeed({ yml, version, files })`.
- Produces: `checkUpdateFeed(input: { yml: string; version: string; files: Record<string, Buffer | string>; feedName?: string }): FeedCheck` (`feedName` defaults to `'latest-mac.yml'` and is the name used in messages); `refreshFeedChecksum(input: { yml: string; file: string; bytes: Buffer }): string`; CLI `check-feed [dist]` and `refresh-feed [dist]`.

- [ ] **Step 1: Write the failing tests** in `release.test.ts`, with this NSIS-shaped sample (electron-builder writes `files`, then top-level `path`, `sha512`, `releaseDate`; no blockmap line):
  - `checkUpdateFeed` with `feedName: 'latest.yml'` and a mismatched version: the error contains `latest.yml` and not `latest-mac.yml`.
  - `checkUpdateFeed` with a good NSIS feed and its file passes.
  - `refreshFeedChecksum`: given a feed whose entry has a stale `sha512`/`size` and new `bytes`, the returned yml has the new `sha512` and `size` in the `files` entry **and** the new top-level `sha512`; the `version`, `path` and `releaseDate` lines are unchanged; and `checkUpdateFeed` then passes.
  - `refreshFeedChecksum` for a `file` the feed doesn't name throws an error that contains the file name.
- [ ] **Step 2:** `npx vitest run tests/scripts/release.test.ts`. Expected: the new tests FAIL (`refreshFeedChecksum` is not exported; `feedName` ignored).
- [ ] **Step 3: Implement** `feedName` in `checkUpdateFeed`'s messages and `refreshFeedChecksum` in `scripts/release.mts` (regex/line edits on the yml text, no new dependency; `size` is `bytes.length`; top-level `sha512` is the unindented `sha512:` line).
- [ ] **Step 4:** Rerun the file. Expected: PASS.
- [ ] **Step 5: CLI.** `check-feed [dist]` checks each of `latest-mac.yml` and `latest.yml` that exists in the folder (name used in its messages; file looked up by the first `files` entry as today) and exits 1 with `::error::` if neither exists; `refresh-feed [dist]` reads `latest.yml`, takes the file its top-level `path:` names, rewrites the yml with `refreshFeedChecksum` from that file's bytes in `dist`, and exits 1 if the yml or the file is missing. Update the usage text. Run `npm test`.
- [ ] **Step 6: Commit** `feat: check and refresh the Windows update feed (latest.yml)`.

---

### Task 2: No blockmap for the Windows installer

**Files:**
- Modify: `electron-builder.yml`
- Test: `tests/project.test.ts`

- [ ] **Step 1: Failing test** in `project.test.ts`: `electron-builder.yml` has `differentialPackage: false` under `nsis:` (regex on the file text, within the `nsis:` block).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Add `differentialPackage: false` to the `nsis:` block with a comment: signing changes the installer's bytes after the build, which would leave a blockmap wrong; the updater downloads the whole file.
- [ ] **Step 4:** Run it. Expected: PASS. Then `npx electron-builder --win --dir --publish never` still validates the config (it may take a minute; the output ends in `win-unpacked`).
- [ ] **Step 5: Commit** `build: no blockmap for the Windows installer`.

---

### Task 3: Workflow rules and the PR Gate on Windows

**Files:**
- Create: `tests/scripts/workflows.test.ts`
- Modify: `.github/workflows/pr-gate.yml`

**Interfaces:** Produces rules every later workflow edit must keep: each `uses:` in `.github/workflows/*.yml` is pinned to a 40-hex SHA with a `# v…` comment; every `secrets.NAME` used in `create-release.yml` is named in `CONTRIBUTING.md`.

- [ ] **Step 1: Write `workflows.test.ts`** (node project, reads the files as text): (a) every `uses:` line that is not a local path matches `@[0-9a-f]{40} # v`; (b) the set of `secrets.X` names in `create-release.yml`, minus `GITHUB_TOKEN`, is each contained in `CONTRIBUTING.md` (this fails until Task 6; mark with the exact secret names and run it again then); (c) `pr-gate.yml` still has the jobs named `Typecheck, test and build`, `End-to-end (${{ matrix.os }})` and `CHANGELOG`; (d) `pr-gate.yml` has a job named `Unit tests (Windows)` running on `windows-latest`, and `windows-latest` is in the e2e matrix.
- [ ] **Step 2:** Run it. Expected: (a) and (c) pass, (b) and (d) FAIL.
- [ ] **Step 3: Edit `pr-gate.yml`.**
  - New job `windows-check`, `name: Unit tests (Windows)`, `runs-on: windows-latest`: checkout, setup-node (same pins), `npm install --global npm@12.1.0`, `npm ci`, `npm run typecheck`, `npm test`, `npx electron-vite build`. No prettier (Linux job has it).
  - e2e `matrix.os: [macos-latest, windows-latest]`; `npm run build:helper` only `if: runner.os == 'macOS'`; "The tours as on Windows" step only `if: runner.os == 'macOS'`; the Playwright report artifact step keeps `matrix.os` in its name.
  - Comment: the Windows jobs are not required checks until the maintainer adds them to the `main` ruleset.
- [ ] **Step 4:** Run `workflows.test.ts` (only (b) should still fail) and the whole suite's other tests.
- [ ] **Step 5: Commit** `ci: unit tests and end-to-end tests on Windows`.

---

### Task 4: Create Release builds, signs and checks the Windows installer

**Files:**
- Modify: `.github/workflows/create-release.yml`
- Test: `tests/scripts/workflows.test.ts`

**Interfaces:** Secrets read (all in the `Package` environment): `SIGNPATH_API_TOKEN`, `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG` (real releases), `SIGNPATH_TEST_SIGNING_POLICY_SLUG` (dry runs), `SIGNPATH_APP_ARTIFACT_CONFIGURATION_SLUG`, `SIGNPATH_INSTALLER_ARTIFACT_CONFIGURATION_SLUG`.

- [ ] **Step 1: Failing tests** in `workflows.test.ts` for `create-release.yml`: the matrix has an entry with `os: windows-latest` whose `installer` lists `dist/*.exe` and `dist/latest.yml` and not a blockmap; the SignPath step uses the pinned SHA `f6d04783b4569d051e0c80105fe66e82819d0092`; the file contains a step named `A release is signed (Windows)` whose condition mentions `DRY_RUN`; and the token secret appears only in `env`/`with` lines (never in a `run:` body line: check no line that contains `echo` also contains `secrets.`).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Edit `create-release.yml`.** Add the matrix entry and, for Windows (all `shell: bash`, `if: runner.os == 'Windows'`):
  1. `Is signing set up? (Windows)` (id `signing`): output `enabled=true` when `SIGNPATH_API_TOKEN` (via `env:`) is non-empty.
  2. `A release is signed (Windows)`: fails with an `::error::` saying the SignPath secrets are missing, when `env.DRY_RUN != 'true' && steps.signing.outputs.enabled != 'true'`.
  3. Unsigned path (`enabled != 'true'`): `npm run dist` (the existing `Build` step's condition becomes `runner.os != 'macOS' && steps.signing.outputs.enabled != 'true'`; on macOS `steps.signing` doesn't exist, so write the condition so it is true there only for the Mac step).
  4. Signed path (`enabled == 'true'`): `npm run build`; `npx electron-builder --win --dir --publish never`; `actions/upload-artifact` (pinned as elsewhere) `unsigned-app` from `dist/win-unpacked` (id `upload-app`); SignPath step with `github-artifact-id: ${{ steps.upload-app.outputs.artifact-id }}`, `artifact-configuration-slug: ${{ secrets.SIGNPATH_APP_ARTIFACT_CONFIGURATION_SLUG }}`, `signing-policy-slug: ${{ env.DRY_RUN == 'true' && secrets.SIGNPATH_TEST_SIGNING_POLICY_SLUG || secrets.SIGNPATH_SIGNING_POLICY_SLUG }}`, `wait-for-completion: true`, `output-artifact-directory: signed-app`; copy `signed-app/*` over `dist/win-unpacked`; `npx electron-builder --win --prepackaged dist/win-unpacked --publish never`; upload `dist/Folk-Dance-Player-Setup-*.exe` as `unsigned-installer` (id `upload-installer`); SignPath step with the installer's configuration slug, output `signed-installer`; copy the signed exe over `dist/`; `node scripts/release.mts refresh-feed dist`.
  5. The feed check step runs on every OS: `node scripts/release.mts check-feed dist` (rename it `The update feed matches the release`).
  6. `npm run test:e2e:dist` stays after the build for every OS (on the signed `win-unpacked`).
  - The SignPath step's `api-token` and ids come from `secrets.*`; no other step touches the token. Add `actions: read` to the job's `permissions` (the action reads job details; the workflow default is `contents: read`). Update the header comment (Windows installer, `latest.yml`, signing) and the Mac-only comments.
- [ ] **Step 4:** Run `workflows.test.ts` (only the CONTRIBUTING rule may still fail) and `npx prettier --check .github`.
- [ ] **Step 5: Commit** `ci: build, sign and check the Windows installer in Create Release`.

---

### Task 5: The release PR carries the Windows checklist

**Files:**
- Modify: `.github/workflows/prepare-release.yml`
- Test: `tests/scripts/workflows.test.ts`

- [ ] **Step 1: Failing test:** `prepare-release.yml` mentions both `docs/manual-testing/pre-release-hardware.md` and `docs/manual-testing/pre-release-hardware-windows.md`, and the PR text asks for the `.exe` as well as the `.dmg`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** In the body-building block, after the macOS list add `## Pre-release hardware check (Windows)` and `tail -n +2` of the Windows file; rename the first heading `(macOS)`; step 2 of the instructions says to install this version's `.dmg` and `.exe`.
- [ ] **Step 4:** Rerun. Expected: PASS. **Step 5: Commit** `ci: the release PR carries the Windows hardware checklist`.

---

### Task 6: Document the secrets, the SignPath setup and the decision

**Files:**
- Modify: `CONTRIBUTING.md`, `AGENTS.md`, `docs/superpowers/specs/2026-11-01-windows-release-design.md`

- [ ] **Step 1:** `CONTRIBUTING.md`: a "Signing the Windows installer" section: the seven secrets (what each is, and that the policy slugs are SignPath's `release-signing` and `test-signing`), SignPath-side setup (add the GitHub.com trusted build system; link it to the project; an API token for a submitter user; the two artifact configurations with the XML sketches below, to be checked against SignPath's docs), the behavior without secrets (dry runs build unsigned; real releases refuse), and the Windows rows of "Adding an OS". Sketch for the app: a `zip-file` containing `pe-file path="Folk Dance Player.exe"` with `authenticode-sign`; for the installer: a `zip-file` containing `pe-file path="Folk-Dance-Player-Setup-*.exe"` with `authenticode-sign`.
- [ ] **Step 2:** `AGENTS.md`: a 2026-11-02 decision: staged signing (why: Smart App Control checks every executable, so the installed app must be signed too); feed refreshed after signing; no blockmap (`differentialPackage: false`); unsigned dry runs but never an unsigned release; the embedded uninstaller stays unsigned (not signable from outside; noted as a gap); Windows jobs are not required checks until added to the ruleset. _Rejected:_ electron-builder's own sign hook (SignPath signs an uploaded artifact, not a file on the runner); signing only the installer.
- [ ] **Step 3:** Spec §8: mark what is done (Windows in PR Gate and Create Release, `check-feed`, checklist copied) and what waits on the SignPath account.
- [ ] **Step 4:** `npx vitest run tests/scripts/workflows.test.ts`. Expected: all PASS (the CONTRIBUTING rule now finds the secret names).
- [ ] **Step 5: Commit** `docs: the Windows signing secrets, SignPath setup and CI decision`.

---

### Task 7: Run it on GitHub

- [ ] **Step 1:** `npx prettier --check .`, `npm run typecheck`, `npm test`: all exit 0.
- [ ] **Step 2:** Push `feat/windows-release` (PR #60) and watch the PR Gate: `gh run list --branch feat/windows-release`, `gh run watch`. Expected: the existing checks pass; **Unit tests (Windows)** and **End-to-end (windows-latest)** run. Read their failures: a Windows-only test failure is a real finding. Fix what is a path/line-ending/script bug in this plan's scope; list anything else as an issue and say so.
- [ ] **Step 3:** Do **not** start a Create Release dry run without the maintainer's approval (it signs and notarizes the Mac build). Report that the Windows signing path is untested until the secrets exist.
