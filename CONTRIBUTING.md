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
- **Dependabot** opens weekly update PRs (npm packages and the workflows' actions), only for releases at least 14 days old.

## Releasing

1. Complete the manual hardware checklist in spec §10.2 (projector, Canva, offline slides, slowed audio).
2. **Actions → Prepare Release → Run workflow** on main, with `major`, `minor`, `patch` or an exact version (for the very first release, `0.1.0`). It opens a "Release vX.Y.Z" pull request that bumps the version and dates the CHANGELOG's Unreleased notes. Check the notes, and merge it once its checks pass.
3. **Actions → Create Release → Run workflow** on main. It refuses a version that isn't higher than the last release or has no CHANGELOG section; otherwise it tests, builds the `.dmg`, checks it with the end-to-end tests, and publishes the GitHub release `vX.Y.Z` with the `.dmg` and the notes.
4. To try a release without publishing, tick **Dry run** (any branch): the `.dmg` is kept as a workflow artifact for a week.

### Signing and notarizing

Until there's an Apple Developer ID, `npm run dist` makes an **ad-hoc signed** app (`identity: '-'` in `electron-builder.yml`): it runs on Apple silicon, and a downloaded copy opens with System Settings → Privacy & Security → Open Anyway. To sign and notarize instead (not yet tested):

1. Install the "Developer ID Application" certificate in your keychain.
2. Set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` (for notarization).
3. Run:

   ```bash
   npm run build && env -u ELECTRON_RUN_AS_NODE npx electron-builder --mac --publish never \
     -c.mac.identity="Developer ID Application: <name> (<team>)" \
     -c.mac.hardenedRuntime=true -c.mac.notarize=true
   ```

In CI, the certificate (as `CSC_LINK` and `CSC_KEY_PASSWORD`) and the notarization credentials become repo secrets, passed to Create Release's build job.
