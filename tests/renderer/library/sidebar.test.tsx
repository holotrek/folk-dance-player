import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { LibraryQuery, PlaylistSummary } from '@shared/library'
import Sidebar from '@renderer/components/Sidebar'
import { FILES_MIME } from '@renderer/library/drag'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from './render-library'

const playlists: PlaylistSummary[] = [
  { id: 1, name: 'Balkan', source: 'apple_xml', itemCount: 12 },
  { id: 2, name: 'Couple dances', source: 'local', itemCount: 3 }
]

function setup(extra = {}) {
  const fake = createFakeApi({
    'library:list': [],
    'playlists:list': playlists,
    'playlists:create': 3,
    'playlists:rename': undefined,
    'playlists:duplicate': 4,
    'playlists:delete': undefined,
    'playlists:add': undefined,
    'library:setFavorite': undefined,
    ...extra
  })
  renderWithLibrary(<Sidebar />, fake.api)
  return fake
}

const lastQuery = (fake: ReturnType<typeof createFakeApi>): LibraryQuery =>
  fake.callsTo('library:list').at(-1)![0] as LibraryQuery

const dropFiles = (target: HTMLElement, fileIds: number[]) =>
  fireEvent.drop(target, {
    dataTransfer: {
      types: [FILES_MIME],
      getData: (type: string) => (type === FILES_MIME ? JSON.stringify(fileIds) : '')
    }
  })

describe('Sidebar', () => {
  test('lists playlists, marking ones imported from Apple Music', async () => {
    setup()
    expect(await screen.findByText('Balkan')).toBeInTheDocument()
    expect(screen.getByText('Couple dances')).toBeInTheDocument()
    expect(screen.getByLabelText('From Apple Music')).toBeInTheDocument()
  })

  test('playlists sit in their own group, which scrolls when the list is long', async () => {
    setup()
    const group = await screen.findByRole('group', { name: 'Playlists' })
    expect(await within(group).findByText('Balkan')).toBeInTheDocument()
    expect(within(group).getByText('Couple dances')).toBeInTheDocument()
    expect(within(group).queryByText('Programs')).toBeNull()
  })

  test('choosing an entry filters the library and marks it as current', async () => {
    const fake = setup()
    await userEvent.click(await screen.findByText('★ Favorites'))
    await waitFor(() => expect(lastQuery(fake).filter).toEqual({ kind: 'favorites' }))
    await userEvent.click(screen.getByText('Couple dances'))
    await waitFor(() => expect(lastQuery(fake).filter).toEqual({ kind: 'playlist', playlistId: 2 }))
    expect(screen.getByText('Couple dances').closest('[aria-current]')).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  test('creates a playlist after asking for its name', async () => {
    const fake = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'New playlist' }))
    const dialog = await screen.findByRole('dialog', { name: 'New playlist' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Beginner night')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(fake.callsTo('playlists:create')).toEqual([['Beginner night']])
  })

  test('right-click offers rename, duplicate and delete', async () => {
    const fake = setup()
    fireEvent.contextMenu(await screen.findByText('Couple dances'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename playlist' })
    const input = within(dialog).getByLabelText('Name')
    expect(input).toHaveValue('Couple dances')
    await userEvent.clear(input)
    await userEvent.type(input, 'Couples')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(fake.callsTo('playlists:rename')).toEqual([[2, 'Couples']])
    // Wait for the dialog's closing transition before using the page again.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.contextMenu(screen.getByText('Couple dances'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))
    expect(fake.callsTo('playlists:duplicate')).toEqual([[2]])

    fireEvent.contextMenu(screen.getByText('Couple dances'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete…' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete playlist?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    expect(fake.callsTo('playlists:delete')).toEqual([[2]])
  })

  test('songs dropped on a playlist are added to it; dropped on Favorites, they become favorites', async () => {
    const fake = setup()
    dropFiles(await screen.findByText('Couple dances'), [101, 102])
    dropFiles(screen.getByText('★ Favorites'), [101])
    await waitFor(() => expect(fake.callsTo('playlists:add')).toEqual([[2, [101, 102]]]))
    expect(fake.callsTo('library:setFavorite')).toEqual([[[101], true]])
  })
})
