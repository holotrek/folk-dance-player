import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { renderTune, SAMPLE_RATE, TUNE_NAMES, tunePath } from '../../scripts/make-tour-tune.mjs'

describe.each(TUNE_NAMES)('the tour’s practice tune %s', (name) => {
  const wav = renderTune(name)

  test('is a mono 16-bit WAV of about 20 to 25 seconds', () => {
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.readUInt16LE(22)).toBe(1) // mono
    expect(wav.readUInt16LE(34)).toBe(16) // bits
    expect(wav.readUInt32LE(24)).toBe(SAMPLE_RATE)
    const seconds = wav.readUInt32LE(40) / 2 / SAMPLE_RATE
    expect(seconds).toBeGreaterThan(18)
    expect(seconds).toBeLessThan(30)
  })

  test('has audible content that does not clip', () => {
    let peak = 0
    let sum = 0
    const count = (wav.length - 44) / 2
    for (let i = 0; i < count; i++) {
      const v = Math.abs(wav.readInt16LE(44 + i * 2)) / 32768
      peak = Math.max(peak, v)
      sum += v * v
    }
    expect(Math.sqrt(sum / count)).toBeGreaterThan(0.03) // not silence
    expect(peak).toBeLessThan(1) // not clipped
    expect(peak).toBeGreaterThan(0.3)
  })

  test('is deterministic, and the committed file is what the script makes', () => {
    expect(renderTune(name).equals(wav)).toBe(true)
    expect(readFileSync(tunePath(name)).equals(wav)).toBe(true)
  })
})

describe('the tunes', () => {
  test('are two, and different', () => {
    expect([...TUNE_NAMES]).toEqual(['hava-nagila', 'korobushka'])
    expect(renderTune('hava-nagila').equals(renderTune('korobushka'))).toBe(false)
  })
})
