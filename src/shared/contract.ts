import type { SettingKey, Settings } from './settings'

export interface AppInfo {
  version: string
  dbPath: string
  schemaVersion: number
}

// Every renderer → main request. Add a channel here, to INVOKE_CHANNELS, and to createHandlers.
export interface InvokeContract {
  'app:getInfo': { args: []; result: AppInfo }
  'settings:getAll': { args: []; result: Settings }
  'settings:set': { args: [key: SettingKey, value: unknown]; result: Settings }
}

export type InvokeChannel = keyof InvokeContract
export type InvokeArgs<C extends InvokeChannel> = InvokeContract[C]['args']
export type InvokeResult<C extends InvokeChannel> = InvokeContract[C]['result']

export const INVOKE_CHANNELS = [
  'app:getInfo',
  'settings:getAll',
  'settings:set'
] as const satisfies readonly InvokeChannel[]

// Compile error if a channel in InvokeContract is missing from INVOKE_CHANNELS.
type MissingChannels = Exclude<InvokeChannel, (typeof INVOKE_CHANNELS)[number]>
const allChannelsListed: [MissingChannels] extends [never] ? true : MissingChannels = true
void allChannelsListed

export interface RendererApi {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
}

export type InvokeHandlers = {
  [C in InvokeChannel]: (...args: InvokeArgs<C>) => InvokeResult<C> | Promise<InvokeResult<C>>
}
