import type { RendererApi } from '../shared/contract'
import type { ProjectorApi } from '../shared/projector'

declare global {
  interface Window {
    api: RendererApi // the control window
    projector: ProjectorApi // the projector window
  }
}

export {}
