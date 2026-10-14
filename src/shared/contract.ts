import type {
  ApplePlaylistConflict,
  ApplePreview,
  ImportMapping,
  ImportProgress,
  ImportRequest,
  ImportSummary
} from './import'
import type {
  DancePatch,
  DanceSearchResult,
  LibraryQuery,
  LibraryRow,
  PlaylistSummary,
  ReapplyResult,
  SongDetail,
  SongTags,
  SongPatch,
  Suggestions
} from './library'
import type { PlayedEntry, PlayerState, ProgramDetail, ProgramSummary } from './program'
import type { SettingKey, Settings } from './settings'

export interface AppInfo {
  version: string
  dbPath: string
  schemaVersion: number
}

export interface LibraryStats {
  fileCount: number
}

// Every renderer → main request. Add a channel here, to INVOKE_CHANNELS, and to createHandlers.
export interface InvokeContract {
  'app:getInfo': { args: []; result: AppInfo }
  'settings:getAll': { args: []; result: Settings }
  'settings:set': { args: [key: SettingKey, value: unknown]; result: Settings }
  'import:pickMusic': { args: []; result: string[] }
  'import:pickAppleLibrary': { args: []; result: string | null }
  'import:previewApple': { args: [xmlPath: string]; result: ApplePreview }
  'import:checkPlaylistConflicts': {
    args: [persistentIds: string[]]
    result: ApplePlaylistConflict[]
  }
  'import:start': { args: [request: ImportRequest]; result: ImportSummary }
  'import:cancel': { args: []; result: void }
  'library:stats': { args: []; result: LibraryStats }
  'library:list': { args: [query: LibraryQuery]; result: LibraryRow[] }
  'library:song': { args: [songId: number]; result: SongDetail | null }
  'library:updateSong': { args: [songId: number, patch: SongPatch]; result: void }
  'library:updateDance': { args: [danceId: number, patch: DancePatch]; result: void }
  'library:setTeacher': { args: [pairingId: number, teacher: string | null]; result: void }
  'library:setDefaultDance': { args: [songId: number, danceId: number]; result: void }
  'library:linkDance': { args: [songId: number, danceId: number]; result: void }
  'library:createDance': { args: [songId: number, name: string]; result: number }
  'library:unlinkDance': { args: [songId: number, danceId: number]; result: void }
  'library:mergeDances': { args: [keepId: number, removeId: number]; result: void }
  'library:sameDance': { args: [songId: number, ownId: number, otherId: number]; result: void }
  'library:markDifferent': { args: [danceA: number, danceB: number]; result: void }
  'library:searchDances': { args: [text: string]; result: DanceSearchResult[] }
  'library:setFavorite': { args: [fileIds: number[], favorite: boolean]; result: void }
  'library:songTags': { args: [songIds: number[]]; result: SongTags[] }
  'library:reapplyMapping': {
    args: [songIds: number[], mapping: ImportMapping]
    result: ReapplyResult
  }
  'library:suggestions': { args: []; result: Suggestions }
  'playlists:list': { args: []; result: PlaylistSummary[] }
  'playlists:create': { args: [name: string]; result: number }
  'playlists:rename': { args: [playlistId: number, name: string]; result: void }
  'playlists:duplicate': { args: [playlistId: number]; result: number }
  'playlists:delete': { args: [playlistId: number]; result: void }
  'playlists:add': { args: [playlistId: number, fileIds: number[]]; result: void }
  'playlists:remove': { args: [playlistId: number, itemIds: number[]]; result: void }
  'playlists:reorder': { args: [playlistId: number, itemIds: number[]]; result: void }
  // Holding places songs before `beforeFileId` (a held song) or at the end; held songs move.
  'library:setHolding': {
    args: [fileIds: number[], held: boolean, beforeFileId?: number | null]
    result: void
  }
  'programs:list': { args: [search: string]; result: ProgramSummary[] }
  'programs:get': { args: [programId: number]; result: ProgramDetail | null }
  'programs:create': { args: [name: string]; result: number }
  'programs:rename': { args: [programId: number, name: string]; result: void }
  'programs:duplicate': { args: [programId: number]; result: number }
  'programs:delete': { args: [programId: number]; result: void }
  // Loads a program (spec §6.1): it becomes current, and its files are checked (§10.1).
  'programs:setCurrent': { args: [programId: number | null]; result: void }
  'programs:addTracks': {
    args: [programId: number, fileIds: number[], beforeItemId: number | null]
    result: number[]
  }
  'programs:addStop': { args: [programId: number, beforeItemId: number | null]; result: number }
  'programs:reorder': { args: [programId: number, itemIds: number[]]; result: void }
  'programs:removeItems': { args: [programId: number, itemIds: number[]]; result: void }
  'programs:setItemDance': { args: [itemId: number, danceId: number]; result: void }
  'programs:played': { args: [programId: number]; result: PlayedEntry[] }
  'player:getState': { args: []; result: PlayerState }
  'player:play': { args: []; result: void }
  'player:pause': { args: []; result: void }
  'player:stop': { args: []; result: void }
  'player:next': { args: []; result: void }
  'player:preview': { args: [fileId: number]; result: void }
  'player:replay': { args: [logId: number]; result: void }
  // Reports from the control window's <audio> element, for play `playId`.
  'player:ended': { args: [playId: number]; result: void }
  'player:failed': { args: [playId: number, message: string]; result: void }
  'player:setSpeed': { args: [speed: number]; result: void }
  'player:setSpeedLocked': { args: [locked: boolean]; result: void }
  'player:setVolume': { args: [volume: number]; result: void }
  'player:setAutoContinue': {
    args: [change: { enabled?: boolean; seconds?: number }]
    result: void
  }
  'player:dismissWarning': { args: []; result: void }
}

