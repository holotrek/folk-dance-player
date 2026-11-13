import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

type Image = { size: number; png: Buffer }
const { buildIco } = createRequire(import.meta.url)('../../scripts/ico.cjs') as {
  buildIco(images: Image[]): Buffer
}

const png = (size: number, fill: number): Image => ({ size, png: Buffer.alloc(10 + size, fill) })

describe('buildIco', () => {
  const small = png(16, 1)
  const big = png(256, 2)
  const ico = buildIco([small, big])

  test('starts with the ICONDIR header: reserved 0, type 1, two images', () => {
    expect([...ico.subarray(0, 6)]).toEqual([0, 0, 1, 0, 2, 0])
  })

  test('is exactly the header, one 16-byte entry per image and the PNG bytes', () => {
    expect(ico.length).toBe(6 + 16 * 2 + small.png.length + big.png.length)
  })

  test('stores the size in the entry, with 256 written as 0', () => {
    expect(ico[6]).toBe(16)
    expect(ico[7]).toBe(16)
    expect(ico[6 + 16]).toBe(0)
    expect(ico[6 + 16 + 1]).toBe(0)
  })

  test('marks the entries as 32-bit PNG data and points each at its bytes', () => {
    for (const [i, image] of [small, big].entries()) {
      const entry = 6 + 16 * i
      expect(ico.readUInt16LE(entry + 6)).toBe(32) // bits per pixel
      expect(ico.readUInt32LE(entry + 8)).toBe(image.png.length)
      const offset = ico.readUInt32LE(entry + 12)
      expect(ico.subarray(offset, offset + image.png.length).equals(image.png)).toBe(true)
    }
  })
})
