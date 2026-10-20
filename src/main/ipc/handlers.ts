import type { AttachmentStore } from '../attachments/attachment-store'
import type { DatabaseSync } from 'node:sqlite'
import type { AppInfo, InvokeHandlers } from '@shared/contract'
import type { RemoteStatus } from '@shared/program'
import { appleSyncHandlers, type AppleSyncHandlerDeps } from './apple-sync-handlers'
import { canvaHandlers, type CanvaDeps } from './canva-handlers'
import { projectorHandlers, type ProjectorDeps } from './projector-handlers'
import type { ImportService } from '../import/import-service'
import { getLibraryStats } from '../library/stats'
import type { PlayerSession } from '../session/player-session'
import { libraryHandlers } from './library-handlers'
import { programHandlers } from './program-handlers'
import type { SettingsStore } from '../settings/settings-store'

export interface Dialogs {
  pickMusic(): Promise<string[]>
  pickAppleLibrary(): Promise<string | null>
  pickPdf(): Promise<string | null>
}

export interface HandlerDeps {
  db: DatabaseSync
  settings: SettingsStore
  appInfo: () => AppInfo
  importer: Pick<ImportService, 'run' | 'cancel' | 'previewApple' | 'checkPlaylistConflicts'>
  dialogs: Dialogs
  player: PlayerSession
  // Whether a file is on disk (the program pre-check); defaults to the real file system.
  fileExists?: (path: string) => boolean
  // The remote's media keys (spec §7.4); reported off when absent.
  remote?: { status(): RemoteStatus; requestAccess(): RemoteStatus }
  // The projector window (spec §8); reported off when absent.
  projector?: ProjectorDeps
  // A dance's PDF and slide image (0.3.0 spec §3.6, §3.7); attaching fails when absent.
  attachments?: Pick<
    AttachmentStore,
    | 'attachPdf'
    | 'removePdf'
    | 'pdfPath'
    | 'pdfInfo'
    | 'attachImage'
    | 'removeImage'
    | 'imagePath'
    | 'imageInfo'
    | 'slideShows'
    | 'setSlideSource'
    | 'deleteUnreferenced'
  >
  // Opens a file in the system's default application; resolves to an error message, or ''.
  openPath?: (path: string) => Promise<string>
  // Canva decks and slide captures (spec §8.3); adding or linking fails when absent.
  canva?: CanvaDeps
  // Sync with Apple Music (sync spec); reported off when absent.
  appleSync?: AppleSyncHandlerDeps
  // Called after every change to songs, dances, playlists, favorites or holding.
  onLibraryChanged: () => void
  // Called after every change to programs or their items.
  onProgramsChanged: () => void
}

export function createHandlers(deps: HandlerDeps): InvokeHandlers {
  return {
    'app:getInfo': () => deps.appInfo(),
    'settings:getAll': () => deps.settings.getAll(),
    'settings:set': (key, value) => {
      deps.settings.set(key, value)
      return deps.settings.getAll()
    },
    'import:pickMusic': () => deps.dialogs.pickMusic(),
    'import:pickAppleLibrary': () => deps.dialogs.pickAppleLibrary(),
    'import:previewApple': (xmlPath) => deps.importer.previewApple(xmlPath),
    'import:checkPlaylistConflicts': (ids) => deps.importer.checkPlaylistConflicts(ids),
    'import:start': (request) => deps.importer.run(request),
    'import:cancel': () => deps.importer.cancel(),
    'library:stats': () => getLibraryStats(deps.db),
    ...libraryHandlers(deps),
    ...programHandlers(deps),
    ...projectorHandlers(deps),
    ...canvaHandlers(deps),
    ...appleSyncHandlers(deps)
  }
}
