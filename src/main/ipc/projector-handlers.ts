import type { InvokeHandlers } from '@shared/contract'
import {
  EMPTY_SNAPSHOT,
  PROJECTOR_OFF,
  type DisplayChoice,
  type ProjectorProgress,
  type ProjectorSnapshot,
  type ProjectorStatus
} from '@shared/projector'
import type { HandlerDeps } from './handlers'

// What the handlers need from the projector (main/index.ts joins the controller and the feed).
export interface ProjectorDeps {
  status(): ProjectorStatus
  setEnabled(on: boolean): void
  displays(): DisplayChoice[]
  displayChoiceChanged(): void
  snapshot(): ProjectorSnapshot
  progress(progress: ProjectorProgress): void
}

const NO_PROJECTOR: ProjectorDeps = {
  status: () => PROJECTOR_OFF,
  setEnabled: () => undefined,
  displays: () => [],
  displayChoiceChanged: () => undefined,
  snapshot: () => EMPTY_SNAPSHOT,
  progress: () => undefined
}

// Spec §8: the projector toggle and display choice, the projector window's snapshot, and the
// control window's progress reports.
export function projectorHandlers(
  deps: HandlerDeps
): Pick<InvokeHandlers, Extract<keyof InvokeHandlers, `projector:${string}`>> {
  const projector = deps.projector ?? NO_PROJECTOR
  return {
    'projector:status': () => projector.status(),
    'projector:setEnabled': (on) => {
      projector.setEnabled(on)
      return projector.status()
    },
    'projector:displays': () => projector.displays(),
    'projector:setDisplay': (displayId) => {
      deps.settings.set('projector.displayId', displayId)
      projector.displayChoiceChanged()
      return projector.status()
    },
    'projector:getSnapshot': () => projector.snapshot(),
    'projector:reportProgress': (playId, positionMs, durationMs) =>
      projector.progress({ playId, positionMs, durationMs })
  }
}
