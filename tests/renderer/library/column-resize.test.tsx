import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Settings } from '@shared/settings'
import MusicPage from '@renderer/pages/MusicPage'
import ProgramPage from '@renderer/pages/ProgramPage'
import { createFakeApi } from '../fake-api'
import { playerState } from '../program/fixtures'
import { renderWithLibrary } from './render-library'

// jsdom has no layout: the table is 1000 px wide and every header cell 100 px.
function stubLayout(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const width = this.getAttribute('role') === 'table' ? 1000 : 100
    return { width, height: 32, left: 0, top: 0, right: width, bottom: 32, x: 0, y: 0 } as DOMRect
  })
}

afterEach(() => vi.restoreAllMocks())

function setup(page: 'music' | 'program', settings: Partial<Settings> = {}) {
  stubLayout()
  const fake = createFakeApi({
    'library:list': [],
    'library:holding': [],
    'library:stats': { fileCount: 0 },
    'library:song': null,
    'playlists:list': [],
    'player:getState': playerState({ programId: null })
  })
  fake.settings = { ...fake.settings, ...settings }
  renderWithLibrary(page === 'music' ? <MusicPage /> : <ProgramPage />, fake.api)
  return fake
}

const table = (): HTMLElement => screen.getByRole('table', { name: 'Songs' })
const header = (name: string): HTMLElement =>
  within(table()).getByRole('columnheader', { name: new RegExp(`^${name}`) })
const handle = (name: string): HTMLElement =>
  within(table()).getByRole('separator', { name: `Resize ${name}` })
const headerRow = (): HTMLElement => within(table()).getAllByRole('row')[0]
const saved = (fake: ReturnType<typeof setup>, key: string): unknown[] =>
  fake.callsTo('settings:set').filter((c) => c[0] === key)

