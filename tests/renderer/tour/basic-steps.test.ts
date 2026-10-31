import { afterEach, describe, expect, test, vi } from 'vitest'
import type { SongDetail } from '@shared/library'
import type { LibraryRow } from '@shared/library'
import { IDLE_PLAYER_STATE, type ProgramDetail } from '@shared/program'
import { tourAudio } from '@renderer/tour/audio-hold'
import { createLibraryStore } from '@renderer/library/library-store'
import { createProgramStore } from '@renderer/program/program-store'
import { BASIC_STEPS } from '@renderer/tour/basic-steps'
import type { StepContext, TourStep } from '@renderer/tour/steps'
import { createFakeApi } from '../fake-api'
import { item, track } from '../program/fixtures'

const step = (id: string): TourStep => BASIC_STEPS.find((s) => s.id === id)!
const row = (songId: number, title: string, extra: Partial<LibraryRow> = {}): LibraryRow =>
  ({ fileId: songId + 100, songId, title, isFavorite: false, ...extra }) as LibraryRow

// The stores over a fake API, so a condition reads real state; `holding` is what the API answers.
function context(options: { holding?: string[]; detail?: Partial<SongDetail> } = {}) {
  const fake = createFakeApi({
    'library:holding': () =>
      (options.holding ?? []).map((title, i) => ({ id: i + 1, ...track(i, title) })),
    'library:song': { dances: [], ...options.detail } as SongDetail
  })
  const library = createLibraryStore(fake.api)
  const program = createProgramStore(fake.api)
  const ctx: StepContext = { api: fake.api, library, program, page: 'music', memo: {} }
  const select = (...titles: string[]) => {
    const rows = [row(1, 'Hava Nagila'), row(2, 'Legnala Dana'), row(3, 'Makedonsko Devojče')]
    library.setState({
      rows,
      selected: rows.filter((r) => titles.includes(r.title)).map((r) => r.songId)
    })
  }
  const inProgram = (...titles: string[]) =>
    program.setState({
      program: {
        id: 1,
        name: 'Set',
        items: titles.map((t, i) => item(i + 1, track(100 + i, t)))
      } as ProgramDetail
    })
  return { ctx, library, program, select, inProgram }
}

const isDone = async (id: string, ctx: StepContext): Promise<boolean> =>
  (await step(id).done!(ctx)) === true

afterEach(() => document.body.querySelectorAll('[data-tour]').forEach((e) => e.remove()))

describe('the Basic tour’s steps', () => {
  test('are in order, with unique ids, pages and kinds', () => {
    const ids = BASIC_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toBe('basic.import')
    expect(ids.at(-1)).toBe('basic.end')
    expect(BASIC_STEPS.every((s) => s.part === 'basic')).toBe(true)
    // The Music page's steps come first (through the slide), then the Program page's; the choice
    // can be on either.
    const lastMusic = ids.indexOf('basic.canva')
    expect(BASIC_STEPS.slice(0, lastMusic + 1).every((s) => s.page === 'music')).toBe(true)
    expect(BASIC_STEPS.slice(lastMusic + 1, -1).every((s) => s.page === 'program')).toBe(true)
  })

  test('every do step has a condition, every lit step a target, and the last is the choice', () => {
    for (const s of BASIC_STEPS) {
      if (s.kind === 'do') expect(s.done, s.id).toBeTypeOf('function')
      if (s.kind === 'do' || s.kind === 'explain') expect(s.target, s.id).toBeDefined()
    }
    const last = BASIC_STEPS.at(-1)!
    expect(last.kind).toBe('choice')
    expect(last.choices?.map((c) => c.id)).toEqual(['learn-more', 'start-now'])
  })

  test('the wording is plain: no step mentions a table, an id, or a channel', () => {
    for (const s of BASIC_STEPS)
      expect(`${s.title} ${s.body}`, s.id).not.toMatch(/\b(sql|database|ipc|channel|schema)\b/i)
  })
})

