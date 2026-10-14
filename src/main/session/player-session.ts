import {
  IDLE_PLAYER_STATE,
  type PlayerState,
  type PlayKind,
  type ProgramItem,
  type Track
} from '@shared/program'

// What the session needs from the rest of the app: the program, the library and the play log.
// The real ones read the database (session-ports.ts); tests can use the same, over a test db.
export interface SessionPorts {
  programId(): number | null
  unplayedItems(programId: number): ProgramItem[]
  markPlayed(itemId: number): void
  getTrack(fileId: number, danceId: number | null): Track | null
  getLoggedPlay(logId: number): { fileId: number; danceId: number | null } | null
  logPlay(entry: {
    fileId: number
    danceId: number | null
    programId: number | null
    kind: PlayKind
  }): void
  // Checks the file is on disk, flagging or unflagging it in the library.
  checkFile(fileId: number): boolean
  autoContinue(): { enabled: boolean; seconds: number }
  countdownSeconds(): number
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

const MIN_SPEED = 0.5
const MAX_SPEED = 1.5
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Spec §7: decides what plays. The control window owns the <audio> element and reports back
// (ended / failed); no renderer decides what plays next. No Electron imports, so it's unit-tested.
export class PlayerSession {
  private state: PlayerState
  private nextPlayId = 1
  private timer: unknown = null

  constructor(
    private readonly ports: SessionPorts,
    private readonly timers: Timers,
    private readonly emit: (state: PlayerState) => void
  ) {
    this.state = { ...IDLE_PLAYER_STATE, autoContinue: ports.autoContinue() }
    this.sync()
  }

  getState(): PlayerState {
    return this.state
  }

  // Re-reads the program and settings (after an edit, or a different program was loaded).
  refresh(): void {
    this.update({})
  }

  // ▶ (spec §7.2): resumes, or skips a running countdown, or starts the program's next song —
  // after the countdown when one is set. An operator's ▶ passes STOP markers.
  play(): void {
    const { status } = this.state
    if (status === 'paused') return this.update({ status: 'playing' })
    if (status === 'playing') return
    if (status === 'countdown') return this.finishCountdown()
    const seconds = this.ports.countdownSeconds()
    if (seconds > 0 && this.hasPlayable(true)) return this.startCountdown(seconds, 'start')
    this.advance(true)
  }

  pause(): void {
    if (this.state.status === 'playing') this.update({ status: 'paused' })
  }

  // ⏹: stops the song or cancels the countdown. Nothing is marked played.
  stop(): void {
    this.cancelCountdown()
    this.update({ status: 'idle', current: null, countdown: null })
  }

  // ⏭: stops the song and starts the program's next song now, passing STOP markers.
  next(): void {
    this.cancelCountdown()
    this.update({ status: 'idle', current: null, countdown: null })
    this.advance(true)
  }

  // Double-click in the library, holding or a playlist (spec §7.1): plays now, logged as a
  // preview of the song's default dance. Afterwards playback halts.
  preview(fileId: number): void {
    const track = this.ports.getTrack(fileId, null)
    if (!track) return
    this.cancelCountdown()
    this.start('preview', null, track)
  }

  // Double-click in "Previously played": plays that entry again, as the dance it was logged with.
  replay(logId: number): void {
    const logged = this.ports.getLoggedPlay(logId)
    const track = logged && this.ports.getTrack(logged.fileId, logged.danceId)
    if (!track) return
    this.cancelCountdown()
    this.start('replay', null, track)
  }

  // The control window's <audio> reached the end of play `playId`.
  ended(playId: number): void {
    const current = this.state.current
    if (!current || current.playId !== playId) return
    this.afterSong(current.source)
  }

  // The control window couldn't play `playId` (unreadable or unsupported file).
  failed(playId: number, message: string): void {
    const current = this.state.current
    if (!current || current.playId !== playId) return
    this.update({ warning: `Couldn't play “${current.track.label}”: ${message}` })
    this.afterSong(current.source)
  }

  setSpeed(speed: number): void {
    this.update({ speed: clamp(Math.round(speed * 100) / 100, MIN_SPEED, MAX_SPEED) })
  }

  setSpeedLocked(locked: boolean): void {
    this.update({ speedLocked: locked })
  }

  setVolume(volume: number): void {
    this.update({ volume: clamp(volume, 0, 1) })
  }

  dismissWarning(): void {
    this.update({ warning: null })
  }

