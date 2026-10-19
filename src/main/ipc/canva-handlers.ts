import { CAPTURES_IDLE, type CaptureStatus } from '@shared/canva'
import type { InvokeHandlers } from '@shared/contract'
import type { CanvaService } from '../canva/canva-service'
import { CanvaError, clearDanceSlide, deckPages, getDanceSlide, listDecks } from '../canva/decks'
import type { HandlerDeps } from './handlers'

// What the handlers need from Canva (main/index.ts joins the service and the capture queue).
export interface CanvaDeps {
  service: Pick<
    CanvaService,
    'addDeck' | 'linkSlide' | 'linkPageLink' | 'refreshDecks' | 'refreshSlides'
  >
  captureStatus(): CaptureStatus
}

const unavailable = (): never => {
  throw new CanvaError("Canva slides aren't available")
}

// Spec §6.3, §8.3: the deck list, a dance's slide, and "Refresh slides". `refreshDecks` re-reads
// the slide lists only (the link dialog does it when it opens); `refreshSlides` also saves images.
export function canvaHandlers(
  deps: HandlerDeps
): Pick<InvokeHandlers, Extract<keyof InvokeHandlers, `canva:${string}`>> {
  const canva = deps.canva
  return {
    'canva:decks': () => listDecks(deps.db),
    'canva:deckPages': (deckId) => deckPages(deps.db, deckId),
    'canva:addDeck': async (link) => {
      if (!canva) return unavailable()
      const id = await canva.service.addDeck(link)
      return listDecks(deps.db).find((d) => d.id === id)!
    },
    'canva:linkSlide': (danceId, deckId, position) => {
      if (!canva) return unavailable()
      canva.service.linkSlide(danceId, deckId, position)
      return getDanceSlide(deps.db, danceId)
    },
    'canva:linkPageLink': async (danceId, link) => {
      if (!canva) return unavailable()
      await canva.service.linkPageLink(danceId, link)
      return getDanceSlide(deps.db, danceId)
    },
    'canva:clearSlide': (danceId) => {
      clearDanceSlide(deps.db, danceId)
      deps.onLibraryChanged()
    },
    'canva:refreshDecks': async () => {
      if (!canva) return unavailable()
      return canva.service.refreshDecks()
    },
    'canva:refreshSlides': () => (canva ? canva.service.refreshSlides() : unavailable()),
    'canva:captureStatus': () => canva?.captureStatus() ?? CAPTURES_IDLE
  }
}
