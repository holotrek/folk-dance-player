import type { InvokeHandlers } from '@shared/contract'
import { UPDATE_IDLE } from '@shared/updates'
import type { HandlerDeps } from './handlers'

type UpdateChannel = Extract<keyof InvokeHandlers, `updates:${string}`>

// The updater's calls (updates spec §5). Without an updater (the practice library, most tests) the
// state is idle and a check says this copy cannot update itself.
export function updateHandlers(deps: HandlerDeps): Pick<InvokeHandlers, UpdateChannel> {
  const { updates } = deps
  return {
    'updates:getState': () => updates?.getState() ?? UPDATE_IDLE,
    'updates:check': () => updates?.checkNow() ?? { kind: 'unsupported' },
    'updates:install': () => updates?.install()
  }
}
