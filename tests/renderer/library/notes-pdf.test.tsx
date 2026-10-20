import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { SongDetail } from '@shared/library'
import SongEditor from '@renderer/library/SongEditor'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from './render-library'

const dance = (over: Partial<SongDetail['dances'][number]> = {}): SongDetail['dances'][number] => ({
  danceId: 11,
  pairingId: 21,
  name: 'Lesnoto',
  country: null,
  choreographer: null,
  danceType: null,
  difficulty: null,
  notes: null,
  teacher: null,
  songCount: 1,
  isDefault: true,
  sameAsSong: false,
  notesPdf: null,
  slideImage: null,
  slideShows: null,
  label: 'Lesnoto ♪ Song',
  slide: null,
  ...over
})

const detail = (dances = [dance()]): SongDetail => ({
  songId: 1,
  fileId: 101,
  title: 'Song',
  artist: null,
  path: '/m/song.mp3',
  durationMs: 1000,
  isMissing: false,
  isFavorite: false,
  dances,
  suggestions: []
})

function setup(song: SongDetail, extra: Record<string, unknown> = {}) {
  const fake = createFakeApi({
    'library:song': song,
    'library:suggestions': { people: [], countries: [], danceTypes: [] },
    'library:attachNotesPdf': true,
    'library:openNotesPdf': undefined,
    'library:removeNotesPdf': undefined,
    ...extra
  })
  renderWithLibrary(<SongEditor songId={1} />, fake.api)
  return fake
}

const card = (name = 'Lesnoto ♪ Song') => within(screen.getByRole('group', { name }))

describe('a dance’s PDF in the song editor', () => {
  test('without a PDF, Attach PDF… asks main to attach one for this dance', async () => {
    const fake = setup(detail())
    await userEvent.click(await screen.findByRole('button', { name: 'Attach PDF…' }))
    expect(fake.callsTo('library:attachNotesPdf')).toEqual([[11]])
  })

  test('a canceled dialog shows nothing', async () => {
    setup(detail(), { 'library:attachNotesPdf': false })
    await userEvent.click(await screen.findByRole('button', { name: 'Attach PDF…' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('with a PDF: its name, Open and Remove', async () => {
    const fake = setup(detail([dance({ notesPdf: { name: 'Lesnoto notes.pdf', missing: false } })]))
    expect(await screen.findByText('Lesnoto notes.pdf')).toBeInTheDocument()
    await userEvent.click(card().getByRole('button', { name: 'Open PDF' }))
    expect(fake.callsTo('library:openNotesPdf')).toEqual([[11]])
    await userEvent.click(card().getByRole('button', { name: 'Remove PDF' }))
    expect(fake.callsTo('library:removeNotesPdf')).toEqual([[11]])
    expect(screen.queryByRole('button', { name: 'Attach PDF…' })).toBeNull()
  })

  test('a missing PDF says so, and offers Attach PDF… and Remove', async () => {
    setup(detail([dance({ notesPdf: { name: 'Lesnoto notes.pdf', missing: true } })]))
    expect(await screen.findByText(/The PDF is missing/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attach PDF…' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove PDF' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open PDF' })).toBeNull()
  })

  test('an error from Open is shown', async () => {
    setup(detail([dance({ notesPdf: { name: 'a.pdf', missing: false } })]), {
      'library:openNotesPdf': () => Promise.reject(new Error('Couldn’t open the PDF: no viewer'))
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Open PDF' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no viewer')
  })

  test('each dance of the song has its own PDF controls', async () => {
    setup(
      detail([
        dance({ notesPdf: { name: 'one.pdf', missing: false } }),
        dance({
          danceId: 12,
          pairingId: 22,
          name: 'Other',
          label: 'Other ♪ Song',
          isDefault: false
        })
      ])
    )
    await waitFor(() => expect(screen.getByText('one.pdf')).toBeInTheDocument())
    expect(card('Other ♪ Song').getByRole('button', { name: 'Attach PDF…' })).toBeInTheDocument()
  })
})
