import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parseDeckPage } from '../../../src/main/canva/deck-parser'

const fixture = readFileSync(join(__dirname, '../../fixtures/canva-view.html'), 'utf8')

describe('reading a Canva view page', () => {
  test('reads the presentation title and the ordered slides with their titles', () => {
    expect(parseDeckPage(fixture)).toEqual({
      title: "Dance n' Jam Tunes",
      pages: [
        { id: 'PBXfZFjfswX8XxS6', title: 'Ajde Jano' },
        { id: 'PBGXpNQqng7fBG4b', title: null }, // an unnamed slide: nested "B"s aren't its title
        { id: 'PBrWDbC9tVSzgzvW', title: 'Ali Paşa' },
        { id: 'PB9pWK4tkzhyZd67', title: 'Lesnoto "Pravo"' }
      ]
    })
  })

  test('a page in another format yields no slides (the caller then keeps the old list)', () => {
    expect(parseDeckPage('<html><title>Something</title></html>')).toEqual({
      title: 'Something',
      pages: []
    })
  })
})
