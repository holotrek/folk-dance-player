import { afterEach, describe, expect, test, vi } from 'vitest'
import { IDLE_PLAYER_STATE, type ProgramDetail } from '@shared/program'
import { defaultProgramName } from '@renderer/program/program-name'
import { createProgramStore, type ProgramStore } from '@renderer/program/program-store'
import { createFakeApi } from '../fake-api'

const detail: ProgramDetail = { id: 5, name: 'Set', items: [{ id: 1, kind: 'stop' }] }
const summaries = [{ id: 5, name: 'Set', updatedAt: '2026-10-14T00:00:00Z', unplayedCount: 0 }]

let store: ProgramStore
let stop: () => void = () => undefined
afterEach(() => {
  stop()
  vi.useRealTimers()
})

function setup(programId: number | null = 5) {
  const fake = createFakeApi({
    'player:getState': { ...IDLE_PLAYER_STATE, programId },
    'programs:list': summaries,
    'programs:get': detail,
    'programs:played': [],
    'programs:create': 9,
    'programs:setCurrent': undefined
  })
  store = createProgramStore(fake.api)
  return fake
}

describe('program store', () => {
  test('takes the player state, then loads the program list and the current program', async () => {
    const fake = setup()
    stop = store.getState().watch()
    await vi.waitFor(() => expect(store.getState().program).toEqual(detail))
    expect(store.getState().programs).toEqual(summaries)
    expect(fake.callsTo('programs:played')).toEqual([[5]])
  })

  test('refetches when programs or the library change, and when another program is loaded', async () => {
    const fake = setup(null)
    stop = store.getState().watch()
    await vi.waitFor(() => expect(fake.callsTo('programs:list')).toHaveLength(1))
    expect(store.getState().program).toBeNull()
    fake.emit('programs:changed', null)
    fake.emit('library:changed', null)
    await vi.waitFor(() => expect(fake.callsTo('programs:list')).toHaveLength(3))
    fake.emit('player:state', { ...IDLE_PLAYER_STATE, programId: 5 })
    await vi.waitFor(() => expect(store.getState().program).toEqual(detail))
    expect(store.getState().player.programId).toBe(5)
  })

  test('a player state broadcast before the first answer arrives is kept', async () => {
    let answer: (state: typeof IDLE_PLAYER_STATE) => void = () => undefined
    const fake = createFakeApi({
      'player:getState': () => new Promise((resolve) => (answer = resolve)),
      'programs:list': summaries,
      'programs:get': detail,
      'programs:played': []
    })
    store = createProgramStore(fake.api)
    stop = store.getState().watch()
    fake.emit('player:state', { ...IDLE_PLAYER_STATE, programId: 5, status: 'paused' })
    answer(IDLE_PLAYER_STATE) // an older state, answered late
    await vi.waitFor(() => expect(store.getState().program).toEqual(detail))
    expect(store.getState().player).toMatchObject({ programId: 5, status: 'paused' })
  })

  test('searches the program list by name', async () => {
    const fake = setup()
    await store.getState().setSearch('oct')
    expect(fake.callsTo('programs:list').at(-1)).toEqual(['oct'])
  })

  test('with no program loaded, ensureProgram creates one named for today and loads it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12))
    const fake = setup(null)
    expect(await store.getState().ensureProgram()).toBe(9)
    expect(fake.callsTo('programs:create')).toEqual([['Wed Oct 14']])
    expect(fake.callsTo('programs:setCurrent')).toEqual([[9]])
    expect(await store.getState().ensureProgram()).toBe(9)
    expect(fake.callsTo('programs:create')).toHaveLength(1)
  })

  test('a program’s default name is its date', () => {
    expect(defaultProgramName(new Date(2026, 9, 13))).toBe('Tue Oct 13')
  })
})
