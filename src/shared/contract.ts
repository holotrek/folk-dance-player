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
import type {
  PlayedEntry,
  PlayerState,
  HoldingItem,
  ProgramDetail,
  ProgramSummary,
  RemoteStatus
} from './program'
import type { TourPart, TourState } from './tour'
import type {
  DisplayChoice,
  ProjectorProgress,
  ProjectorSnapshot,
  ProjectorStatus
} from './projector'
import type { SettingKey, Settings } from './settings'
import type { CanvaDeck, CanvaPage, CaptureStatus, DanceSlide, RefreshSummary } from './canva'
import type {
  AppleSyncNotice,
  AppleSyncStatus,
  MirrorDecision,
  PlaylistFolder,
  ReviewAction,
  SyncPreview,
  SyncSummary
} from './apple-sync'

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
  // The guided tour (tour spec §4.6). These are always served by the real handlers, also while a
  // window is on the practice library. `start` and `leave` reload the window.
  'tour:offer': { args: []; result: TourPart | null }
  'tour:state': { args: []; result: TourState }
  'tour:start': { args: [part: TourPart]; result: void }
  'tour:finish': { args: [part: TourPart]; result: void }
  'tour:hide': { args: [part: TourPart]; result: void }
  'tour:leave': { args: []; result: void }
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
  // A dance's PDF (0.3.0 spec §3.6): the dialog is opened in main; false when it was canceled.
  'library:attachNotesPdf': { args: [danceId: number]; result: boolean }
  'library:openNotesPdf': { args: [danceId: number]; result: void }
  'library:removeNotesPdf': { args: [danceId: number]; result: void }
  // A dance's slide image and which slide the projector shows (§3.7).
  'library:attachSlideImage': { args: [danceId: number]; result: boolean }
  'library:removeSlideImage': { args: [danceId: number]; result: void }
  'library:setSlideSource': { args: [danceId: number, source: 'canva' | 'image']; result: void }
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
  // Music's playlist folders (sync spec §6.2).
  'playlists:folders': { args: []; result: PlaylistFolder[] }
  // Holding (0.3.0 spec §3.12): song-and-dance pairs in the order they were placed. `before` is a
  // holding row id (null: the end). Holding a song holds it as its default dance and returns the
  // holding rows, so the caller can ask which dance; a pair already held moves to the new spot.
  'library:holding': { args: []; result: HoldingItem[] }
  'library:holdSongs': { args: [fileIds: number[], before: number | null]; result: number[] }
  'library:moveHolding': { args: [itemIds: number[], before: number | null]; result: void }
  'library:releaseHolding': { args: [itemIds: number[]]; result: void }
  'library:setHoldingDance': { args: [itemId: number, danceId: number]; result: void }
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
  // Moves between a program and Holding: one operation each way (a transaction, one notice).
  // `before` is a holding row id for moveToHolding and a program item id for moveFromHolding.
  'programs:moveToHolding': {
    args: [programId: number, itemIds: number[], before: number | null]
    result: void
  }
  'programs:moveFromHolding': {
    args: [programId: number, holdingIds: number[], before: number | null]
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
  'player:restart': { args: []; result: void }
  'remote:status': { args: []; result: RemoteStatus }
  // Asks macOS for Accessibility permission (its own dialog), then reports the status.
  'remote:requestAccess': { args: []; result: RemoteStatus }
  // The player bar's projector toggle (spec §8.1).
  'projector:status': { args: []; result: ProjectorStatus }
  'projector:setEnabled': { args: [on: boolean]; result: ProjectorStatus }
  'projector:displays': { args: []; result: DisplayChoice[] }
  'projector:setDisplay': { args: [displayId: number | null]; result: ProjectorStatus }
  // The projector window asks for the current snapshot when it loads.
  'projector:getSnapshot': { args: []; result: ProjectorSnapshot }
  // The control window reports the playing song's position, for the projector's red line.
  'projector:reportProgress': {
    args: [playId: number, positionMs: number, durationMs: number | null]
    result: void
  }
  // Canva slides (spec §6.3, §8.3): decks, a dance's slide, and refreshing the saved images.
  'canva:decks': { args: []; result: CanvaDeck[] }
  'canva:deckPages': { args: [deckId: number]; result: CanvaPage[] }
  'canva:addDeck': { args: [link: string]; result: CanvaDeck }
  'canva:linkSlide': {
    args: [danceId: number, deckId: number, position: number]
    result: DanceSlide | null
  }
  'canva:linkPageLink': { args: [danceId: number, link: string]; result: DanceSlide | null }
  'canva:clearSlide': { args: [danceId: number]; result: void }
  'canva:refreshDecks': { args: []; result: RefreshSummary }
  'canva:refreshSlides': { args: []; result: RefreshSummary }
  'canva:captureStatus': { args: []; result: CaptureStatus }
  // Sync with Apple Music (sync spec §3.3, §6).
  'appleSync:status': { args: []; result: AppleSyncStatus }
  'appleSync:preview': { args: []; result: SyncPreview }
  'appleSync:enable': {
    // switchLibrary: adopt the library Music has open (chosen before the mapping step).
    args: [decisions: Record<string, MirrorDecision>, switchLibrary?: boolean]
    result: SyncSummary | null
  }
  'appleSync:disable': { args: []; result: void }
  'appleSync:syncNow': { args: []; result: void }
  'appleSync:switchLibrary': { args: []; result: void }
  // After a paused shrink (Music's library looks much smaller): one sync without the check.
  'appleSync:syncAnyway': { args: []; result: void }
  'appleSync:resolve': { args: [fileIds: number[], action: ReviewAction]; result: void }
  'appleSync:resolveAll': { args: [action: ReviewAction]; result: void }
  'appleSync:openPrivacySettings': { args: []; result: void }
}

