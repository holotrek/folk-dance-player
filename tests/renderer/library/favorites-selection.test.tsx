import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import type { LibraryRow } from '@shared/library'
import LibraryTable from '@renderer/library/LibraryTable'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from './render-library'

const row = (songId: number, isFavorite = false): LibraryRow => ({
  fileId: songId + 100,
  songId,
  title: `Song ${songId}`,
  artist: null,
  path: `/m/${songId}.mp3`,
  durationMs: null,
  isMissing: false,
  isFavorite,
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

async function setup() {
  const fake = createFakeApi({
    'library:list': [
      { ...row(1), danceId: 11, hasNotesPdf: true },
      { ...row(2, true), danceId: 12, hasNotesPdf: true },
      row(3)
    ],
    'library:openNotesPdf': undefined,
    'playlists:list': [],
    'library:setFavorite': undefined
  })
  renderWithLibrary(<LibraryTable />, fake.api)
  const rowOf = async (n: number) =>
    (await screen.findByText(`Song ${n}`)).closest('[role=row]') as HTMLElement
  return { fake, rowOf }
}

test('the star of a selected song applies to every selected song; an unselected one acts alone', async () => {
  const { fake, rowOf } = await setup()
  fireEvent.click(await rowOf(1))
  fireEvent.click(await rowOf(2), { metaKey: true })
  await userEvent.click(screen.getByRole('button', { name: 'Add Song 1 to favorites' }))
  await userEvent.click(screen.getByRole('button', { name: 'Remove Song 2 from favorites' }))
  await userEvent.click(screen.getByRole('button', { name: 'Add Song 3 to favorites' }))
  expect(fake.callsTo('library:setFavorite')).toEqual([
    [[101, 102], true],
    [[101, 102], false],
    [[103], true]
  ])
})

test('the menu offers both favorites choices for a mixed selection, and applies to all of it', async () => {
  const { fake, rowOf } = await setup()
  fireEvent.click(await rowOf(1))
  fireEvent.click(await rowOf(2), { metaKey: true })
  await userEvent.click(screen.getByRole('button', { name: 'Options for Song 1' }))
  const menu = await screen.findByRole('menu', { name: 'Options for Song 1' })
  expect(within(menu).getByRole('menuitem', { name: 'Add to favorites' })).toBeInTheDocument()
  await userEvent.click(within(menu).getByRole('menuitem', { name: 'Remove from favorites' }))
  expect(fake.callsTo('library:setFavorite')).toEqual([[[101, 102], false]])
})

test('Edit details is left out of the menu while several songs are selected', async () => {
  const { rowOf } = await setup()
  fireEvent.click(await rowOf(1))
  await userEvent.click(screen.getByRole('button', { name: 'Options for Song 1' }))
  const single = await screen.findByRole('menu', { name: 'Options for Song 1' })
  expect(within(single).getByRole('menuitem', { name: 'Edit details' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  fireEvent.click(await rowOf(2), { metaKey: true })
  await userEvent.click(screen.getByRole('button', { name: 'Options for Song 1' }))
  const menu = await screen.findByRole('menu', { name: 'Options for Song 1' })
  expect(within(menu).queryByRole('menuitem', { name: 'Edit details' })).toBeNull()
})

test('with several songs selected, Open PDF opens every PDF among them', async () => {
  const { fake, rowOf } = await setup()
  fireEvent.click(await rowOf(1))
  fireEvent.click(await rowOf(2), { metaKey: true })
  fireEvent.click(await rowOf(3), { metaKey: true })
  await userEvent.click(screen.getByRole('button', { name: 'Options for Song 3' }))
  const menu = await screen.findByRole('menu', { name: 'Options for Song 3' })
  await userEvent.click(within(menu).getByRole('menuitem', { name: 'Open PDF' }))
  expect(fake.callsTo('library:openNotesPdf')).toEqual([[11], [12]])
})
