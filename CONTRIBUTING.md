# Contributing to Folk Dance Player

## Prerequisites

- macOS (primary platform)
- Node 24 and npm 12

## Setup

```bash
npm install
npm install-scripts approve esbuild   # npm 12 blocks install scripts until approved
npm run dev
```

**Gotchas:**

- **VS Code's terminal sets `ELECTRON_RUN_AS_NODE=1`.** That makes Electron run as plain Node, so `npm run dev` and `npm start` unset it. Do the same in any new script that launches Electron.
- **The Electron binary is downloaded by `postinstall`** (`install-electron`). Electron 44 has no install script of its own, and electron-vite fails with "Electron uninstall" without the binary. If that happens, run `npx install-electron`.
- **The packaged app needs Xcode's command line tools** (`xcode-select --install`): `npm run dist` compiles the Music library helper in `native/music-library/` with `swiftc`.
- **File dialogs can't be driven by end-to-end tests:** set `FDP_PICK_ATTACHMENT=<a file>` and the PDF (and slide image) pickers return it without opening a dialog.
- **`npm run dev` from VS Code's terminal can't read the Music library:** macOS asks on behalf of VS Code, which doesn't declare Music use. Test sync there with `FDP_APPLE_LIBRARY=<a snapshot JSON file> npm run dev`, and the real helper in the packaged app.

## Scripts

| Script                  | What it does                                    |
| ----------------------- | ----------------------------------------------- |
| `npm run dev`           | Run the app with hot reload                     |
| `npm start`             | Run the last production build                   |
| `npm run build`         | Typecheck, then build to `out/`                 |
| `npm run typecheck`     | TypeScript checks for main/preload and renderer |
| `npm test`              | All tests (Vitest: node + renderer projects)    |
| `npm run format`        | Prettier                                        |
| `npm run icon`          | Rebuild the app icon from the logo (macOS)      |
| `npm run build:helper`  | Build the Music library helper (macOS, Swift)   |
| `npm run dist`          | Build the Universal .dmg into `dist/`           |
| `npm run test:e2e`      | End-to-end tests (Playwright) on the build      |
| `npm run test:e2e:dist` | The same tests on the packaged app              |

## Workflow

1. **Design changes go into the spec first** (`docs/superpowers/specs/`). Implementation follows a plan in `docs/superpowers/plans/`.
2. **Test-first:** write the failing test, make it pass, then commit.
3. **Use conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`…). Commits made with an AI assistant end with its `Co-Authored-By:` line.
4. **For user-facing changes,** add a line under `## [Unreleased]` in `CHANGELOG.md` in the same commit, written for organizers.
5. **For decisions a future contributor would need to know,** add an entry to the Decisions log in `AGENTS.md`.

## Conventions

- **Prettier:** single quotes, no semicolons, 100 columns, no trailing commas.
- **UI:** use Mantine components first. Custom CSS only in a co-located `Component.module.css`, and only for layout, overrides or custom controls.
- **Renderers never touch Node or the database.** Everything goes through `window.api.invoke`.

## Common changes

- **Adding a dependency:** pin the exact version (no `^` or `~`), choose a release at least two weeks old, and say why in the commit message.
- **Changing the database:** add `src/main/db/migrations/00N-name.ts` and append it to `MIGRATIONS`. Never edit a migration that has been released.
- **Adding an IPC channel:**
  1. Add it to `InvokeContract` in `src/shared/contract.ts`.
  2. Add it to `INVOKE_CHANNELS`. Typecheck fails until you do.
  3. Implement it in `createHandlers`.

## Continuous integration

GitHub Actions (spec §13.4) runs on every pull request and every push to main:

- **PR Gate:** formatting, typecheck, unit tests and build on Linux; the end-to-end tests on macOS; and the CHANGELOG check. The `main` ruleset requires all three before a pull request can be merged (and changes reach main only through pull requests).
- **The CHANGELOG check:** a pull request that changes `src/` must add a line to `CHANGELOG.md`. If nobody would notice the change, label the PR `no changelog`. Dependabot's PRs are skipped.
- **Adding an OS:**
  - **End-to-end tests:** add it to the `e2e` job's `matrix.os` in `pr-gate.yml` (for example `ubuntu-latest`, under a virtual display, or `windows-latest`), and add its check to the required checks of the `main` ruleset (Settings → Rules).
  - **Releases:** add `{ os: …, installer: … }` to the `build` job's matrix in `create-release.yml`. Windows also needs its electron-builder target and a `dist` script without `env -u`, which is Unix-only.
