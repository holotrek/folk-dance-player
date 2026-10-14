import { beforeEach, describe, expect, test } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { addStop, addTracks, createProgram } from '../../../src/main/programs/programs'
import { createProjectorFeed } from '../../../src/main/projector/projector-feed'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'
import { testPlayer } from '../helpers/test-player'

let db: DatabaseSync
let settings: SettingsStore
let sent: [string, unknown][]
let open: boolean

function setup() {
  const player = testPlayer(db, settings)
  const feed = createProjectorFeed({
    db,
    player,
    projector: {
      status: () => ({
        enabled: open,
        open,
        mode: open ? 'projector' : null,
        display: null,
        notice: null
      }),
      send: (channel, payload) => void sent.push([channel, payload])
    }
  })
  return { player, feed }
}

beforeEach(() => {
  db = createTestDb()
  settings = new SettingsStore(db)
  settings.set('countdown.seconds', 0)
  sent = []
  open = true
})

describe('projector feed', () => {
  test('the snapshot follows the player and the loaded program', () => {
    const hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora', country: 'Romania' } })
    const kolo = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo', country: 'Serbia' } })
    const p = createProgram(db, 'Set')
    addTracks(db, p, [hora.fileId])
    addStop(db, p)
    addTracks(db, p, [kolo.fileId])
    settings.set('currentProgramId', p)
    const { player, feed } = setup()
    player.refresh()
    expect(feed.snapshot().middle).toMatchObject({
      kind: 'next',
      entry: { parts: { dance: 'Hora' }, country: 'Romania' }
    })
    player.play()
    const snap = feed.snapshot()
    expect(snap.middle).toMatchObject({ kind: 'now', entry: { parts: { dance: 'Hora' } } })
    expect(snap.upcoming.map((r) => r.kind)).toEqual(['teaching', 'dance'])
    expect(snap.played).toEqual([]) // Hora is playing: shown in the middle, not twice
  })

  test('update sends the snapshot to an open projector only', () => {
    const { feed } = setup()
    feed.update()
    expect(sent.map(([c]) => c)).toEqual(['projector:snapshot'])
    open = false
    feed.update()
    expect(sent).toHaveLength(1)
  })

  test('progress goes straight to the projector', () => {
    const { feed } = setup()
    feed.progress({ playId: 3, positionMs: 1000, durationMs: 180_000 })
    expect(sent).toEqual([
      ['projector:progress', { playId: 3, positionMs: 1000, durationMs: 180_000 }]
    ])
  })

  test('with no program loaded, the snapshot is empty', () => {
    const { feed } = setup()
    expect(feed.snapshot()).toEqual({ hasProgram: false, middle: null, upcoming: [], played: [] })
  })
})
