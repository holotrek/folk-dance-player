import { describe, expect, test } from 'vitest'
import { UPDATE_CHECK_MS, UPDATE_FIRST_CHECK_MS, UPDATE_IDLE } from '@shared/updates'

describe('update constants', () => {
  test('nothing is known at first', () => {
    expect(UPDATE_IDLE).toEqual({ kind: 'idle' })
  })

  test('the app checks four hours apart, the first time shortly after it starts', () => {
    expect(UPDATE_CHECK_MS).toBe(4 * 60 * 60 * 1000)
    expect(UPDATE_FIRST_CHECK_MS).toBe(20_000)
  })
})