- **Pull requests from forks** run with read-only permissions and no secrets. GitHub asks a maintainer to approve a first-time contributor's runs.
- **Dependabot** opens weekly update PRs (npm packages and the workflows' actions), only for releases at least 14 days old. It skips major npm upgrades: make those on purpose (Vite stays on 7 for electron-vite 5; `@types/node` follows Node's major).

## Releasing

1. **Actions → Prepare Release → Run workflow** on main, with `major`, `minor`, `patch` or an exact version (for the very first release, `0.1.0`). It opens a **draft** "Release vX.Y.Z" pull request that bumps the version and dates the CHANGELOG's Unreleased notes. Its description carries the hardware checklist from [`docs/manual-testing/pre-release-hardware.md`](docs/manual-testing/pre-release-hardware.md). On the pull request, click **Approve workflows to run**: GitHub holds the PR Gate of a pull request opened by a workflow until someone approves it.
2. While it's a draft, build the `.dmg` with a **Create Release** dry run on the release branch (or `npm run dist`), install it, and tick the checklist in the description as you go. If something fails, close the pull request and delete its `release/vX.Y.Z` branch (Prepare Release can't push over it), fix the problem on main, and start again from step 1.
3. Check the version and notes, then click **Ready for review** (it starts nothing) and merge once the PR Gate's checks pass.
4. **Actions → Create Release → Run workflow** on main. It refuses a version that isn't higher than the last release or has no CHANGELOG section; otherwise it tests, builds the `.dmg`, checks it with the end-to-end tests, and publishes the GitHub release `vX.Y.Z` with the `.dmg` and the notes.
5. To try a release without publishing, tick **Dry run** (any branch): the `.dmg` is kept as a workflow artifact for a week.

### Signing and notarizing

`npm run dist` makes an **ad-hoc signed** app (`identity: '-'` in `electron-builder.yml`), so it builds for anyone and in CI without a certificate. It runs on Apple silicon, and a downloaded copy opens with System Settings → Privacy & Security → Open Anyway. To make a release build signed with a Developer ID (tested end to end):

1. Install the "Developer ID Application" certificate **and its private key** in your keychain (an "Apple Distribution" certificate is for the App Store and won't pass Gatekeeper). Check with `security find-identity -v -p codesigning`.
2. Build and sign (the identity is the name without the "Developer ID Application:" prefix):

   ```bash
   npm run build && env -u ELECTRON_RUN_AS_NODE npx electron-builder --mac --publish never \
     -c.mac.identity="<name> (<team>)" -c.mac.hardenedRuntime=true -c.mac.notarize=false
   ```

3. Check it: `codesign --verify --deep --strict "dist/mac-universal/Folk Dance Player.app"`.
4. Notarize the `.dmg` with `notarytool`, which shows progress and can be checked later (electron-builder's own notarize step is silent while it waits on Apple). Store credentials once with `xcrun notarytool store-credentials "Folk Dance Player"`, then:

   ```bash
   xcrun notarytool submit "dist/Folk Dance Player-<version>-universal.dmg" --keychain-profile "Folk Dance Player" --no-wait
   xcrun notarytool info <submission-id> --keychain-profile "Folk Dance Player"   # Accepted / Invalid
   xcrun stapler staple "dist/Folk Dance Player-<version>-universal.dmg"
   ```

   An account's first submission can take hours. Don't use `notarytool wait` in a terminal you need. The ticket is stapled to the `.dmg`, not the app inside it; check the app by mounting the dmg and running `spctl -a -t exec -vv` on it ("Notarized Developer ID"). `spctl` on the dmg itself says "no usable signature", which is normal: only the app is signed.

In CI, the certificate (as `CSC_LINK` and `CSC_KEY_PASSWORD`) and the notarization credentials become repo secrets, passed to Create Release's build job.
