import type { PlayerSession } from '../session/player-session'

// What a remote's buttons do (spec §7.4). Remotes send media keys: one play/pause button,
// next and previous. Volume is left to the system.
export const MEDIA_KEYS = {
  MediaPlayPause: 'toggle',
  MediaNextTrack: 'next',
  MediaPreviousTrack: 'restart',
  MediaStop: 'stop'
} as const

export interface ShortcutRegistrar {
  register(accelerator: string, callback: () => void): boolean
}

type RemotePlayer = Pick<PlayerSession, (typeof MEDIA_KEYS)[keyof typeof MEDIA_KEYS]>

// Registers the media keys as global shortcuts, so the remote works whether the app is idle or
// playing, focused or not (verified in the remote spike: docs/spikes/remote-control.md). Returns
// the keys that were registered; another app may hold some.
export function registerMediaKeys(shortcuts: ShortcutRegistrar, player: RemotePlayer): string[] {
  return Object.entries(MEDIA_KEYS)
    .filter(([key, command]) => shortcuts.register(key, () => player[command]()))
    .map(([key]) => key)
}
