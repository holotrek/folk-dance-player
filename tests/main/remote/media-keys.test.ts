import { describe, expect, test, vi } from 'vitest'
import { MEDIA_KEYS, registerMediaKeys } from '../../../src/main/remote/media-keys'

function setup(failing: string[] = []) {
  const callbacks = new Map<string, () => void>()
  const shortcuts = {
    register: (key: string, fn: () => void) => {
      if (failing.includes(key)) return false
      callbacks.set(key, fn)
      return true
    }
  }
  const player = { toggle: vi.fn(), next: vi.fn(), restart: vi.fn(), stop: vi.fn() }
  return { keys: registerMediaKeys(shortcuts, player), callbacks, player }
}

describe('media keys (the remote)', () => {
  test('registers play/pause, next, previous and stop', () => {
    const { keys } = setup()
    expect(keys).toEqual(Object.keys(MEDIA_KEYS))
  })

  test('play/pause toggles, next skips, previous restarts the song, stop stops', () => {
    const { callbacks, player } = setup()
    callbacks.get('MediaPlayPause')!()
    callbacks.get('MediaNextTrack')!()
    callbacks.get('MediaPreviousTrack')!()
    callbacks.get('MediaStop')!()
    expect(player.toggle).toHaveBeenCalledTimes(1)
    expect(player.next).toHaveBeenCalledTimes(1)
    expect(player.restart).toHaveBeenCalledTimes(1)
    expect(player.stop).toHaveBeenCalledTimes(1)
  })

  test('a key another app holds is left out of the registered list', () => {
    const { keys } = setup(['MediaStop'])
    expect(keys).toEqual(['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack'])
  })
})
