import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, test, vi } from 'vitest'
import { menuTemplate, syncAppleMusicFromMenu } from '../../../src/main/menu'

function setup(dev = false, appleSync = false) {
  const actions = {
    showSettings: vi.fn(),
    revealLogs: vi.fn(),
    revealBackups: vi.fn(),
    syncAppleMusic: vi.fn()
  }
  return {
    actions,
    menu: menuTemplate({ appName: 'Folk Dance Player', dev, appleSync, ...actions })
  }
}

const submenu = (menu: MenuItemConstructorOptions[], label: string) =>
  menu.find((m) => m.label === label || m.role === label)!.submenu as MenuItemConstructorOptions[]
const item = (items: MenuItemConstructorOptions[], label: string) =>
  items.find((i) => i.label === label)!
const click = (i: MenuItemConstructorOptions) => (i.click as () => void)()

describe('the app menu', () => {
  test('the app menu has About, Settings… (⌘,) and Quit', () => {
    const { menu, actions } = setup()
    const app = submenu(menu, 'Folk Dance Player')
    expect(app[0].role).toBe('about')
    const settings = item(app, 'Settings…')
    expect(settings.accelerator).toBe('CmdOrCtrl+,')
    click(settings)
    expect(actions.showSettings).toHaveBeenCalled()
    expect(app.at(-1)!.role).toBe('quit')
  })

  test('Edit and Window are the standard ones, so copy, paste and ⌘M work', () => {
    const { menu } = setup()
    expect(menu.map((m) => m.role ?? m.label)).toEqual([
      'Folk Dance Player',
      'editMenu',
      'View',
      'windowMenu',
      'help'
    ])
  })

  test('Help reveals the logs and the library backups in Finder', () => {
    const { menu, actions } = setup()
    const help = submenu(menu, 'help')
    click(item(help, 'Reveal Logs in Finder'))
    click(item(help, 'Reveal Library Backups in Finder'))
    expect(actions.revealLogs).toHaveBeenCalled()
    expect(actions.revealBackups).toHaveBeenCalled()
  })

  test('the developer tools are in View only in development', () => {
    const roles = (dev: boolean) => submenu(setup(dev).menu, 'View').map((i) => i.role)
    expect(roles(true)).toContain('toggleDevTools')
    expect(roles(false)).not.toContain('toggleDevTools')
    expect(roles(false)).toContain('togglefullscreen')
  })

  test('File → Sync with Apple Music (⌘⇧S) appears only where sync is available', () => {
    const { menu, actions } = setup(false, true)
    const sync = item(submenu(menu, 'File'), 'Sync with Apple Music')
    expect(sync.accelerator).toBe('CmdOrCtrl+Shift+S')
    click(sync)
    expect(actions.syncAppleMusic).toHaveBeenCalled()
    expect(setup(false, false).menu.find((m) => m.label === 'File')).toBeUndefined()
  })

  test('Sync with Apple Music, while sync is off, shows the switch on the Music page', () => {
    const calls: unknown[] = []
    const actions = {
      showPage: (target: unknown) => calls.push(['showPage', target]),
      syncNow: () => calls.push(['syncNow'])
    }
    syncAppleMusicFromMenu('off', actions)
    syncAppleMusicFromMenu('idle', actions)
    expect(calls).toEqual([['showPage', { page: 'music', highlight: 'appleSync' }], ['syncNow']])
  })
})