describe('the Basic tour’s conditions read the real result', () => {
  test('a song is selected, then Legnala Dana, then Makedonsko Devojče, then Legnala Dana again', async () => {
    const { ctx, select } = context()
    for (const [id, title] of [
      ['basic.select', 'Hava Nagila'],
      ['basic.two-dances-pick', 'Legnala Dana'],
      ['basic.shared-pick', 'Makedonsko Devojče'],
      ['basic.shared-other', 'Legnala Dana']
    ]) {
      select()
      expect(await isDone(id, ctx), `${id} before`).toBe(false)
      select(title)
      expect(await isDone(id, ctx), `${id} after`).toBe(true)
    }
    select('Hava Nagila')
    expect(await isDone('basic.two-dances-pick', ctx)).toBe(false) // another song is not Legnala Dana
  })

  test('the shared dance has a dance type once the person saves one', async () => {
    const lesnoto = (danceType: string | null) =>
      ({ dances: [{ name: 'Lesnoto', danceType }] }) as unknown as Partial<SongDetail>
    const before = context({ detail: lesnoto(null) })
    before.select('Makedonsko Devojče')
    expect(await isDone('basic.shared-edit', before.ctx)).toBe(false)
    const after = context({ detail: lesnoto('Open Circle') })
    after.select('Makedonsko Devojče')
    expect(await isDone('basic.shared-edit', after.ctx)).toBe(true)
  })

  test('the search step waits for the whole word, not its first letter', async () => {
    const { ctx, library } = context()
    for (const typed of ['', 'h', 'ho', 'hor']) {
      library.setState({ search: typed })
      expect(await isDone('basic.search', ctx), `"${typed}"`).toBe(false)
    }
    library.setState({ search: 'hora' })
    expect(await isDone('basic.search', ctx)).toBe(true)
    library.setState({ search: ' Hora ' })
    expect(await isDone('basic.search', ctx)).toBe(true) // spaces and capitals do not matter
  })

  test('a search is typed, then cleared', async () => {
    const { ctx, library } = context()
    library.setState({ search: '' })
    expect(await isDone('basic.search', ctx)).toBe(false)
    expect(await isDone('basic.search-clear', ctx)).toBe(true)
    library.setState({ search: 'hora' })
    expect(await isDone('basic.search', ctx)).toBe(true)
    expect(await isDone('basic.search-clear', ctx)).toBe(false)
  })

  test('a song is added, the dance dialog opens and is answered', async () => {
    const { ctx, inProgram } = context()
    inProgram()
    expect(await isDone('basic.add', ctx)).toBe(false)
    inProgram('Hava Nagila')
    expect(await isDone('basic.add', ctx)).toBe(true)

    expect(await isDone('basic.pick-dance', ctx)).toBe(false)
    inProgram('Hava Nagila', 'Legnala Dana')
    expect(await isDone('basic.pick-dance', ctx)).toBe(false) // added, but no dialog yet
    const dialog = document.createElement('div')
    dialog.dataset.tour = 'program.dance-dialog'
    document.body.appendChild(dialog)
    expect(await isDone('basic.pick-dance', ctx)).toBe(true)
    expect(await isDone('basic.pick-dance-answer', ctx)).toBe(false)
    dialog.remove()
    expect(await isDone('basic.pick-dance-answer', ctx)).toBe(true)
  })

  test('a song is removed', async () => {
    const { ctx, inProgram } = context()
    inProgram('Hava Nagila', 'Legnala Dana')
    expect(await isDone('basic.remove', ctx)).toBe(false)
    inProgram('Hava Nagila')
    expect(await isDone('basic.remove', ctx)).toBe(true)
  })

  test('a song goes into Holding, then back to the program', async () => {
    const empty = context({ holding: [] })
    expect(await isDone('basic.hold', empty.ctx)).toBe(false)
    const held = context({ holding: ['Korobushka'] })
    expect(await isDone('basic.hold', held.ctx)).toBe(true)
    held.inProgram('Hava Nagila')
    expect(await isDone('basic.hold-back', held.ctx)).toBe(false) // still held, not in the program
    const back = context({ holding: [] })
    back.inProgram('Hava Nagila', 'Korobushka')
    expect(await isDone('basic.hold-back', back.ctx)).toBe(true)
    const copy = context({ holding: ['Korobushka'] })
    copy.inProgram('Korobushka')
    expect(await isDone('basic.hold-back', copy.ctx)).toBe(false) // in both: not a move
  })

  test('the import walk-through follows the real dialog', async () => {
    const { ctx } = context()
    const dialog = (target: string): HTMLElement => {
      const el = document.createElement('div')
      el.dataset.tour = target
      document.body.appendChild(el)
      return el
    }
    expect(await isDone('basic.import-open', ctx)).toBe(false)
    const mapping = dialog('import.mapping')
    expect(await isDone('basic.import-open', ctx)).toBe(true)
    expect(await isDone('basic.import-run', ctx)).toBe(false)
    mapping.remove()
    const summary = dialog('import.summary')
    expect(await isDone('basic.import-run', ctx)).toBe(true)
    expect(await isDone('basic.import-done', ctx)).toBe(false)
    summary.remove()
    expect(await isDone('basic.import-done', ctx)).toBe(true)
  })

  test('the import step explains the “Populate … from” choices', () => {
    const body = step('basic.import-tags').body
    expect(body).toContain('Populate Artist from')
    expect(body).toMatch(/Album Artist/)
  })

  test('the wording about dances is not pedantic', () => {
    const text = BASIC_STEPS.map((s) => `${s.title} ${s.body}`).join('\n')
    expect(text).not.toMatch(/a song is not a dance/i)
    expect(text).toContain('You can assign more than one dance to a song, when it makes sense to')
    expect(text).not.toMatch(/Misirlou|Pusti Me Mamo|Ali Pasa/)
  })

  test('a song becomes a favorite', async () => {
    const { ctx, library } = context()
    library.setState({ rows: [row(5, 'Zemer Atik')] })
    expect(await isDone('basic.favorite', ctx)).toBe(false)
    library.setState({ rows: [row(5, 'Zemer Atik', { isFavorite: true })] })
    expect(await isDone('basic.favorite', ctx)).toBe(true)
  })

  test('playing starts, the speed and the volume change', async () => {
    const { ctx, program } = context()
    program.setState({ player: { ...IDLE_PLAYER_STATE } })
    for (const id of ['basic.play', 'basic.speed', 'basic.volume'])
      expect(await isDone(id, ctx)).toBe(false)
    program.setState({ player: { ...IDLE_PLAYER_STATE, status: 'countdown' } })
    expect(await isDone('basic.play', ctx)).toBe(true)
    program.setState({ player: { ...IDLE_PLAYER_STATE, status: 'playing' } })
    expect(await isDone('basic.play', ctx)).toBe(true)
    program.setState({ player: { ...IDLE_PLAYER_STATE, speed: 0.8 } })
    expect(await isDone('basic.speed', ctx)).toBe(true)
    program.setState({ player: { ...IDLE_PLAYER_STATE, volume: 0.5 } })
    expect(await isDone('basic.volume', ctx)).toBe(true)
  })

  test('the first song repeats from Play until the wait step, which jumps to its end and waits for Korobushka', async () => {
    tourAudio.reset()
    const { ctx, program } = context()
    const jumped = vi.fn()
    const stop = tourAudio.onJump(jumped)
    step('basic.play').begin!(ctx)
    expect(tourAudio.loop()).toBe(true)
    step('basic.wait').begin!(ctx)
    expect(tourAudio.loop()).toBe(false)
    expect(jumped).toHaveBeenCalledTimes(1)
    stop()

    const playingNow = (title: string) =>
      ({
        ...IDLE_PLAYER_STATE,
        status: 'playing',
        current: { track: { title } }
      }) as unknown as typeof IDLE_PLAYER_STATE
    program.setState({ player: playingNow('Hava Nagila') })
    expect(await isDone('basic.wait', ctx)).toBe(false)
    program.setState({ player: playingNow('Korobushka') })
    expect(await isDone('basic.wait', ctx)).toBe(true)
  })
})
