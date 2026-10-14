import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { emptySummary, type ImportSummary } from '@shared/import'
import { DEFAULT_SETTINGS } from '@shared/settings'
import MusicPage from '@renderer/pages/MusicPage'
import { createFakeApi } from './fake-api'
import { renderWithLibrary } from './library/render-library'

const preview = {
  trackCount: 3,
  playlists: [
    { persistentId: 'BAL', name: 'Balkan', trackCount: 2 },
    { persistentId: 'CPL', name: 'Couple dances', trackCount: 1 }
  ],
  tagSample: [
    { title: 'Ajde Jano', artist: 'Ensemble', albumArtist: 'Bora Özkök', genre: 'Serbia' },
    { title: 'Ali Paşa', artist: null, albumArtist: null, genre: 'Turkey' }
  ]
}

function summary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return { ...emptySummary(), ...overrides }
}

describe('Music page import', () => {
  test('shows how many songs are in the library', async () => {
    const fake = createFakeApi({ 'library:stats': { fileCount: 42 } })
    renderWithLibrary(<MusicPage />, fake.api)
    expect(await screen.findByText('42 songs in your library')).toBeInTheDocument()
  })

  test('Add Music: pick, confirm the mapping, import, and see the summary', async () => {
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickMusic': ['/Music/Balkan'],
      'import:start': summary({
        added: [{ path: '/Music/Balkan/Ajde Jano.mp3' }, { path: '/Music/Balkan/Kolo.mp3' }],
        unsupported: [{ path: '/Music/Balkan/Old.aiff', detail: 'Format not supported' }]
      })
    })
    renderWithLibrary(<MusicPage />, fake.api)

    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import music' })
    expect(within(dialog).getByLabelText('Genre is Country')).toBeChecked()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }))

    expect(fake.callsTo('import:start')).toEqual([[{ kind: 'paths', paths: ['/Music/Balkan'] }]])
    expect(await screen.findByText('Added (2)')).toBeInTheDocument()
    expect(screen.getByText('Unsupported format (1)')).toBeInTheDocument()
  })

  test('saves the mapping the user chose before importing', async () => {
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickMusic': ['/Music'],
      'import:start': summary()
    })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import music' })

    await userEvent.click(within(dialog).getByLabelText('Genre is Country'))
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Album Artist → Teacher' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }))

    await waitFor(() => expect(fake.callsTo('import:start')).toHaveLength(1))
    expect(fake.settings['import.genreIsCountry']).toBe(false)
    expect(fake.settings['import.albumArtistTagTarget']).toBe('teacher')
  })

  test('does nothing when the picker is cancelled', async () => {
    const fake = createFakeApi({ 'library:stats': { fileCount: 0 }, 'import:pickMusic': [] })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    await waitFor(() => expect(fake.callsTo('import:pickMusic')).toHaveLength(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('shows progress and can cancel a running import', async () => {
    let finish: (s: ImportSummary) => void = () => undefined
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickMusic': ['/Music'],
      'import:start': () => new Promise<ImportSummary>((resolve) => (finish = resolve)),
      'import:cancel': undefined
    })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Import' })
    )

    act(() =>
      fake.emit('import:progress', {
        phase: 'reading',
        done: 3,
        total: 10,
        currentPath: '/Music/Kolo.mp3'
      })
    )
    expect(await screen.findByText('3 of 10')).toBeInTheDocument()
    expect(screen.getByText('Kolo.mp3')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel import' }))
    expect(fake.callsTo('import:cancel')).toHaveLength(1)

    await act(async () => finish(summary({ cancelled: true, added: [{ path: '/Music/a.mp3' }] })))
    expect(
      await screen.findByText(/songs imported before you stopped it were kept/)
    ).toBeInTheDocument()
  })

  test('dropping files opens the import with their paths', async () => {
    const fake = createFakeApi({ 'library:stats': { fileCount: 0 }, 'import:start': summary() }, [
      '/Users/me/Desktop/Hora.mp3'
    ])
    renderWithLibrary(<MusicPage />, fake.api)
    const zone = await screen.findByText(/Drop music files or folders here/)
    const file = new File(['x'], 'Hora.mp3')
    fireEvent.drop(zone, { dataTransfer: { files: [file], types: ['Files'] } })
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Import' })
    )
    expect(fake.callsTo('import:start')).toEqual([
      [{ kind: 'paths', paths: ['/Users/me/Desktop/Hora.mp3'] }]
    ])
  })

  test('refreshes the song count after an import', async () => {
    let count = 0
    const fake = createFakeApi({
      'library:stats': () => ({ fileCount: count }),
      'import:pickMusic': ['/Music'],
      'import:start': () => {
        count = 5
        return summary({ added: [{ path: '/Music/a.mp3' }] })
      }
    })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Import' })
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Done' }))
    expect(await screen.findByText('5 songs in your library')).toBeInTheDocument()
  })
})

