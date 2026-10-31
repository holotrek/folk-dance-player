// What the tour asks of the audio element (tour spec §3, the player steps): the first song repeats
// while the person tries the speed and volume, and the wait-between-songs step jumps to the last
// seconds so the next song is heard starting. The player bar's `useAudio` follows this; nothing here
// is state of the app, and a tour's reload clears it.
const NEAR_END_MS = 5000

type Listener = () => void

let looping = false
const changes = new Set<Listener>()
const jumps = new Set<Listener>()

export const tourAudio = {
  loop: (): boolean => looping,
  setLoop(on: boolean): void {
    if (looping === on) return
    looping = on
    changes.forEach((fn) => fn())
  },
  subscribe(fn: Listener): () => void {
    changes.add(fn)
    return () => void changes.delete(fn)
  },
  // How far from the end a jump lands.
  nearEndMs: NEAR_END_MS,
  jumpNearEnd(): void {
    jumps.forEach((fn) => fn())
  },
  onJump(fn: Listener): () => void {
    jumps.add(fn)
    return () => void jumps.delete(fn)
  },
  reset(): void {
    this.setLoop(false)
  }
}
