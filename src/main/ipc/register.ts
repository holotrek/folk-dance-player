import type { IpcMain } from 'electron'
import { INVOKE_CHANNELS, type InvokeHandlers } from '@shared/contract'

// Binds every channel. `handlers` is one set, or a function that picks the set for the window that
// asked (the tour answers its window from a practice library, tour spec §4.1).
export function registerHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  handlers: InvokeHandlers | ((event: { sender: { id: number } }) => InvokeHandlers)
): void {
  for (const channel of INVOKE_CHANNELS) {
    ipc.handle(channel, (event, ...args: unknown[]) => {
      const set = typeof handlers === 'function' ? handlers(event) : handlers
      return (set[channel] as (...a: unknown[]) => unknown)(...args)
    })
  }
}
