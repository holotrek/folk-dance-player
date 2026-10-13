import type { AppInfo, InvokeHandlers } from '@shared/contract'
import type { SettingsStore } from '../settings/settings-store'

export interface HandlerDeps {
  settings: SettingsStore
  appInfo: () => AppInfo
}

export function createHandlers(deps: HandlerDeps): InvokeHandlers {
  return {
    'app:getInfo': () => deps.appInfo(),
    'settings:getAll': () => deps.settings.getAll(),
    'settings:set': (key, value) => {
      deps.settings.set(key, value)
      return deps.settings.getAll()
    }
  }
}
