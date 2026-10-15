import type { DatabaseSync } from 'node:sqlite'
import { FORMAT_CHANGED } from '@shared/canva'
import { slideUrl } from '@shared/media'

export { FORMAT_CHANGED }
import type { CanvaDeck, CanvaPage, DanceSlide } from '@shared/canva'
import { inTransaction } from '../db/transaction'
import type { DeckLink } from './canva-url'
import type { ParsedDeck } from './deck-parser'

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

// A rule a deck or slide action broke; the message is shown in the control window.
export class CanvaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanvaError'
  }
}

interface DeckRow {
  id: number
  viewUrl: string
  designId: string
  title: string | null
  pages: string
  syncedAt: string | null
  lastError: string | null
}

const DECK_SQL = `SELECT id, view_url AS viewUrl, design_id AS designId, title, pages,
  synced_at AS syncedAt, last_error AS lastError FROM canva_decks`

const pagesOf = (row: DeckRow): CanvaPage[] => JSON.parse(row.pages) as CanvaPage[]

const toDeck = (row: DeckRow): CanvaDeck => ({
  id: row.id,
  viewUrl: row.viewUrl,
  designId: row.designId,
  title: row.title,
  pageCount: pagesOf(row).length,
  syncedAt: row.syncedAt,
  lastError: row.lastError
})

function deckRow(db: DatabaseSync, deckId: number): DeckRow {
  const row = db.prepare(`${DECK_SQL} WHERE id = ?`).get(deckId) as DeckRow | undefined
  if (!row) throw new CanvaError('That deck is no longer in the app.')
  return row
}

// Decks by title, for the editor's dropdown.
export function listDecks(db: DatabaseSync): CanvaDeck[] {
  return (
    db.prepare(`${DECK_SQL} ORDER BY title COLLATE NOCASE, id`).all() as unknown as DeckRow[]
  ).map(toDeck)
}

export function deckPages(db: DatabaseSync, deckId: number): CanvaPage[] {
  return pagesOf(deckRow(db, deckId))
}

export const deckByDesign = (db: DatabaseSync, designId: string): CanvaDeck | null => {
  const row = db.prepare(`${DECK_SQL} WHERE design_id = ?`).get(designId) as DeckRow | undefined
  return row ? toDeck(row) : null
}

// Adds a deck (or updates the one with the same view link). A page we can't read isn't saved.
export function saveDeck(db: DatabaseSync, link: DeckLink, parsed: ParsedDeck): number {
  if (parsed.pages.length === 0) {
    throw new CanvaError(
      "Couldn't read the slides of this deck. Is it shared as a public view link?"
    )
  }
  db.prepare(
    `INSERT INTO canva_decks (view_url, design_id, title, pages, synced_at, last_error)
     VALUES (?, ?, ?, ?, ${NOW}, NULL)
     ON CONFLICT (view_url) DO UPDATE SET title = excluded.title, pages = excluded.pages,
       synced_at = excluded.synced_at, last_error = NULL`
  ).run(link.viewUrl, link.designId, parsed.title, JSON.stringify(parsed.pages))
  return (
    db.prepare('SELECT id FROM canva_decks WHERE view_url = ?').get(link.viewUrl) as { id: number }
  ).id
}

// A refreshed copy of the deck's view page (spec §8.3). The format is undocumented, so it
// self-checks: no slides at all, or none of the slides we knew, means the format changed. Then the
// last known list stays in use (so do saved images) and the deck is flagged. A failed fetch keeps
// everything as it was. Otherwise the new list is saved.
export function applyRefresh(
  db: DatabaseSync,
  deckId: number,
  result: { parsed: ParsedDeck } | { error: string }
): 'ok' | 'format-changed' | 'unreachable' {
  const old = pagesOf(deckRow(db, deckId))
  const flag = db.prepare('UPDATE canva_decks SET last_error = ? WHERE id = ?')
  if ('error' in result) {
    flag.run(result.error, deckId)
    return 'unreachable'
  }
  const { pages, title } = result.parsed
  const known = new Set(pages.map((p) => p.id))
  if (pages.length === 0 || (old.length > 0 && !old.some((p) => known.has(p.id)))) {
    flag.run(FORMAT_CHANGED, deckId)
    return 'format-changed'
  }
  db.prepare(
    `UPDATE canva_decks SET title = COALESCE(?, title), pages = ?, synced_at = ${NOW},
       last_error = NULL WHERE id = ?`
  ).run(title, JSON.stringify(pages), deckId)
  return 'ok'
}

function storeSlide(
  db: DatabaseSync,
  danceId: number,
  deckId: number,
  pageId: string,
  index: number | null
) {
  db.prepare(
    `INSERT INTO dance_prefs (dance_id, canva_deck_id, canva_page_id, canva_page_index)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (dance_id) DO UPDATE SET canva_deck_id = excluded.canva_deck_id,
       canva_page_id = excluded.canva_page_id, canva_page_index = excluded.canva_page_index`
  ).run(danceId, deckId, pageId, index)
}

// Links slide number `position` (1-based, as Canva shows it) to a dance; stores its page ID.
export function setDanceSlide(
  db: DatabaseSync,
  danceId: number,
  deckId: number,
  position: number
): string {
  return inTransaction(db, () => {
    const pages = deckPages(db, deckId)
    const page = Number.isInteger(position) ? pages[position - 1] : undefined
    if (!page) throw new CanvaError(`This deck has slides 1 to ${pages.length}.`)
    storeSlide(db, danceId, deckId, page.id, position)
    return page.id
  })
}

