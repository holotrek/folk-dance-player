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
  markUnplayed(itemId: number): void
  getTrack(fileId: number, danceId: number | null): Track | null
  getLoggedPlay(logId: number): { fileId: number; danceId: number | null } | null
  logPlay(entry: {
    fileId: number
    danceId: number | null
    programId: number | null
    kind: PlayKind
  }): number
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
  private stopProgram: number | null = null
  private stopHead: number | null = null

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

  // Re-reads the program and settings (after an edit, or a different program was loaded), and the
  // playing song's label (its dance may have been edited).
  refresh(): void {
    const current = this.state.current
    const track = current && this.ports.getTrack(current.track.fileId, current.track.danceId)
    this.update(current && track ? { current: { ...current, track } } : {})
  }

  // ▶ (spec §7.2): resumes, or skips a running countdown, or starts the program's next song —
  // after the countdown when one is set. An operator's ▶ passes STOP markers.
  play(): void {
    const { status } = this.state
    if (status === 'paused' || status === 'stopped') return this.update({ status: 'playing' })
    if (status === 'playing') return
    if (status === 'countdown') return this.finishCountdown()
    const seconds = this.ports.countdownSeconds()
    if (seconds > 0 && this.hasPlayable(true)) return this.startCountdown(seconds, 'start')
    this.advance(true)
  }

  pause(): void {
    if (this.state.status === 'playing') this.update({ status: 'paused' })
  }

  // The remote's play/pause button (one physical button): pauses a playing song, or does ▶.
  toggle(): void {
    if (this.state.status === 'playing') this.pause()
    else this.play()
  }

  // ◀◀ (and the remote's back button): rewinds the current song to its start. It stays the same
  // play; playing or paused, it carries on as it was.
  restart(): void {
    const current = this.state.current
    if (current) this.update({ current: { ...current, restarts: current.restarts + 1 } })
  }

  // ⏹: rewinds the song to its start and keeps it loaded, so ▶ plays it again as the same play
  // (no new log entry). During a countdown, cancels it.
  stop(): void {
    if (this.state.status === 'countdown') {
      this.cancelCountdown()
      return this.update({ status: 'idle', countdown: null })
    }
    if (this.state.status === 'playing' || this.state.status === 'paused') {
      this.update({ status: 'stopped' })
    }
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
    if (track) this.startNow('preview', track)
  }

  // Double-click in "Previously played": plays that entry again, as the dance it was logged with.
  replay(logId: number): void {
    const logged = this.ports.getLoggedPlay(logId)
    const track = logged && this.ports.getTrack(logged.fileId, logged.danceId)
    if (track) this.startNow('replay', track)
  }

  // A preview or replay: plays now, interrupting what's playing. A missing file only warns, and
  // whatever was playing or counting down carries on.
  private startNow(source: 'preview' | 'replay', track: Track): void {
    if (!this.ports.checkFile(track.fileId)) {
      this.update({ warning: `Couldn't play “${track.label}”: the file is missing` })
      return
    }
    this.interrupt()
    this.start(source, null, track)
  }

  // Cancels the countdown, and puts a program song that hasn't ended back as unplayed.
  private interrupt(): void {
    this.cancelCountdown()
    const current = this.state.current
    if (current?.source === 'program' && current.itemId !== null) {
      this.ports.markUnplayed(current.itemId)
    }
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
  // head is marked played and playback halts there. Missing songs it ran into are named.
  private advanceToStop(): void {
    const programId = this.ports.programId()
    if (programId === null) return this.sync()
    this.warnSkipped(this.pick(false, false).skipped)
    const head = this.ports.unplayedItems(programId)[0]
    if (head?.kind === 'stop') {
      this.ports.markPlayed(head.id)
      // Teaching applies to the dance after the STOP, in this program, until it changes.
      this.stopProgram = programId
      this.stopHead = this.ports.unplayedItems(programId)[0]?.id ?? null
      return this.update({ atStop: true })
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
    // Between songs, the program or the setting may have changed during the countdown: a STOP now
    // at the head still halts, and so does auto-continue turned off.
    if (reason === 'continue' && (!this.ports.autoContinue().enabled || !this.hasPlayable(false))) {
      return this.advanceToStop()
    }
    this.advance(reason === 'start')
  }

  private cancelCountdown(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer)
    this.timer = null
  }

  // Whether the program has a song to play next: passing STOP markers, or stopping at one.
  private hasPlayable(passStops: boolean): boolean {
    return this.pick(passStops, false).item !== null
  }

  // Finds the next song to play. STOP markers are passed (and, when `consume`, marked played)
  // or end the search; songs whose file is missing are skipped and left in the program, flagged.
  // `skipped` names them, whether or not a song was found.
  private pick(
    passStops: boolean,
    consume: boolean
  ): { item: Extract<ProgramItem, { kind: 'track' }> | null; skipped: string[] } {
    const skipped: string[] = []
    const programId = this.ports.programId()
    if (programId === null) return { item: null, skipped }
    for (const item of this.ports.unplayedItems(programId)) {
      if (item.kind === 'stop') {
        if (!passStops) return { item: null, skipped }
        if (consume) this.ports.markPlayed(item.id)
        continue
      }
      if (this.ports.checkFile(item.fileId)) return { item, skipped }
      skipped.push(item.label)
    }
    return { item: null, skipped }
  }

  private warnSkipped(skipped: string[]): void {
    if (skipped.length) this.update({ warning: `Skipped missing file: ${skipped.join(', ')}` })
  }

  // Starts the program's next song now.
  private advance(passStops: boolean): void {
    const { item, skipped } = this.pick(passStops, true)
    this.warnSkipped(skipped)
    if (!item) return this.sync()
    this.ports.markPlayed(item.id)
    this.start('program', item.id, item)
  }

  private start(source: PlayKind, itemId: number | null, track: Track): void {
    const logId = this.ports.logPlay({
      fileId: track.fileId,
      danceId: track.danceId,
      programId: this.ports.programId(),
      kind: source
    })
    const { fileId, songId, danceId, title, label, parts, country, teacher } = track
    this.update({
      status: 'playing',
      countdown: null,
      atStop: false,
      speed: this.state.speedLocked ? this.state.speed : 1,
      current: {
        playId: this.nextPlayId++,
        source,
        itemId,
        restarts: 0,
        logId,
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
    // Halted at a STOP stays true only while the same program's next item is still the one after it.
    const atStop =
      (change.atStop ?? this.state.atStop) &&
      programId === this.stopProgram &&
      (items[0]?.id ?? null) === this.stopHead
    this.state = {
      ...this.state,
      ...change,
      atStop,
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
