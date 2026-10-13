import type { IpcMain } from 'electron'
import { INVOKE_CHANNELS, type InvokeHandlers } from '@shared/contract'

export function registerHandlers(ipc: Pick<IpcMain, 'handle'>, handlers: InvokeHandlers): void {
  for (const channel of INVOKE_CHANNELS) {
    const handler = handlers[channel] as (...args: unknown[]) => unknown
    ipc.handle(channel, (_event, ...args: unknown[]) => handler(...args))
  }
}