describe('import dialog robustness', () => {
  test('double-clicking Import starts only one import', async () => {
    // Real IPC takes a few milliseconds; the second click lands while settings are saving.
    const slowSet = async () => {
      await new Promise((r) => setTimeout(r, 50))
      return DEFAULT_SETTINGS
    }
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickMusic': ['/Music'],
      'settings:set': slowSet,
      'import:start': summary()
    })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    await userEvent.dblClick(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Import' })
    )
    await screen.findByText('Import finished')
    expect(fake.callsTo('import:start')).toHaveLength(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('a result that arrives after the dialog was closed does not reopen it', async () => {
    let resolvePreview: (p: typeof preview) => void = () => undefined
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickAppleLibrary': '/Users/me/Library.xml',
      'import:previewApple': () => new Promise((resolve) => (resolvePreview = resolve))
    })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Import from Apple Music…' }))
    await screen.findByText('Reading your Apple Music library…')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await act(async () => resolvePreview(preview))
    // Give the modal's open transition time to mount if it (wrongly) reopens.
    await act(() => new Promise((r) => setTimeout(r, 400)))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Apple Music import', () => {
  test('imports chosen playlists and asks about playlists edited since the last import', async () => {
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickAppleLibrary': '/Users/me/Library.xml',
      'import:previewApple': preview,
      'import:checkPlaylistConflicts': [{ persistentId: 'BAL', name: 'Balkan' }],
      'import:start': summary({
        playlists: { created: [], replaced: [], kept: [], duplicated: ['Balkan (Apple Music)'] }
      })
    })
    renderWithLibrary(<MusicPage />, fake.api)

    await userEvent.click(await screen.findByRole('button', { name: 'Import from Apple Music…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import from Apple Music' })
    expect(await within(dialog).findByText('3 songs with files on this Mac')).toBeInTheDocument()
    const tags = within(dialog).getByRole('table', { name: 'File tags' })
    expect(within(tags).getByText('Bora Özkök')).toBeInTheDocument()
    expect(within(tags).getByText('Turkey')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Tags of 2 of the 3 songs, chosen at random')

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Choose playlists' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Balkan (2 songs)' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }))

    expect(fake.callsTo('import:checkPlaylistConflicts')).toEqual([[['BAL']]])
    expect(await screen.findByText(/changed since you last imported/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Keep both' }))
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))

    expect(fake.callsTo('import:start')).toEqual([
      [
        {
          kind: 'apple',
          xmlPath: '/Users/me/Library.xml',
          selection: { mode: 'playlists', persistentIds: ['BAL'] },
          decisions: { BAL: 'both' }
        }
      ]
    ])
    expect(await screen.findByText(/imported as a copy: 1/)).toBeInTheDocument()
  })

  test('whole library with no conflicts goes straight to importing', async () => {
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickAppleLibrary': '/Users/me/Library.xml',
      'import:previewApple': preview,
      'import:checkPlaylistConflicts': [],
      'import:start': summary()
    })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Import from Apple Music…' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))

    expect(fake.callsTo('import:checkPlaylistConflicts')).toEqual([[['BAL', 'CPL']]])
    await waitFor(() =>
      expect(fake.callsTo('import:start')).toEqual([
        [
          {
            kind: 'apple',
            xmlPath: '/Users/me/Library.xml',
            selection: { mode: 'all' },
            decisions: {}
          }
        ]
      ])
    )
  })

  test('explains when the file is not an Apple Music library', async () => {
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickAppleLibrary': '/Users/me/notes.xml',
      'import:previewApple': () => {
        throw new Error(
          "Error invoking remote method 'import:previewApple': Error: This file is not an Apple Music library export (Library.xml)."
        )
      }
    })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Import from Apple Music…' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file is not an Apple Music library export (Library.xml).'
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent('invoking remote method')
  })
})
