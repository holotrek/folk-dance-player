import type { PlayerState } from '@shared/program'

// Electron's powerSaveBlocker, or a fake in tests.
export interface PowerBlocker {
  start(type: 'prevent-display-sleep'): number
  stop(id: number): void
}

// The Mac must not sleep (or dim the projector) during an event: while the projector shows, or
// music plays or counts down. Paused or idle, it may.
export class KeepAwake {
  private id: number | null = null

  constructor(private readonly blocker: PowerBlocker) {}

  static needed(state: { projectorOpen: boolean; status: PlayerState['status'] }): boolean {
    return state.projectorOpen || state.status === 'playing' || state.status === 'countdown'
  }

  update(needed: boolean): void {
    if (needed && this.id === null) this.id = this.blocker.start('prevent-display-sleep')
    else if (!needed && this.id !== null) {
      this.blocker.stop(this.id)
      this.id = null
    }
  }
}
