import { expect, test, vi } from 'vitest'
import { tourAudio } from '@renderer/tour/audio-hold'

test('loop is off until set, tells listeners, and reset puts everything back', () => {
  const heard = vi.fn()
  const stop = tourAudio.subscribe(heard)
  expect(tourAudio.loop()).toBe(false)
  tourAudio.setLoop(true)
  expect(tourAudio.loop()).toBe(true)
  expect(heard).toHaveBeenCalledTimes(1)
  tourAudio.setLoop(true) // no change, nothing to tell
  expect(heard).toHaveBeenCalledTimes(1)
  tourAudio.reset()
  expect(tourAudio.loop()).toBe(false)
  stop()
})

test('a jump is announced to whoever listens', () => {
  const jumped = vi.fn()
  const stop = tourAudio.onJump(jumped)
  tourAudio.jumpNearEnd()
  expect(jumped).toHaveBeenCalledTimes(1)
  stop()
  tourAudio.jumpNearEnd()
  expect(jumped).toHaveBeenCalledTimes(1)
})