// Links a slide by its page ID (from a page link), in the deck with that design.
export function setDanceSlideByPage(
  db: DatabaseSync,
  danceId: number,
  designId: string,
  pageId: string
): void {
  inTransaction(db, () => {
    const deck = deckByDesign(db, designId)
    if (!deck) throw new CanvaError('Add this deck first, with its public view link.')
    const index = deckPages(db, deck.id).findIndex((p) => p.id === pageId)
    if (index < 0) throw new CanvaError("That slide isn't in the deck. Try Refresh slides.")
    storeSlide(db, danceId, deck.id, pageId, index + 1)
  })
}

export function clearDanceSlide(db: DatabaseSync, danceId: number): void {
  db.prepare(
    `UPDATE dance_prefs SET canva_deck_id = NULL, canva_page_id = NULL, canva_page_index = NULL
     WHERE dance_id = ?`
  ).run(danceId)
}

// A dance's slide, with its position now (spec §8.3: looked up by page ID, so inserting or moving
// slides in Canva doesn't break the link). Null when the dance has none.
export function getDanceSlide(db: DatabaseSync, danceId: number): DanceSlide | null {
  const row = db
    .prepare(
      `SELECT dp.canva_deck_id AS deckId, dp.canva_page_id AS pageId, sc.image_path AS imagePath,
         sc.captured_at AS capturedAt, sc.last_error AS captureError
       FROM dance_prefs dp
       LEFT JOIN slide_cache sc ON sc.deck_id = dp.canva_deck_id AND sc.page_id = dp.canva_page_id
       WHERE dp.dance_id = ? AND dp.canva_deck_id IS NOT NULL AND dp.canva_page_id IS NOT NULL`
    )
    .get(danceId) as
    | {
        deckId: number
        pageId: string
        imagePath: string | null
        capturedAt: string | null
        captureError: string | null
      }
    | undefined
  if (!row) return null
  const deck = deckRow(db, row.deckId)
  const pages = pagesOf(deck)
  const index = pages.findIndex((p) => p.id === row.pageId)
  return {
    deckId: deck.id,
    deckTitle: deck.title,
    viewUrl: deck.viewUrl,
    pageId: row.pageId,
    title: index < 0 ? null : pages[index].title,
    position: index < 0 ? null : index + 1,
    status: index < 0 ? 'missing' : 'ok',
    imageUrl: row.imagePath === null ? null : slideUrl(deck.id, row.pageId, row.capturedAt ?? ''),
    captureError: row.captureError
  }
}

export interface CaptureTarget {
  deckId: number
  pageId: string
  viewUrl: string
  position: number
}

// The linked slides to capture: all of them, or those with no saved image yet. A slide deleted
// from its deck can't be captured.
export function captureTargets(db: DatabaseSync, which: 'all' | 'missing'): CaptureTarget[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT dp.canva_deck_id AS deckId, dp.canva_page_id AS pageId, sc.image_path AS imagePath
       FROM dance_prefs dp
       LEFT JOIN slide_cache sc ON sc.deck_id = dp.canva_deck_id AND sc.page_id = dp.canva_page_id
       WHERE dp.canva_deck_id IS NOT NULL AND dp.canva_page_id IS NOT NULL
       ORDER BY dp.canva_deck_id, dp.canva_page_id`
    )
    .all() as { deckId: number; pageId: string; imagePath: string | null }[]
  return rows.flatMap((r) => {
    if (which === 'missing' && r.imagePath !== null) return []
    const deck = deckRow(db, r.deckId)
    const index = pagesOf(deck).findIndex((p) => p.id === r.pageId)
    return index < 0
      ? []
      : [{ deckId: r.deckId, pageId: r.pageId, viewUrl: deck.viewUrl, position: index + 1 }]
  })
}

export function recordCapture(
  db: DatabaseSync,
  deckId: number,
  pageId: string,
  imagePath: string
): void {
  db.prepare(
    `INSERT INTO slide_cache (deck_id, page_id, image_path, captured_at, last_error)
     VALUES (?, ?, ?, ${NOW}, NULL)
     ON CONFLICT (deck_id, page_id) DO UPDATE SET image_path = excluded.image_path,
       captured_at = excluded.captured_at, last_error = NULL`
  ).run(deckId, pageId, imagePath)
}

// A failed capture keeps the previous image (spec §8.3) and records why.
export function recordCaptureError(
  db: DatabaseSync,
  deckId: number,
  pageId: string,
  message: string
): void {
  db.prepare(
    `INSERT INTO slide_cache (deck_id, page_id, last_error) VALUES (?, ?, ?)
     ON CONFLICT (deck_id, page_id) DO UPDATE SET last_error = excluded.last_error`
  ).run(deckId, pageId, message)
}

export function slideImagePath(db: DatabaseSync, deckId: number, pageId: string): string | null {
  const row = db
    .prepare('SELECT image_path AS imagePath FROM slide_cache WHERE deck_id = ? AND page_id = ?')
    .get(deckId, pageId) as { imagePath: string | null } | undefined
  return row?.imagePath ?? null
}
