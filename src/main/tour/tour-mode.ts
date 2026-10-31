import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { InvokeHandlers } from '@shared/contract'
import type { TourPart } from '@shared/tour'
import type { PracticeContext, PracticeOptions } from './practice-context'

const PREFIX = 'fdp-tour-'

export interface TourModeDeps {
  // The app's real handlers (built after this, so asked for when needed).
  realHandlers: () => InvokeHandlers
  tmpDir: string
  // Builds the practice context for a tour in `dir`, sending its events with `send`.
  makeContext(dir: string, send: PracticeOptions['send']): PracticeContext
  sendToWindow(windowId: number): PracticeOptions['send']
  stopRealPlayer(): void
  reload(windowId: number): void
}

export interface TourMode {
  start(windowId: number, part: TourPart): void
  leave(): void
  active(): boolean
  touringWindowId(): number | null
  // The handlers that answer a window: the practice set for the touring window (except the tour:
  // channels, which are always the app's own), the real set for any other.
  handlersFor(senderId: number): InvokeHandlers
  // The practice library's audio for the media protocol; undefined when no tour is active.
  mediaPath(fileId: number): string | null | undefined
  // Removes practice folders left by an earlier run (a crash or a quit during a tour).
  sweepStale(): void
}

interface Active {
  windowId: number
  part: TourPart
  dir: string
  context: PracticeContext
}

// Tour mode (tour spec §4.2): which window is on the practice library, and the way in and out. It
// lives only in memory, so a quit or a crash leaves the real library showing next time; entering
// and leaving reload the window, so every store starts fresh on the right library.
export function createTourMode(deps: TourModeDeps): TourMode {
  let active: Active | null = null
  let landing: number | null = null // a window that should land on Music, once, after leaving

  const dispose = (): void => {
    active?.context.dispose()
    active = null
  }

  return {
    start(windowId, part) {
      dispose()
      deps.stopRealPlayer()
      const dir = mkdtempSync(join(deps.tmpDir, PREFIX))
      const context = deps.makeContext(dir, deps.sendToWindow(windowId))
      active = { windowId, part, dir, context }
      landing = null
      deps.reload(windowId)
    },
    leave() {
      if (!active) return
      const { windowId } = active
      dispose()
      landing = windowId
      deps.reload(windowId)
    },
    active: () => active !== null,
    touringWindowId: () => active?.windowId ?? null,
    handlersFor(senderId) {
      const real = deps.realHandlers()
      const touring = active !== null && active.windowId === senderId
      const state: InvokeHandlers['tour:state'] = () => {
        const landOn = landing === senderId ? ('music' as const) : null
        if (landOn) landing = null
        return { part: touring ? active!.part : null, landOn }
      }
      if (!touring) return { ...real, 'tour:state': state }
      const tourChannels = Object.fromEntries(
        Object.entries(real).filter(([channel]) => channel.startsWith('tour:'))
      )
      return { ...active!.context.handlers, ...tourChannels, 'tour:state': state }
    },
    mediaPath: (fileId) => (active ? active.context.mediaPath(fileId) : undefined),
    sweepStale() {
      for (const name of readdirSync(deps.tmpDir)) {
        if (!name.startsWith(PREFIX)) continue
        const path = join(deps.tmpDir, name)
        if (active && path === active.dir) continue
        rmSync(path, { recursive: true, force: true })
      }
    }
  }
}
