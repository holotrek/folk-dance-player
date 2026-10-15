import { describe, expect, test } from 'vitest'
import {
  isShortLink,
  normalizeDeckUrl,
  pageFromEditLink,
  viewAt
} from '../../../src/main/canva/canva-url'

const VIEW = 'https://www.canva.com/design/DAHXoz6s10M/T9RGM0V3Sdllshv8NtdBrw/view'

describe('Canva deck links', () => {
  test('any share link of a deck becomes its plain public view link', () => {
    for (const input of [
      VIEW,
      `${VIEW}#6`,
      `${VIEW}?embed`,
      `${VIEW}?embed#6`,
      `${VIEW}?utm_content=x&utm_source=sharebutton`,
      `  ${VIEW}/  `,
      'https://canva.com/design/DAHXoz6s10M/T9RGM0V3Sdllshv8NtdBrw/view',
      'https://www.canva.com/design/DAHXoz6s10M/T9RGM0V3Sdllshv8NtdBrw/watch'
    ]) {
      expect(normalizeDeckUrl(input)).toEqual({ viewUrl: VIEW, designId: 'DAHXoz6s10M' })
    }
  })

  test('editor links, other sites and junk are not decks', () => {
    for (const input of [
      'https://www.canva.com/design/DAHXoz6s10M/TLVQZ1x1so6_UjT7FH64DQ/edit',
      'https://example.com/design/DAHXoz6s10M/T9RGM0V3Sdllshv8NtdBrw/view',
      'http://www.canva.com/design/DAHXoz6s10M/T9RGM0V3Sdllshv8NtdBrw/view',
      'https://www.canva.com/',
      'not a link'
    ]) {
      expect(normalizeDeckUrl(input)).toBeNull()
    }
  })

  test('opens the view at a slide position', () => {
    expect(viewAt(VIEW, 6)).toBe(`${VIEW}#6`)
  })
})

describe('Canva page links', () => {
  test('a short link is recognized', () => {
    expect(isShortLink('https://canva.link/0qj719kdbysu7vx')).toBe(true)
    expect(isShortLink(VIEW)).toBe(false)
  })

  test('the editor link a short link redirects to names the design and the page', () => {
    const ui = Buffer.from(JSON.stringify({ D: { T: { A: 'PBrWDbC9tVSzgzvW' } } })).toString(
      'base64'
    )
    expect(
      pageFromEditLink(
        `https://www.canva.com/design/DAHXoz6s10M/TLVQZ1x1so6_UjT7FH64DQ/edit?ui=${ui}`
      )
    ).toEqual({ designId: 'DAHXoz6s10M', pageId: 'PBrWDbC9tVSzgzvW' })
  })

  test('a link without a readable page is refused', () => {
    expect(pageFromEditLink(`${VIEW}`)).toBeNull()
    expect(pageFromEditLink('https://www.canva.com/design/D/T/edit?ui=bm90IGpzb24=')).toBeNull()
    expect(pageFromEditLink('https://www.canva.com/design/D/T/edit?ui=e30=')).toBeNull()
  })
})