  // When a song ends: a program song continues per the setting (halting at a STOP marker);
  // a preview or replay always halts, with the program's next item queued.
  private afterSong(source: PlayKind): void {
    this.update({ status: 'idle', current: null })
    if (source !== 'program') return
    const { enabled, seconds } = this.ports.autoContinue()
    if (!enabled || !this.hasPlayable(false)) return this.advanceToStop()
    if (seconds > 0) return this.startCountdown(seconds, 'continue')
    this.advance(false)
  }

  // Auto-continue found a STOP marker (or nothing playable) before the next song: a STOP at the
  // head is marked played and playback halts there.
  private advanceToStop(): void {
    const programId = this.ports.programId()
    if (programId === null) return this.sync()
    const head = this.ports.unplayedItems(programId)[0]
    if (head?.kind === 'stop' && this.ports.autoContinue().enabled) {
      this.ports.markPlayed(head.id)
    }
    this.sync()
  }

  private startCountdown(seconds: number, reason: 'start' | 'continue'): void {
    this.cancelCountdown()
    this.update({ status: 'countdown', current: null, countdown: { secondsLeft: seconds, reason } })
    this.tick()
  }

  private tick(): void {
    this.timer = this.timers.setTimeout(() => {
      const countdown = this.state.countdown
      if (!countdown) return
      if (countdown.secondsLeft <= 1) return this.finishCountdown()
      this.update({ countdown: { ...countdown, secondsLeft: countdown.secondsLeft - 1 } })
      this.tick()
    }, 1000)
  }

  private finishCountdown(): void {
    const reason = this.state.countdown?.reason ?? 'start'
    this.cancelCountdown()
    this.update({ status: 'idle', countdown: null })
    // Between songs, the program may have changed during the countdown: a STOP now at the head
    // still halts.
    if (reason === 'continue' && !this.hasPlayable(false)) return this.advanceToStop()
    this.advance(reason === 'start')
  }

  private cancelCountdown(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer)
    this.timer = null
  }

  // Whether the program has a song to play next: passing STOP markers, or stopping at one.
  private hasPlayable(passStops: boolean): boolean {
    return this.pick(passStops, false) !== null
  }

  // Finds the next song to play. STOP markers are passed (and, when `consume`, marked played)
  // or end the search; songs whose file is missing are skipped and left in the program, flagged.
  private pick(
    passStops: boolean,
    consume: boolean
  ): { item: Extract<ProgramItem, { kind: 'track' }>; skipped: string[] } | null {
    const programId = this.ports.programId()
    if (programId === null) return null
    const skipped: string[] = []
    for (const item of this.ports.unplayedItems(programId)) {
      if (item.kind === 'stop') {
        if (!passStops) return null
        if (consume) this.ports.markPlayed(item.id)
        continue
      }
      if (this.ports.checkFile(item.fileId)) return { item, skipped }
      skipped.push(item.label)
    }
    return null
  }

  // Starts the program's next song now.
  private advance(passStops: boolean): void {
    const picked = this.pick(passStops, true)
    if (!picked) return this.sync()
    if (picked.skipped.length) {
      this.update({ warning: `Skipped missing file: ${picked.skipped.join(', ')}` })
    }
    const { item } = picked
    this.ports.markPlayed(item.id)
    this.start('program', item.id, item)
  }

  private start(source: PlayKind, itemId: number | null, track: Track): void {
    if (source !== 'program' && !this.ports.checkFile(track.fileId)) {
      this.update({ warning: `Couldn't play “${track.label}”: the file is missing` })
      return
    }
    this.ports.logPlay({
      fileId: track.fileId,
      danceId: track.danceId,
      programId: this.ports.programId(),
      kind: source
    })
    const { fileId, songId, danceId, title, label, parts, country, teacher } = track
    this.update({
      status: 'playing',
      countdown: null,
      speed: this.state.speedLocked ? this.state.speed : 1,
      current: {
        playId: this.nextPlayId++,
        source,
        itemId,
        track: {
          fileId,
          songId,
          danceId,
          title,
          label,
          parts,
          country,
          teacher,
          durationMs: track.durationMs,
          isMissing: false,
          danceCount: track.danceCount
        }
      }
    })
  }

  // Applies a change, re-reads the program and settings, and broadcasts the new state.
  private update(change: Partial<PlayerState>): void {
    const programId = this.ports.programId()
    const items = programId === null ? [] : this.ports.unplayedItems(programId)
    this.state = {
      ...this.state,
      ...change,
      programId,
      nextUp: items[0] ?? null,
      autoContinue: this.ports.autoContinue()
    }
    this.emit(this.state)
  }

  private sync(): void {
    this.update({})
  }
}
