import type { EventChannel, EventContract, InvokeChannel, RendererApi } from '@shared/contract'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'

type Handler = (...args: never[]) => unknown

export interface FakeApi {
  api: RendererApi
  // Every invoke, as [channel, ...args].
  calls: unknown[][]
  callsTo(channel: InvokeChannel): unknown[][]
  emit<C extends EventChannel>(channel: C, payload: EventContract[C]): void
  settings: Settings
}

// A RendererApi for component tests. `handlers` answer invoke channels (sync or async values,
// or functions of the call's arguments); settings:getAll/settings:set work out of the box.
export function createFakeApi(
  handlers: Partial<Record<InvokeChannel, unknown>> = {},
  paths: string[] = []
): FakeApi {
  const calls: unknown[][] = []
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  const fake: FakeApi = {
    calls,
    callsTo: (channel) => calls.filter((c) => c[0] === channel).map((c) => c.slice(1)),
    emit: (channel, payload) => listeners.get(channel)?.forEach((l) => l(payload)),
    settings: { ...DEFAULT_SETTINGS },
    api: {
      invoke: (async (channel: InvokeChannel, ...args: unknown[]) => {
        calls.push([channel, ...args])
        if (channel in handlers) {
          const handler = handlers[channel]
          return typeof handler === 'function'
            ? (handler as Handler)(...(args as never[]))
            : handler
        }
        if (channel === 'settings:getAll') return fake.settings
        if (channel === 'settings:set') {
          const [key, value] = args as [keyof Settings, unknown]
          fake.settings = { ...fake.settings, [key]: value }
          return fake.settings
        }
        throw new Error(`No fake handler for ${channel}`)
      }) as RendererApi['invoke'],
      on: ((channel: string, listener: (payload: unknown) => void) => {
        if (!listeners.has(channel)) listeners.set(channel, new Set())
        listeners.get(channel)!.add(listener)
        return () => listeners.get(channel)!.delete(listener)
      }) as RendererApi['on'],
      getPathsForFiles: () => paths
    }
  }
  return fake
}
