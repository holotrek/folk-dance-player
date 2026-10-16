import { APPLE_SYNC_OFF } from '@shared/apple-sync'
import type { InvokeHandlers } from '@shared/contract'
import type { AppleSync } from '../apple-sync/apple-sync'

export type AppleSyncHandlerDeps = Pick<
  AppleSync,
  | 'status'
  | 'preview'
  | 'enable'
  | 'disable'
  | 'syncNow'
  | 'switchLibrary'
  | 'resolve'
  | 'resolveAll'
> & { openPrivacySettings(): void }

type AppleSyncChannel = Extract<keyof InvokeHandlers, `appleSync:${string}`>

// Sync with Apple Music (sync spec §3.3, §6). Without it (other platforms) the status is off and
// every action fails.
export function appleSyncHandlers(deps: {
  appleSync?: AppleSyncHandlerDeps
}): Pick<InvokeHandlers, AppleSyncChannel> {
  const sync = (): AppleSyncHandlerDeps => {
    if (!deps.appleSync) throw new Error('Sync with Apple Music is only available on macOS.')
    return deps.appleSync
  }
  return {
    'appleSync:status': () => deps.appleSync?.status() ?? APPLE_SYNC_OFF,
    'appleSync:preview': () => sync().preview(),
    'appleSync:enable': (decisions) => sync().enable(decisions),
    'appleSync:disable': () => sync().disable(),
    'appleSync:syncNow': () => sync().syncNow(),
    'appleSync:switchLibrary': () => sync().switchLibrary(),
    'appleSync:resolve': (fileIds, action) => sync().resolve(fileIds, action),
    'appleSync:resolveAll': (action) => sync().resolveAll(action),
    'appleSync:openPrivacySettings': () => sync().openPrivacySettings()
  }
}
