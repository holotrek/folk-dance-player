import { describe, expect, test } from 'vitest'
import { tourOffer, type TourFlag } from '@shared/tour'

const offer = (basic: TourFlag, advanced: TourFlag) => tourOffer({ basic, advanced })

describe('the tour offer (spec §2.2)', () => {
  test('Basic is offered until it is done or hidden', () => {
    expect(offer('unseen', 'unseen')).toBe('basic')
    expect(offer('unseen', 'done')).toBe('basic')
  })

  test('after Basic is done, Advanced is offered until it is done or hidden', () => {
    expect(offer('done', 'unseen')).toBe('advanced')
    expect(offer('done', 'done')).toBeNull()
    expect(offer('done', 'hidden')).toBeNull()
  })

  test('hidden Basic offers nothing at all, not even Advanced', () => {
    expect(offer('hidden', 'unseen')).toBeNull()
    expect(offer('hidden', 'done')).toBeNull()
    expect(offer('hidden', 'hidden')).toBeNull()
  })
})
