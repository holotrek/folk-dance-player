import { describe, expect, test } from 'vitest'
import { slideBox } from '@shared/projector'

describe('where the slide sits on the projector', () => {
  test('top right, 16:9, within the top half and two-thirds of the width', () => {
    expect(slideBox(1920, 1080)).toEqual({ x: 941, y: 32, width: 902, height: 508 })
  })

  test('on a tall screen it is limited by the width instead', () => {
    const box = slideBox(1000, 2000)
    expect(box.width).toBe(613)
    expect(box.height).toBe(345)
    expect(box.x + box.width).toBe(960)
  })
})
