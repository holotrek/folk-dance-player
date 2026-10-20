import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  applyRefresh,
  CanvaError,
  captureTargets,
  clearDanceSlide,
  FORMAT_CHANGED,
  getDanceSlide,
  listDecks,
  recordCapture,
  recordCaptureError,
  saveDeck,
  setDanceSlide,
  setDanceSlideByPage,
  slideImagePath
} from '../../../src/main/canva/decks'
import { addDance } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

const link = { viewUrl: 'https://www.canva.com/design/DAH/TOK/view', designId: 'DAH' }
const page = (id: string, title: string | null = null) => ({ id, title })
const deck = (...pages: ReturnType<typeof page>[]) => ({ title: "Dance n' Jam Tunes", pages })

let db: DatabaseSync
let hora: number
let deckId: number

beforeEach(() => {
  db = createTestDb()
  hora = addDance(db, { name: 'Hora' })
  deckId = saveDeck(db, link, deck(page('P1', 'Ajde Jano'), page('P2'), page('P3', 'Ali Paşa')))
})

describe('decks', () => {
  test('are saved once by their view link, and listed by title with their slide count', () => {
    expect(saveDeck(db, link, deck(page('P1'), page('P2')))).toBe(deckId)
    expect(listDecks(db)).toMatchObject([
      { id: deckId, title: "Dance n' Jam Tunes", designId: 'DAH', pageCount: 2, lastError: null }
    ])
  })

  test('a page with no slides we can read is not saved', () => {
    expect(() => saveDeck(db, { ...link, viewUrl: 'x', designId: 'Y' }, deck())).toThrow(CanvaError)
  })
})

describe('linking a slide to a dance', () => {
  test('by slide number: the page ID is stored, and shown with its title and position', () => {
    expect(setDanceSlide(db, hora, deckId, 3)).toBe('P3')
    expect(getDanceSlide(db, hora)).toEqual({
      deckId,
      deckTitle: "Dance n' Jam Tunes",
      viewUrl: link.viewUrl,
      pageId: 'P3',
      title: 'Ali Paşa',
      position: 3,
      status: 'ok',
      imageUrl: null,
      captureError: null
    })
  })

  test('a number outside the deck is refused', () => {
    expect(() => setDanceSlide(db, hora, deckId, 4)).toThrow('This deck has slides 1 to 3.')
    expect(() => setDanceSlide(db, hora, deckId, 0)).toThrow(CanvaError)
  })

  test('by page link: the deck is found by its design', () => {
    setDanceSlideByPage(db, hora, 'DAH', 'P2')
    expect(getDanceSlide(db, hora)).toMatchObject({ pageId: 'P2', position: 2 })
    expect(() => setDanceSlideByPage(db, hora, 'OTHER', 'P2')).toThrow('Add this deck first')
    expect(() => setDanceSlideByPage(db, hora, 'DAH', 'P9')).toThrow("isn't in the deck")
  })

  test('cleared, the dance has no slide', () => {
    setDanceSlide(db, hora, deckId, 1)
    clearDanceSlide(db, hora)
    expect(getDanceSlide(db, hora)).toBeNull()
  })
})

describe('clearing a slide and the projector’s slide choice (0.3.0 spec §3.7)', () => {
  test('clearing the Canva slide also clears the choice between Canva and an image', () => {
    setDanceSlide(db, hora, deckId, 1)
    db.prepare(
      "UPDATE dance_prefs SET slide_image_name = 'a.png', slide_image_path = '1-aa.png', slide_source = 'image' WHERE dance_id = ?"
    ).run(hora)
    clearDanceSlide(db, hora)
    expect(
      db
        .prepare(
          'SELECT slide_source AS source, slide_image_path AS image FROM dance_prefs WHERE dance_id = ?'
        )
        .get(hora)
    ).toEqual({ source: null, image: '1-aa.png' }) // the image stays
  })
})

describe('refreshing a deck (spec §8.3)', () => {
  test('a slide inserted in Canva moves the others; links follow their page IDs', () => {
    setDanceSlide(db, hora, deckId, 3)
    expect(
      applyRefresh(db, deckId, {
        parsed: deck(page('P1'), page('NEW'), page('P2'), page('P3', 'Ali Paşa'))
      })
    ).toBe('ok')
    expect(getDanceSlide(db, hora)).toMatchObject({ pageId: 'P3', position: 4, status: 'ok' })
  })

  test('a slide deleted in Canva leaves the dance flagged for re-linking, keeping its image', () => {
    setDanceSlide(db, hora, deckId, 3)
    recordCapture(db, deckId, 'P3', '/slides/p3.png')
    applyRefresh(db, deckId, { parsed: deck(page('P1'), page('P2')) })
    expect(getDanceSlide(db, hora)).toMatchObject({
      position: null,
      status: 'missing',
      imageUrl: expect.stringMatching(/^fdp-media:\/\/slide\//)
    })
  })

  test('no slides, or none we knew, means the format changed: the old list stays, flagged', () => {
    setDanceSlide(db, hora, deckId, 3)
    expect(applyRefresh(db, deckId, { parsed: deck() })).toBe('format-changed')
    expect(applyRefresh(db, deckId, { parsed: deck(page('X1'), page('X2'), page('X3')) })).toBe(
      'format-changed'
    )
    expect(listDecks(db)[0]).toMatchObject({ pageCount: 3, lastError: FORMAT_CHANGED })
    expect(getDanceSlide(db, hora)).toMatchObject({ position: 3, status: 'ok' })
    expect(applyRefresh(db, deckId, { parsed: deck(page('P1'), page('P3')) })).toBe('ok')
    expect(listDecks(db)[0].lastError).toBeNull()
  })

  test('offline: everything stays as it was, with the reason noted', () => {
    expect(applyRefresh(db, deckId, { error: 'Not connected' })).toBe('unreachable')
    expect(listDecks(db)[0]).toMatchObject({ pageCount: 3, lastError: 'Not connected' })
  })
})

describe('saved slide images', () => {
  test('capture targets are the linked slides: all, or those without an image', () => {
    const kolo = addDance(db, { name: 'Kolo' })
    const gone = addDance(db, { name: 'Gone' })
    setDanceSlide(db, hora, deckId, 3)
    setDanceSlide(db, kolo, deckId, 1)
    setDanceSlide(db, gone, deckId, 2)
    applyRefresh(db, deckId, { parsed: deck(page('P1'), page('P3', 'Ali Paşa')) }) // P2 deleted
    recordCapture(db, deckId, 'P1', '/slides/p1.png')
    expect(captureTargets(db, 'all').map((t) => [t.pageId, t.position])).toEqual([
      ['P1', 1],
      ['P3', 2]
    ])
    expect(captureTargets(db, 'missing').map((t) => t.pageId)).toEqual(['P3'])
  })

  test('a failed capture keeps the previous image and records why', () => {
    setDanceSlide(db, hora, deckId, 3)
    recordCapture(db, deckId, 'P3', '/slides/p3.png')
    recordCaptureError(db, deckId, 'P3', 'Timed out')
    expect(slideImagePath(db, deckId, 'P3')).toBe('/slides/p3.png')
    expect(getDanceSlide(db, hora)).toMatchObject({
      imageUrl: expect.stringMatching(/^fdp-media:\/\/slide\//),
      captureError: 'Timed out'
    })
    recordCapture(db, deckId, 'P3', '/slides/p3.png')
    expect(getDanceSlide(db, hora)?.captureError).toBeNull()
  })
})
