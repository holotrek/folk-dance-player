import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { LibraryRow, SongDetail } from '@shared/library'
import { DEFAULT_SETTINGS } from '@shared/settings'
import Sidebar from '@renderer/components/Sidebar'
import MusicPage from '@renderer/pages/MusicPage'
import ProgramPage from '@renderer/pages/ProgramPage'
import SettingsPage from '@renderer/pages/SettingsPage'
import DanceChoiceDialog from '@renderer/program/DanceChoiceDialog'
import PlayerBar from '@renderer/program/PlayerBar'
import { ADVANCED_STEPS } from '@renderer/tour/advanced-steps'
import { BASIC_STEPS } from '@renderer/tour/basic-steps'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { item, playerState, track } from '../program/fixtures'
import { APPLE_SYNC_OFF } from '@shared/apple-sync'

// Every element a tour step lights up must exist on the real screen, under the id the step names
// (tour spec §4.3). Each test renders part of the app and records the ids it finds.
const found = new Set<string>()
const record = (): void =>
  document.querySelectorAll('[data-tour]').forEach((el) => found.add(el.getAttribute('data-tour')!))

const TITLES = [
  'Hava Nagila',
  'Misirlou',
  'Makedonsko Devojče',
  'Pusti Me Mamo',
  'Hora Mare',
  'Ali Pasa',
  'Zemer Atik'
]
const row = (i: number, title: string): LibraryRow =>
  ({
    fileId: 100 + i,
    songId: i,
    title,
    artist: 'The Practice Band',
    path: `/m/${i}.wav`,
    durationMs: 23_000,
    isMissing: false,
    isFavorite: false,
    danceId: i,
    danceName: title,
    country: 'Greece',
    choreographer: null,
    teacher: null,
    danceType: null,
    difficulty: null,
    danceCount: 1,
    hasNotesPdf: false,
    label: title,
    playlistItemId: null,
    playlistNumber: null
  }) as LibraryRow
const ROWS = TITLES.map((t, i) => row(i + 1, t))

const detail = (): SongDetail =>
  ({
    songId: 2,
    fileId: 102,
    title: 'Misirlou',
    artist: 'The Practice Band',
    path: '/m/2.wav',
    durationMs: 23_000,
    isMissing: false,
    isFavorite: false,
    dances: [11, 12].map((n) => ({
      danceId: n,
      pairingId: n + 10,
      name: `Dance ${n}`,
      country: 'Greece',
      choreographer: null,
      danceType: null,
      difficulty: null,
      notes: null,
      teacher: null,
      songCount: 1,
      isDefault: n === 11,
      sameAsSong: false,
      notesPdf: null,
      slideImage: null,
      slideShows: null,
      label: `Dance ${n}`,
      slide: null
    })),
    suggestions: []
  }) as unknown as SongDetail

