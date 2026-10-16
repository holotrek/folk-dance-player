import { beforeEach, describe, expect, test } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { recordCapture, saveDeck, setDanceSlide } from '../../../src/main/canva/decks'
import { addStop, addTracks, createProgram } from '../../../src/main/programs/programs'
import type { LiveTarget } from '../../../src/main/projector/live-slide'
import { createProjectorFeed } from '../../../src/main/projector/projector-feed'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'
import { testPlayer } from '../helpers/test-player'

let db: DatabaseSync
let settings: SettingsStore
let sent: [string, unknown][]
let open: boolean
let shown: (LiveTarget | null)[]
let liveNow: boolean

function setup() {
  const player = testPlayer(db, settings)
  const feed = createProjectorFeed({
    db,
    player,
    live: {
      show: (target) => void shown.push(target),
      isLive: () => liveNow
    },
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
  shown = []
  liveNow = false
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

  test("the middle dance's slide: its saved image, and the live view asked to show it", () => {
    const hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const kolo = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
    const viewUrl = 'https://www.canva.com/design/DAH/TOK/view'
    const deckId = saveDeck(
      db,
      { viewUrl, designId: 'DAH' },
      {
        title: 'Deck',
        pages: [
          { id: 'P1', title: null },
          { id: 'P2', title: null }
        ]
      }
    )
    setDanceSlide(db, hora.danceId!, deckId, 2)
    recordCapture(db, deckId, 'P2', '/slides/1-P2.png')
    const p = createProgram(db, 'Set')
    addTracks(db, p, [hora.fileId, kolo.fileId])
    settings.set('currentProgramId', p)
    const { player, feed } = setup()
    player.refresh()
    expect(feed.snapshot().middle?.slide).toEqual({
      deckId,
      pageId: 'P2',
      imageUrl: expect.stringMatching(/^fdp-media:\/\/slide\/\d+\/P2\?v=/),
      live: false
    })
    expect(shown.at(-1)).toEqual({
      deckId,
      pageId: 'P2',
      viewUrl,
      position: 2,
      imageUrl: feed.snapshot().middle?.slide?.imageUrl // the live view's cover
    })
    liveNow = true
    expect(feed.snapshot().middle?.slide?.live).toBe(true)
    player.play()
    player.next()
    expect(feed.snapshot().middle).not.toHaveProperty('slide') // Kolo has none
    expect(shown.at(-1)).toBeNull()
  })

  test('a slide no longer in its deck shows its saved image, never live', () => {
    const hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const link = { viewUrl: 'https://www.canva.com/design/DAH/TOK/view', designId: 'DAH' }
    const deckId = saveDeck(db, link, { title: 'Deck', pages: [{ id: 'P1', title: null }] })
    setDanceSlide(db, hora.danceId!, deckId, 1)
    recordCapture(db, deckId, 'P1', '/slides/1-P1.png')
    saveDeck(db, link, { title: 'Deck', pages: [{ id: 'P9', title: null }] })
    const p = createProgram(db, 'Set')
    addTracks(db, p, [hora.fileId])
    settings.set('currentProgramId', p)
    const { player, feed } = setup()
    player.refresh()
    liveNow = true
    expect(feed.snapshot().middle?.slide).toMatchObject({ pageId: 'P1', live: false })
    expect(shown.at(-1)).toBeNull()
  })

  test('nothing in the middle hides the live view', () => {
    const { feed } = setup()
    expect(feed.snapshot().middle).toBeNull()
    expect(shown).toEqual([null])
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
