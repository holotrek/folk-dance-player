import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type RendererApi } from '@shared/contract'

const allowedInvoke = new Set<string>(INVOKE_CHANNELS)
const allowedEvents = new Set<string>(EVENT_CHANNELS)

const api: RendererApi = {
  invoke: ((channel: string, ...args: unknown[]) => {
    if (!allowedInvoke.has(channel)) return Promise.reject(new Error(`Unknown channel: ${channel}`))
    return ipcRenderer.invoke(channel, ...args)
  }) as RendererApi['invoke'],
  on: ((channel: string, listener: (payload: unknown) => void) => {
    if (!allowedEvents.has(channel)) throw new Error(`Unknown event channel: ${channel}`)
    const wrapped = (_event: IpcRendererEvent, payload: unknown): void => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }) as RendererApi['on'],
  getPathsForFiles: (files) => files.map((f) => webUtils.getPathForFile(f)).filter(Boolean)
}

contextBridge.exposeInMainWorld('api', api)
