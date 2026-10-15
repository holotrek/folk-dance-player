import type { MenuItemConstructorOptions } from 'electron'

// The macOS menu bar (spec §10.1: Help → Reveal logs). Settings… opens the Settings page; the
// Edit menu gives text fields copy, paste and undo; Window gives ⌘W and ⌘M. The developer tools
// are offered only in development.
export function menuTemplate(o: {
  appName: string
  dev: boolean
  showSettings: () => void
  revealLogs: () => void
  revealBackups: () => void
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
