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
// Add Music… is the exception: the tour walks through it with a pretend folder (below).
const PRACTICE_FOLDER = '/Practice Music/Folk dance mix'

const UNAVAILABLE_CHANNELS = [
  'import:pickAppleLibrary',
  'import:previewApple',
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
  tuneDir: string // holds the practice tunes (hava-nagila.wav, korobushka.wav)
  appVersion: string
  // Where the context's events go: only to the window that is touring.
  send<C extends EventChannel>(channel: C, payload: EventContract[C]): void
}

// A second, complete set of handlers over a throwaway library (tour spec §4.1): its own database,
// settings and player, with no import, sync, Canva, projector, remote or attachments.
export function createPracticeContext(opts: PracticeOptions): PracticeContext {
  const { db, dbPath } = buildDemoLibrary(opts.dir, opts.tuneDir)
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
      // A pretend import (tour spec §3, step 1): it "finds" the songs the practice library already
      // has, so the dialog's mapping, progress and summary are real and nothing is added.
      run: async () => {
        const found = (
          db.prepare('SELECT path FROM files ORDER BY path').all() as { path: string }[]
        ).map((f) => ({ path: f.path }))
        opts.send('import:progress', { phase: 'scanning', done: 0, total: 0, currentPath: null })
        opts.send('import:progress', {
          phase: 'reading',
          done: found.length,
          total: found.length,
          currentPath: found.at(-1)?.path ?? null
        })
        opts.send('import:progress', {
          phase: 'done',
          done: found.length,
          total: found.length,
          currentPath: null
        })
        return {
          added: [],
          updated: [],
          relinked: [],
          alreadyPresent: found,
          restored: [],
          appleSynced: [],
          notFound: [],
          unsupported: [],
          unreadable: [],
          playlists: { created: [], replaced: [], kept: [], duplicated: [] },
          cancelled: false
        }
      },
      cancel: () => undefined,
      previewApple: () => Promise.reject(new Error(UNAVAILABLE)),
      checkPlaylistConflicts: () => []
    },
    dialogs: {
      pickMusic: () => Promise.resolve([PRACTICE_FOLDER]),
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
