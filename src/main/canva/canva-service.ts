import type { DatabaseSync } from 'node:sqlite'
import type { RefreshSummary } from '@shared/canva'
import { fetchDeck, resolvePageLink, type Fetcher } from './canva-client'
import { normalizeDeckUrl } from './canva-url'
import {
  applyRefresh,
  CanvaError,
  captureTargets,
  deckByDesign,
  listDecks,
  saveDeck,
  setDanceSlide,
  setDanceSlideByPage,
  type CaptureTarget
} from './decks'

// What the control window asks of Canva (spec §6.3, §8.3): add decks, link slides, refresh.
// Linking a slide captures its image; a refresh re-reads every deck and re-captures linked slides.
export class CanvaService {
  constructor(
    private readonly deps: {
      db: DatabaseSync
      fetcher: Fetcher
      queue: { enqueue(targets: CaptureTarget[]): void }
      onChange(): void // decks or a dance's slide changed
    }
  ) {}

  async addDeck(input: string): Promise<number> {
    const link = normalizeDeckUrl(input)
    if (!link)
      throw new CanvaError(
        "Paste the deck's smart embed link (in Canva: Share → Embed → Smart embed link)."
      )
    const id = saveDeck(this.deps.db, link, await fetchDeck(this.deps.fetcher, link.viewUrl))
    this.deps.onChange()
    return id
  }

  linkSlide(danceId: number, deckId: number, position: number): void {
    const pageId = setDanceSlide(this.deps.db, danceId, deckId, position)
    this.captureLinked(deckId, pageId)
    this.deps.onChange()
  }

  // A page link from Canva's share menu. A slide added in Canva since the deck was read is found
  // after re-reading the deck once.
  async linkPageLink(danceId: number, input: string): Promise<void> {
    const { designId, pageId } = await resolvePageLink(this.deps.fetcher, input)
    try {
      setDanceSlideByPage(this.deps.db, danceId, designId, pageId)
    } catch (err) {
      const deck = deckByDesign(this.deps.db, designId)
      if (!deck || !(err instanceof CanvaError) || !err.message.includes("isn't in the deck"))
        throw err
      await this.refreshDeck(deck.id, deck.viewUrl)
      setDanceSlideByPage(this.deps.db, danceId, designId, pageId)
    }
    this.captureLinked(deckByDesign(this.deps.db, designId)!.id, pageId)
    this.deps.onChange()
  }

  async refreshDecks(): Promise<RefreshSummary> {
    return (await this.refreshAll()).summary
  }

  // "Refresh slides": re-read every deck, then re-capture every linked slide.
  async refreshSlides(): Promise<RefreshSummary> {
    const { summary, read } = await this.refreshAll()
    this.captureFrom(read, 'all')
    return summary
  }

  // At startup, when online: re-read the decks and capture linked slides that have no image yet.
  async startup(online: boolean): Promise<void> {
    if (!online) return
    this.captureFrom((await this.refreshAll()).read, 'missing')
  }

  // Only decks read fine this time are captured: one that wasn't may show a Wi-Fi login page or
  // Canva's sign-in page, which must never replace a good saved image.
  private captureFrom(read: Set<number>, which: 'all' | 'missing'): void {
    const targets = captureTargets(this.deps.db, which).filter((t) => read.has(t.deckId))
    if (targets.length) this.deps.queue.enqueue(targets)
  }

  private async refreshAll(): Promise<{ summary: RefreshSummary; read: Set<number> }> {
    const summary = { decks: 0, formatChanged: 0, unreachable: 0 }
    const read = new Set<number>()
    for (const deck of listDecks(this.deps.db)) {
      const result = await this.refreshDeck(deck.id, deck.viewUrl)
      summary.decks++
      if (result === 'ok') read.add(deck.id)
      if (result === 'format-changed') summary.formatChanged++
      if (result === 'unreachable') summary.unreachable++
    }
    this.deps.onChange()
    return { summary, read }
  }

  private async refreshDeck(deckId: number, viewUrl: string) {
    try {
      return applyRefresh(this.deps.db, deckId, {
        parsed: await fetchDeck(this.deps.fetcher, viewUrl)
      })
    } catch (err) {
      return applyRefresh(this.deps.db, deckId, {
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  private captureLinked(deckId: number, pageId: string): void {
    const target = captureTargets(this.deps.db, 'all').find(
      (t) => t.deckId === deckId && t.pageId === pageId
    )
    if (target) this.deps.queue.enqueue([target])
  }
}
