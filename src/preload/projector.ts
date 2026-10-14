import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ProjectorApi } from '@shared/projector'

// The projector window is read-only (spec §8.2): it gets the snapshot and the position, and can
// send nothing back.
function listen<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const api: ProjectorApi = {
  getSnapshot: () => ipcRenderer.invoke('projector:getSnapshot'),
  onSnapshot: (listener) => listen('projector:snapshot', listener),
  onProgress: (listener) => listen('projector:progress', listener)
}

contextBridge.exposeInMainWorld('projector', api)
