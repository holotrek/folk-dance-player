import { describe, expect, test } from 'vitest'
import { PROJECTOR_COLORS as c, contrastRatio, projectorCssVars } from '@shared/projector-colors'

describe('contrastRatio', () => {
  test('black on white is 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })
  test('is symmetric, and 1 for the same color', () => {
    expect(contrastRatio('#3a3a3a', '#fff')).toBeCloseTo(contrastRatio('#fff', '#3a3a3a'), 10)
    expect(contrastRatio('#777', '#777')).toBe(1)
  })
  test('matches a known pair (#767676 on white is about 4.54)', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })
})

describe('the projector look keeps its minimums (tune the grays freely above them)', () => {
  const text: Array<[string, string, string]> = [
    ['dance', c.text, c.page],
    ['played dance', c.playedText, c.page],
    ['song', c.subText, c.page],
    ['heading', c.heading, c.page],
    ['panel dance', c.panelText, c.panel],
    ['panel song and country', c.panelSubText, c.panel],
    ['panel heading', c.panelHeading, c.panel],
    ['paused label', c.paused, c.panel]
  ]
  test.each(text)('%s text is at least 7:1', (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(7)
  })
  test('the red progress bar is at least 3:1 against its track', () => {
    expect(contrastRatio(c.bar, c.track)).toBeGreaterThanOrEqual(3)
  })
  test('the panel stands out from the page by at least 1.5:1, and is lighter', () => {
    expect(contrastRatio(c.panel, c.page)).toBeGreaterThanOrEqual(1.5)
    expect(contrastRatio(c.panel, '#ffffff')).toBeLessThan(contrastRatio(c.page, '#ffffff'))
  })
  test('the rule between rows is at least 3:1 against the page', () => {
    expect(contrastRatio(c.rule, c.page)).toBeGreaterThanOrEqual(3)
  })
  test('projectorCssVars exposes every color as a --fdp- variable', () => {
    const vars = projectorCssVars()
    expect(vars['--fdp-panel']).toBe(c.panel)
    expect(vars['--fdp-rule']).toBe(c.rule)
    expect(Object.keys(vars)).toHaveLength(Object.keys(c).length)
  })
})