export type InvokeChannel = keyof InvokeContract
export type InvokeArgs<C extends InvokeChannel> = InvokeContract[C]['args']
export type InvokeResult<C extends InvokeChannel> = InvokeContract[C]['result']

export const INVOKE_CHANNELS = [
  'app:getInfo',
  'settings:getAll',
  'settings:set',
  'import:pickMusic',
  'import:pickAppleLibrary',
  'import:previewApple',
  'import:checkPlaylistConflicts',
  'import:start',
  'import:cancel',
  'library:stats',
  'library:list',
  'library:song',
  'library:updateSong',
  'library:updateDance',
  'library:setTeacher',
  'library:setDefaultDance',
  'library:linkDance',
  'library:createDance',
  'library:unlinkDance',
  'library:mergeDances',
  'library:sameDance',
  'library:markDifferent',
  'library:searchDances',
  'library:setFavorite',
  'library:songTags',
  'library:reapplyMapping',
  'library:suggestions',
  'playlists:list',
  'playlists:create',
  'playlists:rename',
  'playlists:duplicate',
  'playlists:delete',
  'playlists:add',
  'playlists:remove',
  'playlists:reorder',
  'library:setHolding',
  'programs:list',
  'programs:get',
  'programs:create',
  'programs:rename',
  'programs:duplicate',
  'programs:delete',
  'programs:setCurrent',
  'programs:addTracks',
  'programs:addStop',
  'programs:reorder',
  'programs:removeItems',
  'programs:setItemDance',
  'programs:played',
  'player:getState',
  'player:play',
  'player:pause',
  'player:stop',
  'player:next',
  'player:preview',
  'player:replay',
  'player:ended',
  'player:failed',
  'player:setSpeed',
  'player:setSpeedLocked',
  'player:setVolume',
  'player:setAutoContinue',
  'player:dismissWarning'
] as const satisfies readonly InvokeChannel[]

// Compile error if a channel in InvokeContract is missing from INVOKE_CHANNELS.
type MissingChannels = Exclude<InvokeChannel, (typeof INVOKE_CHANNELS)[number]>
const allChannelsListed: [MissingChannels] extends [never] ? true : MissingChannels = true
void allChannelsListed

// Every main → renderer event. Add a channel here and to EVENT_CHANNELS.
export interface EventContract {
  'import:progress': ImportProgress
  // Songs, dances, playlists or favorites changed (an edit or a finished import): refetch.
  'library:changed': null
  // Programs, their items or the play log changed: refetch.
  'programs:changed': null
  // The player's state after every change (spec §9).
  'player:state': PlayerState
}

export type EventChannel = keyof EventContract

export const EVENT_CHANNELS = [
  'import:progress',
  'library:changed',
  'programs:changed',
  'player:state'
] as const satisfies readonly EventChannel[]

type MissingEvents = Exclude<EventChannel, (typeof EVENT_CHANNELS)[number]>
const allEventsListed: [MissingEvents] extends [never] ? true : MissingEvents = true
void allEventsListed

export interface RendererApi {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
  // Subscribes to a main → renderer event; returns the unsubscribe function.
  on<C extends EventChannel>(channel: C, listener: (payload: EventContract[C]) => void): () => void
  // File paths for files dropped onto the window (Electron's webUtils.getPathForFile).
  getPathsForFiles(files: File[]): string[]
}

export type InvokeHandlers = {
  [C in InvokeChannel]: (...args: InvokeArgs<C>) => InvokeResult<C> | Promise<InvokeResult<C>>
}
