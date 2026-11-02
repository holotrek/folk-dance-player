import type { MenuItemConstructorOptions } from 'electron'
import type { AppleSyncState } from '@shared/apple-sync'
import type { Capabilities } from '@shared/platform'
import type { PageTarget } from '@shared/contract'
import type { TourPart } from '@shared/tour'

// The menu bar (spec §10.1: Help → Reveal logs). Settings… opens the Settings page; the Edit menu gives
// text fields copy, paste and undo. There is deliberately no Close Window (⌘W): closing the control
// window quits the app, mid-dance. The developer tools are offered only in development.
//
// On a Mac that is the macOS layout: an app menu (About, Check for Updates…, Settings…), File →
// Sync with Apple Music (⌘⇧S) where sync is available, and Window with Minimize (⌘M) and Zoom.
// Windows and Linux have no app menu: Settings… and Exit are in File, and About and Check for
// Updates… are in Help (Windows release spec §9.2).
export interface MenuOptions {
  appName: string
  dev: boolean
  caps: Capabilities
  showSettings: () => void
  revealLogs: () => void
  revealBackups: () => void
  appleSync: boolean // Sync with Apple Music is available
  syncAppleMusic: () => void
  takeTour: (part: TourPart) => void
  checkForUpdates: () => void
  showAbout: () => void
}

const viewMenu = (dev: boolean): MenuItemConstructorOptions => ({
  label: 'View',
  submenu: [
    ...(dev
      ? ([
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' }
        ] as MenuItemConstructorOptions[])
      : []),
    { role: 'togglefullscreen' }
  ]
})

export function menuTemplate(o: MenuOptions): MenuItemConstructorOptions[] {
  return o.caps.platform === 'mac' ? macMenu(o) : windowsMenu(o)
}

function windowsMenu(o: MenuOptions): MenuItemConstructorOptions[] {
  const where = o.caps.fileManager
  return [
    {
      label: 'File',
      submenu: [
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: o.showSettings },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    { role: 'editMenu' },
    viewMenu(o.dev),
    { label: 'Window', submenu: [{ role: 'minimize' }] },
    {
      role: 'help',
      submenu: [
        { label: 'Take the Basic Tour…', click: () => o.takeTour('basic') },
        { label: 'Take the Advanced Tour…', click: () => o.takeTour('advanced') },
        { type: 'separator' },
        { label: 'Check for Updates…', click: o.checkForUpdates },
        { label: `About ${o.appName}`, click: o.showAbout },
        { type: 'separator' },
        { label: `Show Logs in ${where}`, click: o.revealLogs },
        { label: `Show Library Backups in ${where}`, click: o.revealBackups }
      ]
    }
  ]
}

function macMenu(o: MenuOptions): MenuItemConstructorOptions[] {
  return [
    {
      label: o.appName,
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates…', click: o.checkForUpdates },
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
    viewMenu(o.dev),
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Take the Basic Tour…', click: () => o.takeTour('basic') },
        { label: 'Take the Advanced Tour…', click: () => o.takeTour('advanced') },
        { type: 'separator' },
        { label: `Reveal Logs in ${o.caps.fileManager}`, click: o.revealLogs },
        { label: `Reveal Library Backups in ${o.caps.fileManager}`, click: o.revealBackups }
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
