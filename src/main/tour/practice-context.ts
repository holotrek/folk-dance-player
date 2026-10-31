import { rmSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import type { EventChannel, EventContract, InvokeChannel, InvokeHandlers } from '@shared/contract'
import { coalesced } from '../coalesce'
import { getSchemaVersion } from '../db/migrate'
import { createHandlers } from '../ipc/handlers'
import { trackPath } from '../programs/tracks'
import { PlayerSession } from '../session/player-session'
import { createSessionPorts } from '../session/session-ports'
import { SettingsStore } from '../settings/settings-store'
import { buildDemoLibrary } from './demo-library'

export const UNAVAILABLE = 'Not available in the practice library'

// Calls that need the real app: file pickers, importing, Apple Music, Canva and attachments. The
// tour explains these instead of running them (tour spec §6), so nothing reaches them.
const UNAVAILABLE_CHANNELS = [
  'import:pickMusic',
  'import:pickAppleLibrary',
  'import:previewApple',
  'import:start',
  'library:attachNotesPdf',
  'library:openNotesPdf',
  'library:removeNotesPdf',
  'library:attachSlideImage',
  'library:removeSlideImage',
  'library:setSlideSource',
  'canva:addDeck',
  'canva:linkSlide',
  'canva:linkPageLink',
  'canva:clearSlide',
  'canva:refreshDecks',
  'canva:refreshSlides',
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

export interface PracticeContext {
  db: DatabaseSync
  handlers: InvokeHandlers
  // Where a song's audio is, for the media protocol while this context is active.
  mediaPath(fileId: number): string | null
  // Closes the database and deletes the practice folder.
  dispose(): void
}

export interface PracticeOptions {
  dir: string
  tunePath: string
  appVersion: string
  // Where the context's events go: only to the window that is touring.
  send<C extends EventChannel>(channel: C, payload: EventContract[C]): void
}

// A second, complete set of handlers over a throwaway library (tour spec §4.1): its own database,
// settings and player, with no import, sync, Canva, projector, remote or attachments.
export function createPracticeContext(opts: PracticeOptions): PracticeContext {
  const { db, dbPath } = buildDemoLibrary(opts.dir, opts.tunePath)
  const settings = new SettingsStore(db)
  const programsChanged = coalesced(() => opts.send('programs:changed', null))
  const libraryChanged = coalesced(() => opts.send('library:changed', null))
  const player = new PlayerSession(
    createSessionPorts(db, settings, undefined, { programsChanged, libraryChanged }),
    { setTimeout, clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout) },
    (state) => opts.send('player:state', state)
  )
  const handlers = createHandlers({
    db,
    settings,
    appInfo: () => ({ version: opts.appVersion, dbPath, schemaVersion: getSchemaVersion(db) }),
    importer: {
      run: () => Promise.reject(new Error(UNAVAILABLE)),
      cancel: () => undefined,
      previewApple: () => Promise.reject(new Error(UNAVAILABLE)),
      checkPlaylistConflicts: () => []
    },
    dialogs: {
      pickMusic: () => Promise.reject(new Error(UNAVAILABLE)),
      pickAppleLibrary: () => Promise.reject(new Error(UNAVAILABLE)),
      pickPdf: () => Promise.reject(new Error(UNAVAILABLE)),
      pickImage: () => Promise.reject(new Error(UNAVAILABLE))
    },
    player,
    onLibraryChanged: () => {
      player.refresh()
      libraryChanged()
    },
    onProgramsChanged: programsChanged
  })
  for (const channel of UNAVAILABLE_CHANNELS) {
    ;(handlers as Record<string, unknown>)[channel] = () => Promise.reject(new Error(UNAVAILABLE))
  }
  let disposed = false
  return {
    db,
    handlers,
    mediaPath: (fileId) => trackPath(db, fileId),
    dispose: () => {
      if (disposed) return
      disposed = true
      player.stop()
      db.close()
      rmSync(opts.dir, { recursive: true, force: true })
    }
  }
}
