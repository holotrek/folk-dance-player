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

// What the attachment store would say about a dance's slide image and the slide choice.
interface FakeAttachments {
  image?: { version: string; missing: boolean }
  shows?: 'canva' | 'image' | null
}

function setup(attached: FakeAttachments = {}) {
  const player = testPlayer(db, settings)
  const feed = createProjectorFeed({
    db,
    player,
    attachments: {
      imageInfo: () =>
        attached.image
          ? { name: 'x.png', version: attached.image.version, missing: attached.image.missing }
          : null,
      slideShows: () => attached.shows ?? null
    },
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
      kind: 'canva',
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
    expect(feed.snapshot().middle?.slide).toMatchObject({ kind: 'canva', live: true })
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
    expect(feed.snapshot()).toEqual({
      hasProgram: false,
      middle: null,
      upcoming: [],
      played: [],
      tailMs: null
    })
  })
})

describe('projector feed: a dance’s slide image (0.3.0 spec §3.7)', () => {
  // Hora has a captured Canva slide in every test; the attachment store is faked.
  function withCanvaSlide() {
    const hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const deckId = saveDeck(
      db,
      { viewUrl: 'https://www.canva.com/design/DAH/TOK/view', designId: 'DAH' },
      { title: 'Deck', pages: [{ id: 'P1', title: null }] }
    )
    setDanceSlide(db, hora.danceId!, deckId, 1)
    recordCapture(db, deckId, 'P1', '/slides/1-P1.png')
    return hora
  }
  function load(hora: { fileId: number }, attached: FakeAttachments) {
    const p = createProgram(db, 'Set')
    addTracks(db, p, [hora.fileId])
    settings.set('currentProgramId', p)
    const ctx = setup(attached)
    ctx.player.refresh()
    return ctx
  }

  test('a dance whose choice is the image sends an image slide and never asks the live view', () => {
    const hora = withCanvaSlide()
    const { feed } = load(hora, { image: { version: '1-ab.png', missing: false }, shows: 'image' })
    liveNow = true
    expect(feed.snapshot().middle?.slide).toEqual({
      kind: 'image',
      imageUrl: `fdp-media://dance-image/${hora.danceId}?v=1-ab.png`
    })
    expect(shown.at(-1)).toBeNull()
    expect(shown.every((t) => t === null)).toBe(true)
  })

  test('both sources with the choice on Canva, or no choice yet, show the Canva slide', () => {
    const hora = withCanvaSlide()
    const { feed } = load(hora, { image: { version: '1-ab.png', missing: false }, shows: 'canva' })
    expect(feed.snapshot().middle?.slide).toMatchObject({ kind: 'canva', pageId: 'P1' })
    expect(shown.at(-1)).not.toBeNull()
  })

  test('only an image: an image slide', () => {
    const hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const { feed } = load(hora, { image: { version: '1-ab.png', missing: false }, shows: null })
    expect(feed.snapshot().middle?.slide).toMatchObject({ kind: 'image' })
    expect(shown.every((t) => t === null)).toBe(true)
  })

  test('an image file that is missing falls back to the Canva slide, or to no slide', () => {
    const withCanva = withCanvaSlide()
    const a = load(withCanva, { image: { version: '1-ab.png', missing: true }, shows: 'image' })
    expect(a.feed.snapshot().middle?.slide).toMatchObject({ kind: 'canva' })

    const bare = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
    const p = createProgram(db, 'Two')
    addTracks(db, p, [bare.fileId])
    settings.set('currentProgramId', p)
    const b = setup({ image: { version: '2-cd.png', missing: true } })
    b.player.refresh()
    expect(b.feed.snapshot().middle).not.toHaveProperty('slide')
  })

  test('a Canva choice that cannot be drawn falls back to the dance’s image', () => {
    const hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const link = { viewUrl: 'https://www.canva.com/design/DAH/TOK/view', designId: 'DAH' }
    const deckId = saveDeck(db, link, { title: 'Deck', pages: [{ id: 'P1', title: null }] })
    setDanceSlide(db, hora.danceId!, deckId, 1) // never captured
    saveDeck(db, link, { title: 'Deck', pages: [{ id: 'P9', title: null }] }) // and gone from its deck
    const { feed } = load(hora, { image: { version: '1-ab.png', missing: false }, shows: 'canva' })
    expect(feed.snapshot().middle?.slide).toMatchObject({ kind: 'image' })
  })

  test('a replaced image has a new URL version', () => {
    const hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const first = load(hora, { image: { version: '1-aa.png', missing: false } })
    const url1 = (first.feed.snapshot().middle?.slide as { imageUrl: string }).imageUrl
    const second = setup({ image: { version: '1-bb.png', missing: false } })
    second.player.refresh()
    const url2 = (second.feed.snapshot().middle?.slide as { imageUrl: string }).imageUrl
    expect(url1).not.toBe(url2)
  })

  test('without an attachment store a dance behaves as before', () => {
    const hora = withCanvaSlide()
    const p = createProgram(db, 'Set')
    addTracks(db, p, [hora.fileId])
    settings.set('currentProgramId', p)
    const player = testPlayer(db, settings)
    const feed = createProjectorFeed({
      db,
      player,
      live: { show: () => undefined, isLive: () => false },
      projector: {
        status: () => ({
          enabled: true,
          open: true,
          mode: 'projector',
          display: null,
          notice: null
        }),
        send: () => undefined
      }
    })
    player.refresh()
    expect(feed.snapshot().middle?.slide).toMatchObject({ kind: 'canva' })
  })
})
