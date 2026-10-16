import type { MenuItemConstructorOptions } from 'electron'
import type { AppleSyncState } from '@shared/apple-sync'
import type { PageTarget } from '@shared/contract'

// The macOS menu bar (spec §10.1: Help → Reveal logs). Settings… opens the Settings page; the
// File menu has Sync with Apple Music (⌘⇧S) where sync is available; the Edit menu gives text fields copy, paste and undo; Window gives Minimize (⌘M) and Zoom. There is
// deliberately no Close Window (⌘W): closing the control window quits the app, mid-dance. The
// developer tools are offered only in development.
export function menuTemplate(o: {
  appName: string
  dev: boolean
  showSettings: () => void
  revealLogs: () => void
  revealBackups: () => void
  appleSync: boolean // Sync with Apple Music is available (macOS)
  syncAppleMusic: () => void
}): MenuItemConstructorOptions[] {
  return [
    {
      label: o.appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: o.showSettings },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    // File → Sync with Apple Music (sync spec §3.3), where sync is available (macOS).
    ...(o.appleSync
      ? ([
          {
            label: 'File',
            submenu: [
              {
                label: 'Sync with Apple Music',
                accelerator: 'CmdOrCtrl+Shift+S',
                click: o.syncAppleMusic
              }
            ]
          }
        ] as MenuItemConstructorOptions[])
      : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...(o.dev
          ? ([
              { role: 'reload' },
              { role: 'toggleDevTools' },
              { type: 'separator' }
            ] as MenuItemConstructorOptions[])
          : []),
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Reveal Logs in Finder', click: o.revealLogs },
        { label: 'Reveal Library Backups in Finder', click: o.revealBackups }
      ]
    }
  ]
}

// File → Sync with Apple Music: syncs now, or, while sync is off, shows the Music page with its
// sync switch highlighted (that's where sync is turned on).
export function syncAppleMusicFromMenu(
  state: AppleSyncState,
  actions: { showPage(target: PageTarget): void; syncNow(): void }
): void {
  if (state === 'off') actions.showPage({ page: 'music', highlight: 'appleSync' })
  else actions.syncNow()
}
