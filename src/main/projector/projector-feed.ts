import type { DatabaseSync } from 'node:sqlite'
import type { ProjectorProgress, ProjectorSnapshot } from '@shared/projector'
import { listPlayed } from '../programs/history'
import { getProgram } from '../programs/programs'
import type { PlayerSession } from '../session/player-session'
import type { ProjectorController } from './projector-controller'
import { buildProjectorSnapshot } from './snapshot'

export interface ProjectorFeed {
  snapshot(): ProjectorSnapshot
  update(): void // after the player, the programs or the library changed
  progress(progress: ProjectorProgress): void
}

// What the projector window is sent (spec §8.2, §9): the snapshot when anything it shows may have
// changed, and the playing song's position (from the control window, about 4 times a second).
export function createProjectorFeed(deps: {
  db: DatabaseSync
  player: Pick<PlayerSession, 'getState'>
  projector: Pick<ProjectorController, 'status' | 'send'>
}): ProjectorFeed {
  const snapshot = (): ProjectorSnapshot => {
    const state = deps.player.getState()
    const id = state.programId
    return buildProjectorSnapshot(
      state,
      id === null ? [] : (getProgram(deps.db, id)?.items ?? []),
      id === null ? [] : listPlayed(deps.db, id)
    )
  }
  return {
    snapshot,
    update: () => {
      if (deps.projector.status().open) deps.projector.send('projector:snapshot', snapshot())
    },
    progress: (progress) => deps.projector.send('projector:progress', progress)
  }
}