describe('the tour’s targets exist on the screen', () => {
  test('the Music page, its song rows and the song editor', async () => {
    const fake = createFakeApi({
      'library:list': ROWS,
      'library:stats': { fileCount: ROWS.length },
      'library:song': detail(),
      'library:suggestions': { people: [], countries: [], danceTypes: [] },
      'playlists:list': [],
      'settings:getAll': DEFAULT_SETTINGS
    })
    renderWithLibrary(<MusicPage />, fake.api)
    fireEvent.click((await screen.findByText('Misirlou')).closest('[role=row]')!)
    await screen.findByRole('group', { name: 'Dance 11' })
    record()
    for (const id of [
      'music.add',
      'song:Misirlou',
      'star:Misirlou',
      'editor.dances',
      'editor.dance-card',
      'editor.artist',
      'editor.teacher',
      'editor.dance-type',
      'editor.country',
      'editor.pdf',
      'editor.slide'
    ]) {
      expect(found, id).toContain(id)
    }
  })

  test('the Program page: search, panels, holding, remove, and the player bar', async () => {
    const hora = track(104, 'Hora Mare')
    const fake = createFakeApi({
      'player:getState': playerState({ programId: 5 }),
      'library:list': ROWS,
      'library:stats': { fileCount: ROWS.length },
      'library:holding': [{ id: 1, ...track(106, 'Ali Pasa') }],
      'programs:get': { id: 5, name: 'Set', items: [item(1, hora)] },
      'programs:played': [],
      'programs:list': [],
      'playlists:list': [],
      'projector:status': { enabled: false, open: false, mode: null, display: null, notice: null },
      'settings:getAll': DEFAULT_SETTINGS
    })
    renderWithLibrary(
      <>
        <PlayerBar />
        <ProgramPage />
      </>,
      fake.api
    )
    await screen.findByText('Ali Pasa')
    await screen.findByRole('button', { name: /Remove Hora Mare/ })
    record()
    for (const id of [
      'library.search',
      'program.panel',
      'holding.panel',
      'holding.row:Ali Pasa',
      'program.remove:Hora Mare',
      'song:Hora Mare',
      'song:Ali Pasa',
      'star:Zemer Atik',
      'player.play',
      'player.speed',
      'player.volume',
      'player.wait',
      'player.autoshow',
      'player.projector'
    ]) {
      expect(found, id).toContain(id)
    }
  })

  test('the “Which dance?” dialog', async () => {
    const fake = createFakeApi({})
    renderWithLibrary(
      <DanceChoiceDialog
        choices={[
          {
            item: { id: 1, title: 'Misirlou', danceId: 1 },
            dances: [
              { danceId: 1, label: 'Misirlou' },
              { danceId: 2, label: 'Misirlou Mixer' }
            ] as never
          }
        ]}
        onDone={() => undefined}
        onClose={() => undefined}
      />,
      fake.api
    )
    await screen.findByText('Which dance?')
    record()
    expect(found).toContain('program.dance-dialog')
  })

  test('the sidebar: programs, playlists and the folder from Music', async () => {
    const fake = createFakeApi({
      'player:getState': playerState({ programId: null }),
      'library:list': [],
      'library:stats': { fileCount: 0 },
      'programs:list': [
        {
          id: 1,
          name: 'Friday warm-up',
          updatedAt: '',
          unplayedCount: 3,
          unplayedDurationMs: 600_000,
          unplayedGaps: 2
        }
      ],
      'playlists:list': [
        {
          id: 10,
          name: 'Balkan night',
          source: 'apple_xml',
          itemCount: 4,
          mirror: true,
          folderId: 1
        },
        {
          id: 11,
          name: 'Easy circle dances',
          source: 'local',
          itemCount: 3,
          mirror: false,
          folderId: null
        }
      ],
      'playlists:folders': [
        { id: 1, name: 'Festival 2026', parentId: null, persistentId: 'C000000000000001' }
      ],
      'appleSync:status': APPLE_SYNC_OFF,
      'settings:getAll': DEFAULT_SETTINGS
    })
    renderWithLibrary(<Sidebar />, fake.api)
    await screen.findByText('Friday warm-up')
    await screen.findByText('Easy circle dances')
    // The synced playlist is inside a collapsed folder, whose content renders once it is opened:
    // the tour has a step for opening it before the step that points at the playlist.
    fireEvent.click(await screen.findByText('Festival 2026'))
    await screen.findByRole('button', { name: 'Options for Balkan night' })
    record()
    for (const id of [
      'sidebar.programs.add',
      'sidebar.programs',
      'sidebar.program:Friday warm-up',
      'sidebar.playlists',
      'sidebar.folder:Festival 2026',
      'sidebar.playlist-options:Balkan night'
    ]) {
      expect(found, id).toContain(id)
    }
  })

  test('the Settings page', async () => {
    const fake = createFakeApi({
      'settings:getAll': DEFAULT_SETTINGS,
      'remote:status': { trusted: true, keys: [] },
      'appleSync:status': APPLE_SYNC_OFF,
      'projector:displays': [],
      'app:getInfo': { version: '0.3.0', dbPath: '/x', schemaVersion: 7 }
    })
    renderWithLibrary(<SettingsPage api={fake.api} />, fake.api)
    await screen.findByText('Appearance')
    record()
    expect(found).toContain('settings.page')
  })

  test('every target a Basic or Advanced step names was found', () => {
    const named = [...BASIC_STEPS, ...ADVANCED_STEPS].flatMap((s) =>
      s.target === undefined ? [] : Array.isArray(s.target) ? s.target : [s.target]
    )
    const missing = [...new Set(named)].filter((id) => !found.has(id))
    expect(missing).toEqual([])
  })
})
