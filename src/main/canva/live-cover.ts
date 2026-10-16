import type { LiveView } from '../projector/live-slide'

// The two views of the live slide (electron-canva.ts): the cover page and the Canva page under it.
export interface CoverParts {
  loadCover(imageUrl: string | null): Promise<void> // resolves once the page and its image loaded
  setCoverVisible(visible: boolean): void
  setPageVisible(visible: boolean): void
}

// Spec §8.3: the cover shows only once it holds the right image. Until then neither view shows,
// so the projector page's own copy of the same saved image shows through: never the previous
// slide's image, nor a black frame while the new image decodes.
export function createCover(parts: CoverParts): Pick<LiveView, 'cover' | 'reveal' | 'hide'> {
  let held: string | null | undefined // the image the loaded cover page shows
  let turn = 0 // each cover/reveal/hide supersedes an unfinished cover load
  const show = (): void => {
    parts.setCoverVisible(true)
    parts.setPageVisible(true)
  }
  return {
    cover(imageUrl) {
      const mine = ++turn
      if (imageUrl === held) return show()
      parts.setCoverVisible(false)
      parts.setPageVisible(false)
      held = undefined
      parts.loadCover(imageUrl).then(
        () => {
          if (mine !== turn) return // superseded: what the page holds is no longer certain
          held = imageUrl
          show()
        },
        () => undefined // not loaded: both stay hidden, and the next cover loads it again
      )
    },
    reveal() {
      turn++
      parts.setPageVisible(true)
      parts.setCoverVisible(false)
    },
    hide() {
      turn++
      parts.setCoverVisible(false)
      parts.setPageVisible(false)
    }
  }
}