export type InvokeChannel = keyof InvokeContract
export type InvokeArgs<C extends InvokeChannel> = InvokeContract[C]['args']
export type InvokeResult<C extends InvokeChannel> = InvokeContract[C]['result']

export const INVOKE_CHANNELS = [
  'app:getInfo',
  'tour:offer',
  'tour:state',
  'tour:start',
  'tour:finish',
  'tour:hide',
  'tour:leave',
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
  'library:attachNotesPdf',
  'library:openNotesPdf',
  'library:removeNotesPdf',
  'library:attachSlideImage',
  'library:removeSlideImage',
  'library:setSlideSource',
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
  'playlists:folders',
  'library:holding',
  'library:holdSongs',
  'library:moveHolding',
  'library:releaseHolding',
  'library:setHoldingDance',
  'programs:list',
  'programs:get',
  'programs:create',
  'programs:rename',
  'programs:duplicate',
  'programs:delete',
  'programs:setCurrent',
  'programs:addTracks',
  'programs:moveToHolding',
  'programs:moveFromHolding',
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
  'player:dismissWarning',
  'player:restart',
  'remote:status',
  'remote:requestAccess',
  'projector:status',
  'projector:setEnabled',
  'projector:displays',
  'projector:setDisplay',
  'projector:getSnapshot',
  'projector:reportProgress',
  'canva:decks',
  'canva:deckPages',
  'canva:addDeck',
  'canva:linkSlide',
  'canva:linkPageLink',
  'canva:clearSlide',
  'canva:refreshDecks',
  'canva:refreshSlides',
  'canva:captureStatus',
  'appleSync:status',
  'appleSync:preview',
  'appleSync:enable',
  'appleSync:disable',
  'appleSync:syncNow',
  'appleSync:switchLibrary',
  'appleSync:syncAnyway',
  'appleSync:resolve',
  'appleSync:resolveAll',
  'appleSync:openPrivacySettings'
] as const satisfies readonly InvokeChannel[]

// Compile error if a channel in InvokeContract is missing from INVOKE_CHANNELS.
type MissingChannels = Exclude<InvokeChannel, (typeof INVOKE_CHANNELS)[number]>
const allChannelsListed: [MissingChannels] extends [never] ? true : MissingChannels = true
void allChannelsListed

// A page the main process asks the control window to show (app menu items), and optionally a
// control there to highlight for a moment.
export type HighlightId = 'appleSync'
export interface PageTarget {
  page: 'settings' | 'music'
  highlight?: HighlightId
}

// Every main → renderer event. Add a channel here and to EVENT_CHANNELS.
export interface EventContract {
  'import:progress': ImportProgress
  // Songs, dances, playlists or favorites changed (an edit or a finished import): refetch.
  'library:changed': null
  // Programs, their items or the play log changed: refetch.
  'programs:changed': null
  // The player's state after every change (spec §9).
  'player:state': PlayerState
  // To the control window: the projector opened, closed or moved.
  'projector:status': ProjectorStatus
  // To the projector window only: what to show, and the playing song's position.
  'projector:snapshot': ProjectorSnapshot
  'projector:progress': ProjectorProgress
  // Background slide captures started, progressed or finished.
  'canva:captureStatus': CaptureStatus
  // To the control window: the app menu asks for a page (Settings…, or the Music page's sync switch).
  'app:showPage': PageTarget
  // To the control window: sync's state changed (and with it the review count or last result).
  'appleSync:state': AppleSyncStatus
  // To the control window: a toast or notice, once per occurrence (sync spec §6.5).
  'appleSync:notice': AppleSyncNotice
  // To the control window: show a tour part's intro screen (Help → Take the … Tour).
  'tour:intro': TourPart
}

export type EventChannel = keyof EventContract

export const EVENT_CHANNELS = [
  'import:progress',
  'library:changed',
  'programs:changed',
  'player:state',
  'projector:status',
  'projector:snapshot',
  'projector:progress',
  'canva:captureStatus',
  'app:showPage',
  'appleSync:state',
  'appleSync:notice',
  'tour:intro'
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
