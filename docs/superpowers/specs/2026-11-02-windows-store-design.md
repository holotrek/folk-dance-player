# Windows: the Microsoft Store version, next to the direct download (design)

Status: draft for review, 2026-11-02. Builds on `2026-11-01-windows-release-design.md`.

## 1. Intent

The unsigned Windows installer is blocked by Smart App Control (Windows 11) and warned about by
SmartScreen. SignPath's free program declined the project (too little public visibility), the
paid tier is about $500 a year, and Azure Artifact Signing (about $120 a year) is open to individuals
only in the US and Canada. The Microsoft Store is free to join for individuals, and Microsoft signs
what it publishes, so a Store install is not blocked.

Not everyone can use the Store (a locked-down school or library computer, for one), so Windows gets
**two ways in**: the Store version, and the direct installer, which the site warns may be blocked.

## 2. Goals, non-goals

Goals:

- A Store package built from the same code and CI as the direct installer.
- The Store version is the site's main button for Windows visitors; the direct download sits below it
  with a plain warning that Windows may block it.
- The app behaves correctly in both forms: the in-app updater is off in the Store version (the Store
  updates it), on in the direct one.

Non-goals (for now):

- Moving a library between the two versions: issue #80.
- Signing the direct installer: the SignPath steps in Create Release stay, dormant without secrets;
  a certificate later turns them on.
- Automating Store submission (Partner Center's submission API): the first submissions are by hand.
- A Windows on ARM build, or Mac App Store.

## 3. What is known and what is not

From electron-builder's docs and Microsoft's, found 2026-11-02 (mostly secondary sources for the
Electron specifics; verify in Partner Center):

- electron-builder 26.17 has an `appx` target (stable) and a newer `msix` target (beta). Electron
  needs the `runFullTrust` capability, which it adds. The `identityName` must be unique in the Store;
  Partner Center assigns it, and the publisher string comes from the account.
- Registration is free for individuals. A Store package needs no certificate of ours: Microsoft
  signs it.
- Certification takes up to about three business days. Needs the Windows App Certification Kit run,
  an age-rating questionnaire, and a privacy policy URL if the app handles personal information.
- Store installs update only through the Store. electron-updater does not support `appx`.

Not confirmed (spikes, §6): whether media keys and global shortcuts work in the package; where the
data folder ends up (packaged apps usually get redirected, private copies of AppData folders, and
uninstalling can remove them, which would cut against the rule that uninstalling never deletes the
library); drag-and-drop from File Explorer; the Canva views and the projector window.

## 4. The design

**Two artifacts from the Windows job.** Create Release's Windows build makes the NSIS installer
(`.exe`, `latest.yml`) as now and also an `appx` package (`electron-builder --win appx`), kept as a
workflow artifact. The Store package is **not** attached to the GitHub release: users can't install
an unsigned package, and the maintainer uploads it to Partner Center.

**Identity.** `win.appx` takes `identityName`, `publisher` and `publisherDisplayName` from
repository variables (`STORE_IDENTITY_NAME`, `STORE_PUBLISHER`, `STORE_PUBLISHER_DISPLAY_NAME`, copied
from Partner Center; they are not secrets). With none set, the Store build is skipped (so CI works
before the account exists).

**Knowing it is the Store build.** `process.windowsStore` is true in an `appx`. The platform module
gains `store: boolean` on `Capabilities` (true when `platform === 'windows'` and the process is a Store
app); main sends it with `app:getInfo`. In the Store version the updater is not started, Check for
Updates… in the menu and the update setting in Settings are hidden, and the About text says "Updated
by the Microsoft Store". The `FDP_PLATFORM` test override can also set it.

**The site.** A Windows visitor sees the Store button (the Store listing URL, once approved; until
then the "Windows version is in the works" note) and, under it, "Direct download (Windows may block
it)" with one sentence saying why and that the Store version avoids it. The existing Mac download is
unchanged. A privacy page (`/privacy`) says the app collects nothing, and what the Canva views load.

**CI and docs.** The Windows job's `appx` step; the artifact; CONTRIBUTING gets the Partner Center
steps; AGENTS.md gets the decision; the Windows hardware checklist gets a Store section.

## 5. My calls (change any)

- `appx`, not `msix`: the stable target; both are accepted by the Store. Revisit when `msix` leaves beta.
- Store identity values are repository variables, not secrets.
- The direct installer's signing steps stay in place, dormant.
- The Store version is the main button only after it is approved; before that the direct download is
  the only Windows button, still with the warning.
- No in-app message in the direct version about the Store (the site says it).

## 6. Spikes before the code (need the Windows machine)

Build an `appx` locally (`npx electron-builder --win appx`), install it on the Windows box (Developer
Mode, with a test certificate), and check: it starts; the media keys work; the projector window and
the taskbar behave; File Explorer drag-and-drop; Add Music… with a folder; Canva slides; audio; where
the library file really is (Settings → About shows the path); what uninstalling does to it;
single instance. Write the findings to `docs/spikes/windows-store.md`. If the data folder or
shortcuts behave badly, the design changes before any app code does.

## 7. Yours to answer (only you can)

1. Create the Partner Center account (identity verification with ID and a selfie) and reserve the
   name "Folk Dance Player". Is the name free?
2. The Store listing needs a support contact (email or the GitHub issues page), a category, a short
   description and screenshots (from the Windows build). Which contact do you want public?
3. Is the 3-business-day certification wait acceptable for the first Windows release (0.4.0)?

## 8. Order of work

1. Spikes (§6), on your Windows box.
2. `Capabilities.store`, the updater off in the Store version, and the About text (TDD).
3. The `appx` target and the identity variables; the CI step and artifact.
4. The site's Windows section and `/privacy`.
5. Docs and the hardware checklist; the Partner Center steps in CONTRIBUTING.
6. Submit; fix what certification finds.