describe('resize handles', () => {
  test('only the movable columns have one', async () => {
    setup('music')
    await screen.findByRole('table', { name: 'Songs' })
    const names = within(table())
      .getAllByRole('separator')
      .map((s) => s.getAttribute('aria-label'))
    expect(names).toEqual([
      'Resize Country',
      'Resize Choreographer',
      'Resize Teacher',
      'Resize Artist',
      'Resize Type',
      'Resize Difficulty',
      'Resize Time'
    ])
  })

  test('a saved width becomes the column track, behind its collapse variable', async () => {
    setup('program', { 'library.columnWidths.program': { country: 20 } })
    await waitFor(() =>
      expect(headerRow().style.gridTemplateColumns).toContain(
        'var(--w-country, max(60px, calc(100cqw * 20 / 100)))'
      )
    )
    expect(headerRow().style.gridTemplateColumns).toContain('var(--w-teacher, minmax(70px, 1fr))')
  })

  test('Music and Program keep separate widths', async () => {
    setup('program', { 'library.columnWidths.music': { country: 20 } })
    await screen.findByRole('table', { name: 'Songs' })
    expect(headerRow().style.gridTemplateColumns).not.toContain('100cqw')
  })

  test('dragging changes the width live and saves once, at release', async () => {
    const fake = setup('music')
    await screen.findByRole('table', { name: 'Songs' })
    const h = handle('Country')
    fireEvent.pointerDown(h, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(h, { clientX: 150, pointerId: 1 })
    expect(headerRow().style.gridTemplateColumns).toContain('calc(100cqw * 15 / 100)')
    fireEvent.pointerMove(h, { clientX: 200, pointerId: 1 })
    expect(saved(fake, 'library.columnWidths.music')).toHaveLength(0)
    fireEvent.pointerUp(h, { clientX: 200, pointerId: 1 })
    expect(saved(fake, 'library.columnWidths.music')).toEqual([
      ['library.columnWidths.music', { country: 20 }]
    ])
  })

  test('a drag cannot go below the minimum or above 40%', async () => {
    const fake = setup('music')
    await screen.findByRole('table', { name: 'Songs' })
    const h = handle('Country')
    fireEvent.pointerDown(h, { clientX: 100, pointerId: 1 })
    fireEvent.pointerUp(h, { clientX: -500, pointerId: 1 })
    fireEvent.pointerDown(h, { clientX: 100, pointerId: 1 })
    fireEvent.pointerUp(h, { clientX: 5000, pointerId: 1 })
    expect(saved(fake, 'library.columnWidths.music').map((c) => (c as unknown[])[1])).toEqual([
      { country: 6 },
      { country: 40 }
    ])
  })

  test('a cancelled drag restores the width and saves nothing', async () => {
    const fake = setup('music')
    await screen.findByRole('table', { name: 'Songs' })
    const h = handle('Country')
    fireEvent.pointerDown(h, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(h, { clientX: 160, pointerId: 1 })
    fireEvent.pointerCancel(h, { pointerId: 1 })
    expect(headerRow().style.gridTemplateColumns).not.toContain('100cqw')
    expect(saved(fake, 'library.columnWidths.music')).toHaveLength(0)
  })

  test('pressing a handle starts neither a column drag nor a sort', async () => {
    setup('music')
    await screen.findByRole('table', { name: 'Songs' })
    const h = handle('Country')
    expect(h.getAttribute('draggable')).toBe('false')
    expect(fireEvent.mouseDown(h)).toBe(false)
    expect(fireEvent.pointerDown(h, { pointerId: 1 })).toBe(false)
    expect(header('Country').getAttribute('aria-sort')).toBeNull()
    fireEvent.click(h)
    expect(header('Country').getAttribute('aria-sort')).toBeNull()
  })
})

describe('keyboard resizing', () => {
  const button = (name: string): HTMLElement =>
    within(header(name)).getByRole('button', { name: new RegExp(`^${name}`) })

  test('Alt+Shift+Right widens by one point, Left narrows, and each saves', async () => {
    const fake = setup('music')
    await screen.findByRole('table', { name: 'Songs' })
    fireEvent.keyDown(button('Country'), { key: 'ArrowRight', altKey: true, shiftKey: true })
    await waitFor(() =>
      expect(saved(fake, 'library.columnWidths.music').at(-1)).toEqual([
        'library.columnWidths.music',
        { country: 11 }
      ])
    )
    fireEvent.keyDown(button('Country'), { key: 'ArrowLeft', altKey: true, shiftKey: true })
    await waitFor(() =>
      expect(saved(fake, 'library.columnWidths.music').at(-1)).toEqual([
        'library.columnWidths.music',
        { country: 10 }
      ])
    )
  })

  test('it stops at the minimum', async () => {
    const fake = setup('music', { 'library.columnWidths.music': { country: 6 } })
    await waitFor(() => expect(headerRow().style.gridTemplateColumns).toContain('100cqw * 6 /'))
    fireEvent.keyDown(button('Country'), { key: 'ArrowLeft', altKey: true, shiftKey: true })
    expect(saved(fake, 'library.columnWidths.music')).toHaveLength(0)
  })

  test('Alt+Shift does not reorder, and Alt alone still does', async () => {
    const fake = setup('music')
    await screen.findByRole('table', { name: 'Songs' })
    fireEvent.keyDown(button('Country'), { key: 'ArrowRight', altKey: true, shiftKey: true })
    expect(saved(fake, 'library.columns.music')).toHaveLength(0)
    fireEvent.keyDown(button('Country'), { key: 'ArrowRight', altKey: true })
    expect(saved(fake, 'library.columns.music')).toHaveLength(1)
  })
})

describe('Reset columns', () => {
  test('is on when only widths differ, and clears order and widths', async () => {
    const fake = setup('music', { 'library.columnWidths.music': { country: 12 } })
    await waitFor(() => expect(headerRow().style.gridTemplateColumns).toContain('100cqw'))
    fireEvent.contextMenu(headerRow(), { clientX: 10, clientY: 10 })
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reset columns' }))
    expect(saved(fake, 'library.columns.music')).toEqual([['library.columns.music', []]])
    expect(saved(fake, 'library.columnWidths.music')).toEqual([['library.columnWidths.music', {}]])
    expect(headerRow().style.gridTemplateColumns).not.toContain('100cqw')
  })
})
