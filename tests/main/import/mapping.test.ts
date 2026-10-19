import { describe, expect, test } from 'vitest'
import { mapTags, type ImportMapping } from '../../../src/main/import/mapping'

const mapping: ImportMapping = {
  artistFrom: 'artistTag',
  teacherFrom: 'ignore',
  choreographerFrom: 'ignore',
  genreIsCountry: true
}

const tags = { title: 'Hora Mare', artist: 'Taraf', albumArtist: 'Sonia Dion', genre: 'Romania' }

describe('mapTags', () => {
  test('the Artist tag feeds Artist by default, with an automatic dance of the same name', () => {
    expect(mapTags(tags, '/m/hora.mp3', mapping)).toEqual({
      song: { title: 'Hora Mare', artist: 'Taraf' },
      dance: { name: 'Hora Mare', country: 'Romania', choreographer: null },
      teacher: null
    })
  })

  test('the Album Artist tag can feed the pairing’s teacher', () => {
    const mapped = mapTags(tags, '/m/hora.mp3', { ...mapping, teacherFrom: 'albumArtistTag' })
    expect(mapped.teacher).toBe('Sonia Dion')
    expect(mapped.song.artist).toBe('Taraf')
  })

  test('the Artist tag can feed the dance’s choreographer instead of the artist', () => {
    const mapped = mapTags(tags, '/m/hora.mp3', {
      ...mapping,
      artistFrom: 'ignore',
      choreographerFrom: 'artistTag'
    })
    expect(mapped.dance.choreographer).toBe('Taraf')
    expect(mapped.song.artist).toBeNull()
  })

  test('one tag can feed two destinations', () => {
    const mapped = mapTags(tags, '/m/hora.mp3', { ...mapping, choreographerFrom: 'artistTag' })
    expect(mapped.song.artist).toBe('Taraf')
    expect(mapped.dance.choreographer).toBe('Taraf')
  })

  test('an empty tag leaves its destination empty, never the other tag’s value', () => {
    const mapped = mapTags({ ...tags, albumArtist: null }, '/m/hora.mp3', {
      ...mapping,
      teacherFrom: 'albumArtistTag'
    })
    expect(mapped.teacher).toBeNull()
  })

  test('Ignore leaves a destination empty', () => {
    expect(
      mapTags(tags, '/m/hora.mp3', { ...mapping, artistFrom: 'ignore' }).song.artist
    ).toBeNull()
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
