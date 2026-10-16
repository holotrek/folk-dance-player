import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { Fetcher } from '../../../src/main/canva/canva-client'
import { CanvaService } from '../../../src/main/canva/canva-service'
import { getDanceSlide, listDecks, type CaptureTarget } from '../../../src/main/canva/decks'
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
  const fetcher: Fetcher = async () => {
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
    onChange: () => void changes++
  })
  return {
    db,
    service,
    queued,
    changes: () => changes,
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
})
