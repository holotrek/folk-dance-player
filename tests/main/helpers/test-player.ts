import type { DatabaseSync } from 'node:sqlite'
import { PlayerSession } from '../../../src/main/session/player-session'
import { createSessionPorts } from '../../../src/main/session/session-ports'
import type { SettingsStore } from '../../../src/main/settings/settings-store'

// A real PlayerSession over a test database, for handler tests. Every file "exists".
export function testPlayer(db: DatabaseSync, settings: SettingsStore): PlayerSession {
  return new PlayerSession(
    createSessionPorts(db, settings, () => true),
    { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as never) },
    () => undefined
  )
}
