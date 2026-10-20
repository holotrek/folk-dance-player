import { describe, expect, test } from 'vitest'
import { mappingFromSettings, mappingSettings, type ImportMapping } from '@shared/import'
import { DEFAULT_SETTINGS } from '@shared/settings'

describe('the import mapping and its settings', () => {
  test('the defaults: the Artist tag feeds Artist, genre is country', () => {
    expect(mappingFromSettings(DEFAULT_SETTINGS)).toEqual({
      artistFrom: 'artistTag',
      teacherFrom: 'ignore',
      choreographerFrom: 'ignore',
      genreIsCountry: true
    })
  })

  test('a mapping round-trips through its settings', () => {
    const m: ImportMapping = {
      artistFrom: 'ignore',
      teacherFrom: 'albumArtistTag',
      choreographerFrom: 'artistTag',
      genreIsCountry: false
    }
    expect(mappingFromSettings({ ...DEFAULT_SETTINGS, ...mappingSettings(m) })).toEqual(m)
  })
})
