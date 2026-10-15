// Canva slides (spec §8.3), shared by main and renderer.

// A deck's lastError when its page couldn't be read (spec §8.3): the control window shows "Canva
// links need checking" for it.
export const FORMAT_CHANGED = "Canva's page format changed: slide links need checking"

// One slide of a deck: its stable page ID and, if it's named in Canva, its title.
export interface CanvaPage {
  id: string
  title: string | null
}

// A deck the user added once, by its public view link.
export interface CanvaDeck {
  id: number
  viewUrl: string
  designId: string
  title: string | null
  pageCount: number
  syncedAt: string | null
  lastError: string | null // e.g. Canva's page format changed: links need checking
}

// A dance's slide, resolved against the deck's current slide list.
export interface DanceSlide {
  deckId: number
  deckTitle: string | null
  viewUrl: string
  pageId: string
  title: string | null // the slide's title in Canva, if named
  position: number | null // its position now (1-based); null when it was deleted from the deck
  status: 'ok' | 'missing' // missing: the page ID is no longer in the deck — re-link it
  imageUrl: string | null // the saved image (fdp-media://slide/…), when one exists
  captureError: string | null // the last capture failed (the previous image stays in use)
}

// What "Refresh slides" found: decks re-read, and how many couldn't be (spec §8.3).
export interface RefreshSummary {
  decks: number
  formatChanged: number // Canva's page format changed: the old slide list is kept
  unreachable: number // offline, or the deck is no longer public
}

// Background slide captures (spec §8.3), for the control window's notice.
export interface CaptureStatus {
  running: boolean
  done: number
  total: number
  failed: number
}

export const CAPTURES_IDLE: CaptureStatus = { running: false, done: 0, total: 0, failed: 0 }
