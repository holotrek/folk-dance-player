import { describe, expect, test } from 'vitest'
import type { PlaylistSummary } from '@shared/library'
import { IDLE_PLAYER_STATE, type ProgramSummary } from '@shared/program'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { createLibraryStore } from '@renderer/library/library-store'
import { createProgramStore } from '@renderer/program/program-store'
import { ADVANCED_STEPS } from '@renderer/tour/advanced-steps'
import type { StepContext, TourStep } from '@renderer/tour/steps'
import { createFakeApi } from '../fake-api'

const step = (id: string): TourStep => ADVANCED_STEPS.find((s) => s.id === id)!
const summary = (id: number, name: string): ProgramSummary =>
  ({
    id,
    name,
    updatedAt: '',
    unplayedCount: 0,
    unplayedDurationMs: 0,
    unplayedGaps: 0
  }) as ProgramSummary
const playlist = (id: number, name: string, mirror = false): PlaylistSummary =>
  ({
    id,
    name,
    source: mirror ? 'apple_xml' : 'local',
    itemCount: 1,
    mirror,
    folderId: null
  }) as PlaylistSummary

function context(openFolders: string[] = []) {
  const fake = createFakeApi({
    'settings:getAll': { ...DEFAULT_SETTINGS, 'playlistFolders.open': openFolders }
  })
  const library = createLibraryStore(fake.api)
  const program = createProgramStore(fake.api)
  const ctx: StepContext = { api: fake.api, library, program, page: 'program', memo: {} }
  return { ctx, library, program }
}
// The step arrives (its `begin` notes where things stand), then its condition is looked at.
const arrive = (id: string, ctx: StepContext): void => step(id).begin?.(ctx)
const isDone = async (id: string, ctx: StepContext): Promise<boolean> =>
  (await step(id).done!(ctx)) === true

describe('the Advanced tour’s steps', () => {
  test('begin with the intro and end with the choice, in order', () => {
    const ids = ADVANCED_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toBe('advanced.intro')
    expect(ADVANCED_STEPS[0].kind).toBe('intro')
    expect(ids.at(-1)).toBe('advanced.end')
    expect(ADVANCED_STEPS.at(-1)).toMatchObject({ kind: 'choice', choices: [{ id: 'done' }] })
    expect(ADVANCED_STEPS.every((s) => s.part === 'advanced')).toBe(true)
  })

  test('every do step has a condition, and every lit step a target', () => {
    for (const s of ADVANCED_STEPS) {
      if (s.kind === 'do') expect(s.done, s.id).toBeTypeOf('function')
      if (s.kind === 'do' || s.kind === 'explain') expect(s.target, s.id).toBeDefined()
    }
  })

  test('the projector steps and the auto-program step explain, and ask nothing of the person', () => {
    for (const id of ['advanced.projector', 'advanced.one-screen', 'advanced.auto-programs']) {
      expect(step(id).kind, id).toBe('explain')
    }
  })

  test('the one-screen step says how to turn the overlay off', () => {
    const body = step('advanced.one-screen').body
    expect(body).toContain('Uncheck to disable showing the overlay')
    expect(body).not.toMatch(/untick/i)
  })

  test('the sidebar steps stay on whatever page the person is on, instead of switching to Music', () => {
    for (const id of [
      'advanced.playlists',
      'advanced.open-folder',
      'advanced.mirror',
      'advanced.load'
    ]) {
      expect(step(id).page === null || id === 'advanced.load', id).toBe(true)
    }
    expect(step('advanced.load').page).toBe('program')
    expect(step('advanced.playlists').kind).toBe('do')
  })

  test('playlists: done once the person has opened a playlist of their own', async () => {
    const { ctx, library } = context()
    library.setState({
      playlists: [playlist(1, 'Easy circle dances'), playlist(2, 'Balkan night', true)],
      filter: { kind: 'all' }
    })
    expect(await isDone('advanced.playlists', ctx)).toBe(false)
    library.setState({ filter: { kind: 'playlist', playlistId: 2 } })
    expect(await isDone('advanced.playlists', ctx)).toBe(false) // the synced one is the folder step's
    library.setState({ filter: { kind: 'playlist', playlistId: 1 } })
    expect(await isDone('advanced.playlists', ctx)).toBe(true)
  })

  test('Settings is shown a control at a time, each pointing at its own control', () => {
    const settings = ADVANCED_STEPS.filter((s) => s.page === 'settings')
    expect(settings.map((s) => s.target)).toEqual([
      'settings.appearance',
      'settings.import',
      'settings.remote',
      'settings.about'
    ])
    expect(settings[0].body).toMatch(/light or dark/i)
    expect(settings.every((s) => s.kind === 'explain')).toBe(true)
  })

  test('adding a program: done once there is one more than when the step began', async () => {
    const { ctx, program } = context()
    program.setState({ programs: [summary(1, 'Friday warm-up')] })
    arrive('advanced.add-program', ctx) // one program when the step begins
    expect(await isDone('advanced.add-program', ctx)).toBe(false)
    expect(await isDone('advanced.add-program', ctx)).toBe(false)
    program.setState({ programs: [summary(1, 'Friday warm-up'), summary(2, 'Sat Oct 31')] })
    expect(await isDone('advanced.add-program', ctx)).toBe(true)
  })

  test('adding a program starts from however many there already were', async () => {
    const { ctx, program } = context()
    program.setState({ programs: [summary(1, 'Friday warm-up'), summary(2, 'Sat Oct 31')] })
    arrive('advanced.add-program', ctx) // two programs when the step begins
    expect(await isDone('advanced.add-program', ctx)).toBe(false)
    program.setState({
      programs: [summary(1, 'Friday warm-up'), summary(2, 'Sat Oct 31'), summary(3, 'Mine')]
    })
    expect(await isDone('advanced.add-program', ctx)).toBe(true)
  })

  test('loading another program: done when Friday warm-up is the current one', async () => {
    const { ctx, program } = context()
    program.setState({
      programs: [summary(1, 'Friday warm-up'), summary(2, 'Sat Oct 31')],
      player: { ...IDLE_PLAYER_STATE, programId: 2 }
    })
    expect(await isDone('advanced.load', ctx)).toBe(false)
    program.setState({ player: { ...IDLE_PLAYER_STATE, programId: 1 } })
    expect(await isDone('advanced.load', ctx)).toBe(true)
  })

  test('opening the festival folder: done when the folder is saved as open', async () => {
    const closed = context([])
    expect(await isDone('advanced.open-folder', closed.ctx)).toBe(false)
    const open = context(['D000000000000001'])
    expect(await isDone('advanced.open-folder', open.ctx)).toBe(true)
  })

  test('duplicating the synced playlist: done once there is another playlist of your own', async () => {
    const { ctx, library } = context()
    library.setState({
      playlists: [playlist(1, 'Easy circle dances'), playlist(2, 'Balkan night', true)]
    })
    arrive('advanced.mirror', ctx)
    expect(await isDone('advanced.mirror', ctx)).toBe(false)
    expect(await isDone('advanced.mirror', ctx)).toBe(false)
    library.setState({
      playlists: [
        playlist(1, 'Easy circle dances'),
        playlist(2, 'Balkan night', true),
        playlist(3, 'Balkan night copy')
      ]
    })
    expect(await isDone('advanced.mirror', ctx)).toBe(true)
  })
})
