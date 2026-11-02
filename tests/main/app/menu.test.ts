import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, test, vi } from 'vitest'
import { capabilitiesFor, type Platform } from '../../../src/shared/platform'
import { menuTemplate, syncAppleMusicFromMenu } from '../../../src/main/menu'

function setup(dev = false, appleSync = false, platform: Platform = 'mac') {
  const actions = {
    showSettings: vi.fn(),
    revealLogs: vi.fn(),
    revealBackups: vi.fn(),
    syncAppleMusic: vi.fn(),
    takeTour: vi.fn(),
    checkForUpdates: vi.fn(),
    showAbout: vi.fn()
  }
  return {
    actions,
    menu: menuTemplate({
      appName: 'Folk Dance Player',
      dev,
      appleSync,
      caps: capabilitiesFor(platform),
      ...actions
    })
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

  test('Check for Updates… sits right after About in the app menu', () => {
    const { menu, actions } = setup()
    const app = submenu(menu, 'Folk Dance Player')
    expect(app[0].role).toBe('about')
    expect(app[1].label).toBe('Check for Updates…')
    click(app[1])
    expect(actions.checkForUpdates).toHaveBeenCalledTimes(1)
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

  test('Help offers the Basic and the Advanced tour', () => {
    const { menu, actions } = setup()
    const help = submenu(menu, 'help')
    click(item(help, 'Take the Basic Tour…'))
    click(item(help, 'Take the Advanced Tour…'))
    expect(actions.takeTour.mock.calls).toEqual([['basic'], ['advanced']])
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

const MAC_ONLY = ['about', 'services', 'hide', 'hideOthers', 'unhide', 'windowMenu']
const walk = (items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] =>
  items.flatMap((i) => [i, ...(Array.isArray(i.submenu) ? walk(i.submenu) : [])])

describe('the Windows menu', () => {
  test('has no macOS-only roles, and no Apple Music item', () => {
    const { menu } = setup(false, false, 'windows')
    const all = walk(menu)
    expect(all.filter((i) => i.role && MAC_ONLY.includes(i.role))).toEqual([])
    expect(all.some((i) => /Apple/.test(i.label ?? ''))).toBe(false)
  })

  test('File has Settings… (Ctrl+,) and Exit', () => {
    const { menu, actions } = setup(false, false, 'windows')
    const file = submenu(menu, 'File')
    click(item(file, 'Settings…'))
    expect(actions.showSettings).toHaveBeenCalled()
    expect(item(file, 'Settings…').accelerator).toBe('CmdOrCtrl+,')
    expect(file.at(-1)).toMatchObject({ role: 'quit', label: 'Exit' })
  })

  test('Window offers Minimize but no Close Window (closing quits mid-dance)', () => {
    const { menu } = setup(false, false, 'windows')
    expect(submenu(menu, 'Window').map((i) => i.role)).toEqual(['minimize'])
  })

  test('Help has the tours, Check for Updates…, About and the folders in File Explorer', () => {
    const { menu, actions } = setup(false, false, 'windows')
    const help = submenu(menu, 'help')
    click(item(help, 'Take the Basic Tour…'))
    click(item(help, 'Check for Updates…'))
    click(item(help, 'About Folk Dance Player'))
    click(item(help, 'Show Logs in File Explorer'))
    click(item(help, 'Show Library Backups in File Explorer'))
    expect(actions.takeTour).toHaveBeenCalledWith('basic')
    expect(actions.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(actions.showAbout).toHaveBeenCalledTimes(1)
    expect(actions.revealLogs).toHaveBeenCalledTimes(1)
    expect(actions.revealBackups).toHaveBeenCalledTimes(1)
  })

  test('Edit and View are present; View offers the developer tools only in development', () => {
    const labels = (dev: boolean) =>
      walk(setup(dev, false, 'windows').menu).map((i) => i.role ?? i.label)
    expect(labels(false)).toContain('editMenu')
    expect(labels(false)).not.toContain('toggleDevTools')
    expect(labels(true)).toContain('toggleDevTools')
  })
})
