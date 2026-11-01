import { describe, expect, test } from 'vitest'
import { lensGeometry, lensSvg, replaceLens, type LensSpec } from '../../scripts/make-site-lens.mjs'

// A 2880×1736 screenshot, magnified 2× at (26%, 64%), shown in a lens at the bottom right.
const SPEC: LensSpec = {
  name: 'program',
  src: 'images/program-full.png',
  alt: 'The Program page, with a "magnified" view',
  imageWidth: 2880,
  imageHeight: 1736,
  focus: { x: 0.26, y: 0.64 },
  zoom: 2,
  lens: { x: 0.73, y: 0.41, size: 0.5 }
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

describe('lensGeometry', () => {
  const g = lensGeometry(SPEC)

  test('the ring is the part of the image the lens shows: the lens size over the zoom', () => {
    expect(g.lens.r).toBeCloseTo(250)
    expect(g.ring.r).toBeCloseTo(125)
    expect(g.ring.cx).toBeCloseTo(260)
    expect(g.ring.cy).toBeCloseTo(0.64 * g.imageHeight)
  })

  test('both tangent lines touch both circles and are square to their radii', () => {
    expect(g.tangents).toHaveLength(2)
    for (const { from, to } of g.tangents) {
      expect(dist(from, { x: g.ring.cx, y: g.ring.cy })).toBeCloseTo(g.ring.r)
      expect(dist(to, { x: g.lens.cx, y: g.lens.cy })).toBeCloseTo(g.lens.r)
      const along = { x: to.x - from.x, y: to.y - from.y }
      const ringRadius = { x: from.x - g.ring.cx, y: from.y - g.ring.cy }
      const lensRadius = { x: to.x - g.lens.cx, y: to.y - g.lens.cy }
      expect(along.x * ringRadius.x + along.y * ringRadius.y).toBeCloseTo(0, 3)
      expect(along.x * lensRadius.x + along.y * lensRadius.y).toBeCloseTo(0, 3)
    }
  })

  test('the two lines leave on opposite sides, widening toward the lens', () => {
    const [a, b] = g.tangents
    expect(dist(a.to, b.to)).toBeGreaterThan(dist(a.from, b.from))
  })

  test('the picture is as tall as the image, or as the lens when that hangs lower', () => {
    expect(g.height).toBeGreaterThanOrEqual(g.imageHeight)
    expect(g.height).toBeGreaterThanOrEqual(g.lens.cy + g.lens.r)
    const high = lensGeometry({ ...SPEC, lens: { x: 0.73, y: 0.1, size: 0.3 } })
    expect(high.height).toBeCloseTo(high.imageHeight)
  })

  test('the magnified copy is the zoomed image with the ring’s center on the lens’s', () => {
    expect(g.magnify.scale).toBe(2)
    expect(g.magnify.focus).toEqual({ x: g.ring.cx, y: g.ring.cy })
    expect(lensSvg(SPEC)).toContain(
      `transform="translate(${g.lens.cx} ${g.lens.cy}) scale(2) translate(-${g.ring.cx} -${Math.round(g.ring.cy * 100) / 100})"`
    )
  })
})

describe('lensSvg', () => {
  const svg = lensSvg(SPEC)

  test('is one picture with the alt text escaped, whose parts have names of their own', () => {
    expect(svg).toContain('role="img"')
    expect(svg).toContain('aria-label="The Program page, with a &quot;magnified&quot; view"')
    expect(svg.match(/<image href="images\/program-full\.png"/g)).toHaveLength(2) // the page, and its magnified copy
    expect(svg).toContain('id="lens-program"')
    expect(svg).toContain('id="frame-program"')
  })

  test('is stable, so rerunning the script changes nothing', () => {
    expect(lensSvg(SPEC)).toBe(svg)
  })
})

describe('replaceLens', () => {
  const html = 'before\n<!-- lens:program -->old<!-- /lens:program -->\nafter'

  test('replaces what is between the markers and nothing else, which Prettier leaves alone', () => {
    const out = replaceLens(html, 'program', '<svg></svg>')
    expect(out).toBe(
      'before\n<!-- lens:program -->\n<!-- prettier-ignore -->\n<svg></svg>\n<!-- /lens:program -->\nafter'
    )
    expect(replaceLens(out, 'program', '<svg></svg>')).toBe(out)
  })

  test('indents what it adds as the opening marker is', () => {
    const out = replaceLens(
      '<figure>\n  <!-- lens:a --><!-- /lens:a -->\n</figure>',
      'a',
      '<svg></svg>'
    )
    expect(out).toBe(
      '<figure>\n  <!-- lens:a -->\n  <!-- prettier-ignore -->\n  <svg></svg>\n  <!-- /lens:a -->\n</figure>'
    )
  })

  test('says which lens is missing', () => {
    expect(() => replaceLens(html, 'song', '<svg></svg>')).toThrow(/lens:song/)
  })
})
