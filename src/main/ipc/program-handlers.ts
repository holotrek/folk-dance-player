import type { InvokeHandlers } from '@shared/contract'
import { NO_REMOTE } from '@shared/program'
import { checkProgramFiles } from '../programs/file-check'
import { listPlayed } from '../programs/history'
import { moveFromHolding, moveToHolding } from '../programs/holding-moves'
import {
  addStop,
  addTracks,
  createProgram,
  deleteProgram,
  duplicateProgram,
  getProgram,
  listPrograms,
  removeItems,
  renameProgram,
  reorderItems,
  setItemDance
} from '../programs/programs'
import type { HandlerDeps } from './handlers'

type ProgramChannel = Extract<
  keyof InvokeHandlers,
  `programs:${string}` | `player:${string}` | `remote:${string}`
>

// Handlers for programs and the player (spec §6.2, §7). A program edit runs, the player
// re-reads next up, then the change is announced.
export function programHandlers(deps: HandlerDeps): Pick<InvokeHandlers, ProgramChannel> {
  const { db, settings, player } = deps
  const edit =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      const result = fn(...args)
      player.refresh()
      deps.onProgramsChanged()
      return result
    }

  return {
    'programs:list': (search) => listPrograms(db, search),
    'programs:get': (programId) => getProgram(db, programId),
    'programs:played': (programId) => listPlayed(db, programId),
    'programs:create': edit((name) => createProgram(db, name)),
    'programs:rename': edit((programId, name) => renameProgram(db, programId, name)),
    'programs:duplicate': edit((programId) => duplicateProgram(db, programId)),
    'programs:delete': edit((programId) => {
      deleteProgram(db, programId)
      if (settings.get('currentProgramId') === programId) settings.set('currentProgramId', null)
    }),
    'programs:setCurrent': edit((programId) => {
      settings.set('currentProgramId', programId)
      if (programId === null) return
      checkProgramFiles(db, programId, deps.fileExists)
      deps.onLibraryChanged() // missing-file flags may have changed
    }),
    'programs:addTracks': edit((programId, fileIds, before) =>
      addTracks(db, programId, fileIds, before)
    ),
    // Both lists change, so both are announced (main coalesces the notices).
    'programs:moveToHolding': edit((programId, itemIds, before) => {
      moveToHolding(db, programId, itemIds, before)
      deps.onLibraryChanged()
    }),
    'programs:moveFromHolding': edit((programId, holdingIds, before) => {
      const added = moveFromHolding(db, programId, holdingIds, before)
      deps.onLibraryChanged()
      return added
    }),
    'programs:addStop': edit((programId, before) => addStop(db, programId, before)),
    'programs:reorder': edit((programId, itemIds) => reorderItems(db, programId, itemIds)),
    'programs:removeItems': edit((programId, itemIds) => removeItems(db, programId, itemIds)),
    'programs:setItemDance': edit((itemId, danceId) => setItemDance(db, itemId, danceId)),
    'player:getState': () => player.getState(),
    'player:play': () => player.play(),
    'player:pause': () => player.pause(),
    'player:stop': () => player.stop(),
    'player:next': () => player.next(),
    'player:preview': (fileId) => player.preview(fileId),
    'player:replay': (logId) => player.replay(logId),
    'player:ended': (playId) => player.ended(playId),
    'player:failed': (playId, message) => player.failed(playId, message),
    'player:setSpeed': (speed) => player.setSpeed(speed),
    'player:setSpeedLocked': (locked) => player.setSpeedLocked(locked),
    'player:setVolume': (volume) => player.setVolume(volume),
    'player:setAutoContinue': (change) => {
      if (change.enabled !== undefined) settings.set('autoContinue.enabled', change.enabled)
      if (change.seconds !== undefined) settings.set('autoContinue.seconds', change.seconds)
      player.refresh()
    },
    'player:dismissWarning': () => player.dismissWarning(),
    'player:restart': () => player.restart(),
    'remote:status': () => deps.remote?.status() ?? NO_REMOTE,
    'remote:requestAccess': () => deps.remote?.requestAccess() ?? NO_REMOTE
  }
}
