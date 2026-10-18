import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { Fetcher } from '../../../src/main/canva/canva-client'
import { CanvaService } from '../../../src/main/canva/canva-service'
import {
  deckPages,
  getDanceSlide,
  listDecks,
  type CaptureTarget
} from '../../../src/main/canva/decks'
import { addDance } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

const fixture = readFileSync(join(__dirname, '../../fixtures/canva-view.html'), 'utf8')
const VIEW = 'https://www.canva.com/design/DAHXoz6s10M/T9RGM0V3Sdllshv8NtdBrw/view'
const editLink = (pageId: string) =>
  `https://www.canva.com/design/DAHXoz6s10M/TLVQZ1x1so6_UjT7FH64DQ/edit?ui=${Buffer.from(
    JSON.stringify({ D: { T: { A: pageId } } })
  ).toString('base64')}`

function setup(pages = fixture) {
  const db = createTestDb()
  let body = pages
  let online = true
  let now = 0
  let fetches = 0
  const fetcher: Fetcher = async () => {
    fetches++
    if (!online) throw new Error('offline')
    return { status: 200, text: async () => body, headers: { get: () => null } }
  }
  const queued: CaptureTarget[][] = []
  let changes = 0
  const service = new CanvaService({
    db,
    fetcher,
    queue: { enqueue: (t) => void queued.push(t) },
    online: () => online,
    onChange: () => void changes++,
    clock: () => now
  })
  return {
    db,
    service,
    queued,
    changes: () => changes,
    fetches: () => fetches,
    advance: (ms: number) => (now += ms),
    setBody: (b: string) => (body = b),
    setOnline: (o: boolean) => (online = o)
  }
}

