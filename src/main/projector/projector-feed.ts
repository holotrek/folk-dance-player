import type { DatabaseSync } from 'node:sqlite'
import type { ProjectorProgress, ProjectorSlide, ProjectorSnapshot } from '@shared/projector'
import { getDanceSlide } from '../canva/decks'
import { listPlayed } from '../programs/history'
import { getProgram } from '../programs/programs'
import type { PlayerSession } from '../session/player-session'
import type { LiveSlide } from './live-slide'
import type { ProjectorController } from './projector-controller'
import { buildProjectorSnapshot } from './snapshot'

export interface ProjectorFeed {
  snapshot(): ProjectorSnapshot
  update(): void // after the player, the programs or the library changed
  progress(progress: ProjectorProgress): void
}

// What the projector window is sent (spec §8.2, §9): the snapshot when anything it shows may have
// changed, and the playing song's position (from the control window, about 4 times a second).
// Each snapshot also tells the live Canva view which slide to show (spec §8.3).
export function createProjectorFeed(deps: {
  db: DatabaseSync
  player: Pick<PlayerSession, 'getState'>
  projector: Pick<ProjectorController, 'status' | 'send'>
  live: Pick<LiveSlide, 'show' | 'isLive'>
}): ProjectorFeed {
  const snapshot = (): ProjectorSnapshot => {
    const state = deps.player.getState()
    const id = state.programId
    let shown = false
    const slideFor = (danceId: number | null): ProjectorSlide | null => {
      const slide = danceId === null ? null : getDanceSlide(deps.db, danceId)
      // A slide gone from its deck can't be shown live; its saved image still can.
      const live =
        slide?.status === 'ok'
          ? {
              deckId: slide.deckId,
              viewUrl: slide.viewUrl,
              pageId: slide.pageId,
              position: slide.position!
            }
          : null
      deps.live.show(live)
      shown = true
      if (!slide || (!slide.imageUrl && !live)) return null
      return {
        deckId: slide.deckId,
        pageId: slide.pageId,
        imageUrl: slide.imageUrl,
        live: live !== null && deps.live.isLive(live)
      }
    }
    const snap = buildProjectorSnapshot(
      state,
      id === null ? [] : (getProgram(deps.db, id)?.items ?? []),
      id === null ? [] : listPlayed(deps.db, id),
      slideFor
    )
    if (!shown) deps.live.show(null)
    return snap
  }
  return {
    snapshot,
    update: () => {
      if (deps.projector.status().open) deps.projector.send('projector:snapshot', snapshot())
    },
    progress: (progress) => deps.projector.send('projector:progress', progress)
  }
}
