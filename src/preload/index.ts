import { contextBridge, ipcRenderer } from 'electron'
import { INVOKE_CHANNELS, type RendererApi } from '@shared/contract'

const allowed = new Set<string>(INVOKE_CHANNELS)

const api: RendererApi = {
  invoke: ((channel: string, ...args: unknown[]) => {
    if (!allowed.has(channel)) return Promise.reject(new Error(`Unknown channel: ${channel}`))
    return ipcRenderer.invoke(channel, ...args)
  }) as RendererApi['invoke']
}

contextBridge.exposeInMainWorld('api', api)
