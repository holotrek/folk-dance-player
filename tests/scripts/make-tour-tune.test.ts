import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { renderTune, SAMPLE_RATE, TUNE_PATH } from '../../scripts/make-tour-tune.mjs'

describe('the tour’s practice tune', () => {
  const wav = renderTune()

  test('is a mono 16-bit WAV of about 25 seconds', () => {
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.readUInt16LE(22)).toBe(1) // mono
    expect(wav.readUInt16LE(34)).toBe(16) // bits
    expect(wav.readUInt32LE(24)).toBe(SAMPLE_RATE)
    const seconds = wav.readUInt32LE(40) / 2 / SAMPLE_RATE
    expect(seconds).toBeGreaterThan(20)
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
    expect(renderTune().equals(wav)).toBe(true)
    expect(readFileSync(TUNE_PATH).equals(wav)).toBe(true)
  })
})
