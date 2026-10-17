import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { PlaylistFolder } from '@shared/apple-sync'
import type { LibraryRow, PlaylistSummary } from '@shared/library'
import { DEFAULT_SETTINGS } from '@shared/settings'
import Sidebar from '@renderer/components/Sidebar'
import { FILES_MIME } from '@renderer/library/drag'
import { createLibraryStore } from '@renderer/library/library-store'
import MusicPage from '@renderer/pages/MusicPage'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from './render-library'

// Music's folders and read-only mirrors (sync spec §6.2, §6.3).
const folders: PlaylistFolder[] = [
  { id: 1, name: 'IFD2026', parentId: null, persistentId: 'FFFFFFFFFFFFFFF1' },
  { id: 2, name: 'Week 3', parentId: 1, persistentId: 'FFFFFFFFFFFFFFF2' }
]
const playlists: PlaylistSummary[] = [
  { id: 10, name: 'Monday', source: 'apple_xml', itemCount: 5, mirror: true, folderId: 2 },
  { id: 11, name: 'Loose', source: 'apple_xml', itemCount: 2, mirror: true, folderId: null },
  { id: 12, name: 'Mine', source: 'local', itemCount: 1, mirror: false, folderId: null }
]
const handlers = {
  'playlists:folders': folders,
  'playlists:list': playlists,
  'playlists:duplicate': 13,
  'playlists:add': undefined
}

function renderSidebar(extra: Record<string, unknown> = {}) {
  const fake = createFakeApi({ ...handlers, ...extra })
  renderWithLibrary(<Sidebar />, fake.api)
  return { fake, user: userEvent.setup() }
}

const dropFiles = (target: HTMLElement, fileIds: number[]) =>
  fireEvent.drop(target, {
    dataTransfer: {
      types: [FILES_MIME],
      getData: (type: string) => (type === FILES_MIME ? JSON.stringify(fileIds) : '')
    }
  })

describe('the library store', () => {
  test('refresh loads Music folders with the playlists', async () => {
    const fake = createFakeApi({ 'playlists:folders': folders })
    const store = createLibraryStore(fake.api)
    await store.getState().refresh()
    expect(store.getState().folders).toEqual(folders)
  })
})

describe('Music folders and mirrors in the sidebar', () => {
  test('folders collapse, open state is saved, and mirrors come before local playlists', async () => {
    const { fake, user } = renderSidebar()
    const group = await screen.findByRole('group', { name: 'Playlists' })
    await within(group).findByText('IFD2026')
    // A collapsed Mantine NavLink keeps its children in a hidden <Activity>: React renders them
    // (display: none) when it gets to it, which is sooner on a busy runner. Check visibility.
    within(group)
      .queryAllByText('Monday')
      .forEach((monday) => expect(monday).not.toBeVisible())
    const loose = within(group).getByText('Loose')
    const mine = within(group).getByText('Mine')
    expect(loose.compareDocumentPosition(mine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(within(group).getByText('IFD2026'))
    await user.click(await within(group).findByText('Week 3'))
    await waitFor(() => expect(within(group).getByText('Monday')).toBeVisible(), { timeout: 5000 })
    await waitFor(() =>
      expect(fake.settings['playlistFolders.open']).toEqual([
        'FFFFFFFFFFFFFFF1',
        'FFFFFFFFFFFFFFF2'
      ])
    )
  })

  test('a folder remembered open starts open', async () => {
    renderSidebar({
      'settings:getAll': {
        ...DEFAULT_SETTINGS,
        'playlistFolders.open': ['FFFFFFFFFFFFFFF1', 'FFFFFFFFFFFFFFF2']
      }
    })
    expect(await screen.findByText('Monday')).toBeInTheDocument()
  })

  test('a mirror has an Apple Music mark and only "Duplicate as my playlist"', async () => {
    const { fake, user } = renderSidebar()
    await screen.findByText('Loose')
    expect(screen.getAllByLabelText('Apple Music playlist').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Options for Loose' }))
    expect(screen.queryByRole('menuitem', { name: 'Rename…' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate as my playlist' }))
    expect(fake.callsTo('playlists:duplicate')).toEqual([[11]])
  })

  test('dropping songs on a mirror says to edit it in Music', async () => {
    const { fake } = renderSidebar()
    dropFiles(await screen.findByText('Loose'), [1, 2])
    expect(await screen.findByText('Edit this playlist in Music.')).toBeInTheDocument()
    expect(fake.callsTo('playlists:add')).toEqual([])
  })
})

describe('a mirror on the Music page', () => {
  test('has no Remove from playlist', async () => {
    const row: LibraryRow = {
      fileId: 101,
      songId: 1,
      title: 'Kolo',
      artist: null,
      path: '/m/Kolo.mp3',
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
      label: 'Kolo',
      playlistItemId: 5,
      playlistNumber: 1
    }
    const fake = createFakeApi({
      ...handlers,
      'library:list': [row],
      'library:stats': { fileCount: 1 },
      'library:song': null
    })
    renderWithLibrary(
      <>
        <Sidebar />
        <MusicPage />
      </>,
      fake.api
    )
    const user = userEvent.setup()
    await user.click(await screen.findByText('Loose'))
    await user.click(await screen.findByText('Kolo'))
    await screen.findByRole('button', { name: 'Re-apply mapping…' })
    expect(screen.queryByRole('button', { name: 'Remove from playlist' })).not.toBeInTheDocument()
  })
})
