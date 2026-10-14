import { existsSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import type { SettingsStore } from '../settings/settings-store'
import { getLoggedPlay, logPlay } from '../programs/history'
import { getProgram, markPlayed, markUnplayed } from '../programs/programs'
import { getTrack, trackPath } from '../programs/tracks'
import type { SessionPorts } from './player-session'

export interface SessionNotices {
  programsChanged(): void // an item was marked played, or a play was logged
  libraryChanged(): void // a file was flagged missing, or found again
}

const quiet: SessionNotices = { programsChanged: () => undefined, libraryChanged: () => undefined }

// The session's view of the database and settings.
export function createSessionPorts(
  db: DatabaseSync,
  settings: SettingsStore,
  exists: (path: string) => boolean = existsSync,
  notices: SessionNotices = quiet
): SessionPorts {
  return {
    programId: () => settings.get('currentProgramId'),
    unplayedItems: (programId) => getProgram(db, programId)?.items ?? [],
    markPlayed: (itemId) => {
      markPlayed(db, itemId)
      notices.programsChanged()
    },
    markUnplayed: (itemId) => {
      markUnplayed(db, itemId)
      notices.programsChanged()
    },
    getTrack: (fileId, danceId) => getTrack(db, fileId, danceId),
    getLoggedPlay: (logId) => getLoggedPlay(db, logId),
    logPlay: (entry) => {
      logPlay(db, entry)
      notices.programsChanged()
    },
    checkFile: (fileId) => {
      const path = trackPath(db, fileId)
      const ok = path !== null && exists(path)
      const flagged = db
        .prepare(
          'UPDATE files SET is_missing = ?, missing_reason = ? WHERE id = ? AND is_missing <> ?'
        )
        .run(ok ? 0 : 1, ok ? null : 'not_found', fileId, ok ? 0 : 1)
      if (flagged.changes) notices.libraryChanged()
      return ok
    },
    autoContinue: () => ({
      enabled: settings.get('autoContinue.enabled'),
      seconds: settings.get('autoContinue.seconds')
    }),
    countdownSeconds: () => settings.get('countdown.seconds')
  }
}
