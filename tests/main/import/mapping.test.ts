import { describe, expect, test } from 'vitest'
import { mapTags, type ImportMapping } from '../../../src/main/import/mapping'

const mapping: ImportMapping = {
  artistTagTarget: 'artist',
  albumArtistTagTarget: 'ignore',
  genreIsCountry: true
}

const tags = { title: 'Hora Mare', artist: 'Taraf', albumArtist: 'Sonia Dion', genre: 'Romania' }

describe('mapTags', () => {
  test('maps to the song, an automatic dance of the same name, and the pairing', () => {
    expect(mapTags(tags, '/m/hora.mp3', mapping)).toEqual({
      song: { title: 'Hora Mare', artist: 'Taraf' },
      dance: { name: 'Hora Mare', country: 'Romania', choreographer: null },
      teacher: null
    })
  })

  test('routes album artist to the pairing’s teacher when configured', () => {
    const mapped = mapTags(tags, '/m/hora.mp3', { ...mapping, albumArtistTagTarget: 'teacher' })
    expect(mapped.teacher).toBe('Sonia Dion')
    expect(mapped.song.artist).toBe('Taraf')
  })

  test('routes artist to the dance’s choreographer when configured', () => {
    const mapped = mapTags(tags, '/m/hora.mp3', { ...mapping, artistTagTarget: 'choreographer' })
    expect(mapped.dance.choreographer).toBe('Taraf')
    expect(mapped.song.artist).toBeNull()
  })

  test('the artist tag wins when both tags target the same field', () => {
    const mapped = mapTags(tags, '/m/hora.mp3', { ...mapping, albumArtistTagTarget: 'artist' })
    expect(mapped.song.artist).toBe('Taraf')
  })

  test('album artist fills a shared target when the artist tag is empty', () => {
    const mapped = mapTags({ ...tags, artist: null }, '/m/hora.mp3', {
      ...mapping,
      albumArtistTagTarget: 'artist'
    })
    expect(mapped.song.artist).toBe('Sonia Dion')
  })

  test('leaves the dance’s country empty when genre is not country', () => {
    expect(
      mapTags(tags, '/m/hora.mp3', { ...mapping, genreIsCountry: false }).dance.country
    ).toBeNull()
  })

  test('falls back to the file name for a missing or blank title, for song and dance', () => {
    const mapped = mapTags({ ...tags, title: '  ' }, '/m/Ajde Jano.mp3', mapping)
    expect(mapped.song.title).toBe('Ajde Jano')
    expect(mapped.dance.name).toBe('Ajde Jano')
  })

  test('trims values and treats blanks as empty', () => {
    const mapped = mapTags(
      { title: ' Hora ', artist: '  ', albumArtist: null, genre: ' Romania ' },
      '/m/x.mp3',
      mapping
    )
    expect(mapped).toEqual({
      song: { title: 'Hora', artist: null },
      dance: { name: 'Hora', country: 'Romania', choreographer: null },
      teacher: null
    })
  })
})
