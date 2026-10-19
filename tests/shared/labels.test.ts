import { describe, expect, test } from 'vitest'
import { formatLabel, labelParts } from '@shared/labels'

// Spec §4 "Labels".
describe('labelParts / formatLabel', () => {
  test.each([
    ['Hora de la Munte', 'Hora Mare', null, 0, 'Hora Mare ♪ Hora de la Munte'],
    ['Svornato', 'Svornato', 'Jaap Leegwater', 2, 'Svornato (Jaap Leegwater)'],
    [
      'Pusteno Ludo',
      'Pravo Rhodopsko Oro',
      'Yves Moreau',
      2,
      'Pravo Rhodopsko Oro (Yves Moreau) ♪ Pusteno Ludo'
    ],
    ['Hora Fetelor', 'Hora Fetelor', 'Someone', 1, 'Hora Fetelor']
  ])('%s / %s / %s (%i choreographers) → %s', (song, dance, choreographer, count, label) => {
    expect(
      formatLabel(
        labelParts({
          songTitle: song,
          danceName: dance,
          choreographer,
          choreographerCount: count
        })
      )
    ).toBe(label)
  })

  test('a song with no dance is just its title', () => {
    expect(
      formatLabel(
        labelParts({
          songTitle: 'Solo Song',
          danceName: null,
          choreographer: null,
          choreographerCount: 0
        })
      )
    ).toBe('Solo Song')
  })

  test('treats song and dance names that differ only in case or spacing as the same', () => {
    expect(
      labelParts({
        songTitle: ' hora fetelor ',
        danceName: 'Hora Fetelor',
        choreographer: null,
        choreographerCount: 0
      })
    ).toEqual({ song: null, dance: 'Hora Fetelor', choreographer: null })
  })

  test('never shows empty parentheses for a traditional dance', () => {
    expect(
      formatLabel(
        labelParts({
          songTitle: 'Svornato',
          danceName: 'Svornato',
          choreographer: null,
          choreographerCount: 3
        })
      )
    ).toBe('Svornato')
  })

  test('a song with no dance is labelled by its title', () => {
    expect(
      labelParts({
        songTitle: 'Untitled',
        danceName: null,
        choreographer: null,
        choreographerCount: 0
      })
    ).toEqual({ song: null, dance: 'Untitled', choreographer: null })
  })
})
