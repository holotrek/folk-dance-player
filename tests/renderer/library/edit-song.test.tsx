import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { LibraryRow } from '@shared/library'
import { useLibrary } from '@renderer/library/LibraryProvider'
import LibraryTable from '@renderer/library/LibraryTable'
import { EditSongProvider, useEditSong } from '@renderer/navigation'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from './render-library'

const row = (songId: number): LibraryRow => ({
  fileId: songId + 100,
  songId,
  title: `Song ${songId}`,
  artist: null,
  path: `/m/${songId}.mp3`,
  durationMs: null,
  isMissing: false,
  isFavorite: false,
  danceId: null,
  danceName: null,
  country: null,
  choreographer: null,
  teacher: null,
  danceType: null,
  difficulty: null,
  danceCount: 1,
  hasNotesPdf: false,
  label: `Song ${songId}`,
  playlistItemId: null,
  playlistNumber: null
})

function EditButton(): React.JSX.Element {
  const editSong = useEditSong()
  const pending = useLibrary((s) => s.scrollTo)
  return (
    <>
      <button onClick={() => editSong(30)}>Edit song 30</button>
      <output aria-label="Scroll request">{pending ?? 'none'}</output>
    </>
  )
}

test('Edit details shows the Music page with the song selected and scrolled into view', async () => {
  const rows = Array.from({ length: 40 }, (_, i) => row(i + 1))
  const fake = createFakeApi({ 'library:list': rows, 'playlists:list': [] })
  const showMusic = vi.fn()
  // jsdom has no element scrolling (the virtualized table calls scrollTo), nor real heights, so
  // the test checks that the table took the request: it clears it once it has scrolled.
  Element.prototype.scrollTo = vi.fn()
  renderWithLibrary(
    <EditSongProvider onShowMusic={showMusic}>
      <EditButton />
      <LibraryTable />
    </EditSongProvider>,
    fake.api
  )
  await screen.findByText('Song 1')
  await userEvent.click(screen.getByRole('button', { name: 'Edit song 30' }))
  expect(showMusic).toHaveBeenCalledTimes(1)
  await waitFor(() =>
    expect(screen.getByText('Song 30').closest('[role=row]')).toHaveAttribute(
      'aria-selected',
      'true'
    )
  )
  expect(screen.getByRole('status', { name: 'Scroll request' })).toHaveTextContent('none')
  delete (Element.prototype as { scrollTo?: unknown }).scrollTo
})

test('a library row’s menu (⋯ or right-click): Edit details, and favorites', async () => {
  const fake = createFakeApi({
    'library:list': [row(1), { ...row(2), isFavorite: true }],
    'playlists:list': [],
    'library:setFavorite': undefined
  })
  const showMusic = vi.fn()
  renderWithLibrary(<LibraryTable compact />, fake.api, showMusic)
  const rowOf = async (text: string) =>
    (await screen.findByText(text)).closest('[role=row]') as HTMLElement
  await userEvent.pointer({ keys: '[MouseRight]', target: await rowOf('Song 1') })
  const menu = await screen.findByRole('menu', { name: 'Options for Song 1' })
  await userEvent.click(within(menu).getByRole('menuitem', { name: 'Edit details' }))
  expect(showMusic).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(rowOf('Song 1')).resolves.toHaveAttribute('aria-selected', 'true'))
  await userEvent.click(screen.getByRole('button', { name: 'Options for Song 2' }))
  await userEvent.click(
    within(await screen.findByRole('menu', { name: 'Options for Song 2' })).getByRole('menuitem', {
      name: 'Remove from favorites'
    })
  )
  expect(fake.callsTo('library:setFavorite')).toEqual([[[102], false]])
})
