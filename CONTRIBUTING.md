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

| Script              | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Run the app with hot reload                     |
| `npm start`         | Run the last production build                   |
| `npm run build`     | Typecheck, then build to `out/`                 |
| `npm run typecheck` | TypeScript checks for main/preload and renderer |
| `npm test`          | All tests (Vitest: node + renderer projects)    |
| `npm run format`    | Prettier                                        |
| `npm run icon`      | Rebuild the app icon from the logo (macOS)      |

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

## Releasing

1. `npm test` and `npm run build` pass. Complete the manual hardware checklist in spec §10.2 (projector, Canva, offline slides, slowed audio).
2. Bump `version` in `package.json` (semver).
3. In `CHANGELOG.md`, move the `Unreleased` entries under `## [x.y.z] - YYYY-MM-DD`.
4. Commit as `chore(release): vx.y.z` and tag `vx.y.z`.
5. Build the signed `.dmg` (see the packaging plan).
