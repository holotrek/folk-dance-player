import type { RendererApi } from '../shared/contract'

declare global {
  interface Window {
    api: RendererApi
  }
}

export {}
