import { describe, expect, test } from 'vitest'
import { foldSearchText, toFtsQuery } from '../../../src/main/db/fts'

describe('foldSearchText', () => {
  test.each([
    ['Kırmızı', 'Kirmizi'],
    ['Łódź', 'Lódź'],
    ['Øland', 'Oland'],
    ['Ævintýri', 'AEvintýri'],
    ['Straße', 'Strasse'],
    ['Đurđevdan', 'Durdevdan'],
    ['Þórður', 'THórdur']
  ])('folds %j to %j (combining accents are left to the tokenizer)', (input, expected) => {
    expect(foldSearchText(input)).toBe(expected)
  })

  test('leaves null as null', () => {
    expect(foldSearchText(null)).toBeNull()
  })
})

describe('toFtsQuery', () => {
  test('quotes each word as a prefix term', () => {
    expect(toFtsQuery('ajde jano')).toBe('"ajde"* "jano"*')
  })

  test('splits on punctuation', () => {
    expect(toFtsQuery('4-Wall')).toBe('"4"* "Wall"*')
    expect(toFtsQuery("Côte d'Ivoire")).toBe('"Côte"* "d"* "Ivoire"*')
  })

  test('drops FTS syntax characters', () => {
    expect(toFtsQuery('"hora" OR (mare*)')).toBe('"hora"* "OR"* "mare"*')
  })

  test('folds letters the tokenizer does not', () => {
    expect(toFtsQuery('Kırmızı')).toBe('"Kirmizi"*')
  })

  test('returns null when there is nothing to search for', () => {
    expect(toFtsQuery('  -- ')).toBeNull()
  })
})