describe('Canva service', () => {
  test('adds a deck from any of its share links', async () => {
    const { db, service, changes } = setup()
    const id = await service.addDeck(`${VIEW}?embed#6`)
    expect(listDecks(db)).toMatchObject([
      { id, viewUrl: VIEW, title: "Dance n' Jam Tunes", pageCount: 4 }
    ])
    expect(changes()).toBe(1)
    await expect(service.addDeck('https://example.com/x')).rejects.toThrow('smart embed link')
  })

  test('linking a slide by number captures its image', async () => {
    const { db, service, queued } = setup()
    const deckId = await service.addDeck(VIEW)
    const hora = addDance(db, { name: 'Ali Paşa' })
    service.linkSlide(hora, deckId, 3)
    expect(getDanceSlide(db, hora)).toMatchObject({ pageId: 'PBrWDbC9tVSzgzvW', title: 'Ali Paşa' })
    expect(queued).toEqual([[{ deckId, pageId: 'PBrWDbC9tVSzgzvW', viewUrl: VIEW, position: 3 }]])
  })

  test('linking by page link; a slide added in Canva since is found after re-reading the deck', async () => {
    const { db, service, setBody } = setup()
    await service.addDeck(VIEW)
    const dance = addDance(db, { name: 'New' })
    setBody(fixture.replace('"a":"PBGXpNQqng7fBG4b"', '"a":"PBNEWSLIDE000001"'))
    await service.linkPageLink(dance, editLink('PBNEWSLIDE000001'))
    expect(getDanceSlide(db, dance)).toMatchObject({ pageId: 'PBNEWSLIDE000001', position: 2 })
  })

  test('Refresh slides re-reads decks and re-captures every linked slide', async () => {
    const { db, service, queued } = setup()
    const deckId = await service.addDeck(VIEW)
    const a = addDance(db, { name: 'A' })
    const b = addDance(db, { name: 'B' })
    service.linkSlide(a, deckId, 1)
    service.linkSlide(b, deckId, 3)
    queued.length = 0
    expect(await service.refreshSlides()).toEqual({ decks: 1, formatChanged: 0, unreachable: 0 })
    expect(queued[0].map((t) => t.position)).toEqual([1, 3])
  })

  test("a deck that couldn't be read this time keeps its saved images (nothing is re-captured)", async () => {
    const { db, service, queued, setOnline } = setup()
    const deckId = await service.addDeck(VIEW)
    service.linkSlide(addDance(db, { name: 'A' }), deckId, 1)
    queued.length = 0
    setOnline(false)
    expect(await service.refreshSlides()).toMatchObject({ unreachable: 1 })
    await service.startup(true)
    expect(queued.flat()).toEqual([])
  })

  test("offline, a newly linked slide isn't captured; back online, it is", async () => {
    const { db, service, queued, setOnline } = setup()
    const deckId = await service.addDeck(VIEW)
    setOnline(false)
    service.linkSlide(addDance(db, { name: 'A' }), deckId, 1)
    expect(queued).toEqual([]) // no failed capture to report
    setOnline(true)
    await service.catchUp()
    expect(queued[0].map((t) => t.position)).toEqual([1])
  })

  test("a slide skipped offline is captured on the next online check, even if the drop wasn't seen", async () => {
    const { db, service, queued, setOnline } = setup()
    const deckId = await service.addDeck(VIEW)
    setOnline(false)
    service.linkSlide(addDance(db, { name: 'A' }), deckId, 1)
    setOnline(true)
    await service.retryIfWaiting()
    expect(queued.map((batch) => batch.map((t) => t.position))).toEqual([[1]])
    await service.retryIfWaiting() // nothing waits any more
    expect(queued).toHaveLength(1)
  })

  test('Canva unreachable when catching up: a slide with no image shows why, rather than waiting', async () => {
    const { db, service, queued, setOnline } = setup()
    const deckId = await service.addDeck(VIEW)
    setOnline(false)
    const dance = addDance(db, { name: 'A' })
    service.linkSlide(dance, deckId, 1)
    await service.catchUp() // the deck can't be read
    expect(queued).toEqual([])
    expect(getDanceSlide(db, dance)?.captureError).toMatch(/Couldn't reach Canva/)
  })

  test('at startup: nothing offline; online, decks are re-read and only missing images captured', async () => {
    const { db, service, queued, setOnline } = setup()
    const deckId = await service.addDeck(VIEW)
    service.linkSlide(addDance(db, { name: 'A' }), deckId, 1)
    queued.length = 0
    setOnline(false)
    await service.startup(false)
    expect(queued).toEqual([])
    setOnline(true)
    await service.startup(true)
    expect(queued[0].map((t) => t.position)).toEqual([1])
  })

  test('a changed page format is reported, and the deck keeps its slides', async () => {
    const { db, service, setBody } = setup()
    await service.addDeck(VIEW)
    setBody('<html><title>x</title></html>')
    expect(await service.refreshDecks()).toEqual({ decks: 1, formatChanged: 1, unreachable: 0 })
    expect(listDecks(db)[0].pageCount).toBe(4)
  })

  describe('when the app window gains focus', () => {
    // A deck page in the format Canva's view page uses, with the slides given as [id, title].
    const deckHtml = (slides: [string, string][]) =>
      '<html><head><meta property="og:title" content="Edited deck"></head><body>' +
      slides.map(([id, name]) => `{"A?":"i","Z":{},"a":"${id}","B":"${name}"}`).join('') +
      '</body></html>'

    test('the decks are re-read, so slide numbers follow an edit made in Canva', async () => {
      const { db, service, setBody } = setup(deckHtml([['PAAAAAAAA', 'Old first']]))
      const deckId = await service.addDeck(VIEW)
      setBody(
        deckHtml([
          ['PNEWSLIDE', 'New first'],
          ['PAAAAAAAA', 'Old first']
        ])
      )
      await service.focused()
      expect(deckPages(db, deckId).map((p) => p.title)).toEqual(['New first', 'Old first'])
    })

    test('it waits a minute before reading again', async () => {
      const { service, advance, fetches } = setup()
      await service.addDeck(VIEW)
      const afterAdd = fetches()
      await service.focused()
      expect(fetches()).toBe(afterAdd + 1)
      advance(30_000)
      await service.focused()
      expect(fetches()).toBe(afterAdd + 1)
      advance(30_000)
      await service.focused()
      expect(fetches()).toBe(afterAdd + 2)
    })

    test('it does nothing offline, and tries again once back online', async () => {
      const { service, setOnline, fetches } = setup()
      await service.addDeck(VIEW)
      const afterAdd = fetches()
      setOnline(false)
      await service.focused()
      expect(fetches()).toBe(afterAdd)
      setOnline(true)
      await service.focused()
      expect(fetches()).toBe(afterAdd + 1)
    })

    test('it never captures slide images (only Refresh slides does)', async () => {
      const { db, service, queued } = setup()
      const deckId = await service.addDeck(VIEW)
      service.linkSlide(addDance(db, { name: 'Ali Paşa' }), deckId, 3)
      queued.length = 0
      await service.focused()
      expect(queued).toEqual([])
    })
  })
})
