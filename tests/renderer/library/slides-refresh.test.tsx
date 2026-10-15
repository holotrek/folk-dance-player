import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { FORMAT_CHANGED, type CanvaDeck } from '@shared/canva'
import {
  SlidesNotices,
  SlidesRefreshButton,
  useSlidesRefresh
} from '@renderer/library/SlidesRefresh'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from './render-library'

const deck = (lastError: string | null): CanvaDeck => ({
  id: 4,
  viewUrl: 'https://www.canva.com/design/DAH/TOK/view',
  designId: 'DAH',
  title: "Dance n' Jam Tunes",
  pageCount: 42,
  syncedAt: null,
  lastError
})

// The Music page's arrangement: the button in the header, the notices below.
function SlidesRefresh(): React.JSX.Element {
  const state = useSlidesRefresh()
  return (
    <>
      <SlidesRefreshButton state={state} />
      <SlidesNotices state={state} />
    </>
  )
}

describe('Refresh slides (spec §6.3, §8.3)', () => {
  test('re-reads the decks and shows the image captures as they run', async () => {
    const fake = createFakeApi({
      'canva:decks': [deck(null)],
      'canva:refreshSlides': { decks: 1, formatChanged: 0, unreachable: 0 }
    })
    renderWithLibrary(<SlidesRefresh />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh slides' }))
    expect(fake.callsTo('canva:refreshSlides')).toEqual([[]])
    act(() => fake.emit('canva:captureStatus', { running: true, done: 2, total: 5, failed: 0 }))
    expect(screen.getByText('Saving slide images… 2 of 5')).toBeInTheDocument()
    act(() => fake.emit('canva:captureStatus', { running: false, done: 5, total: 5, failed: 1 }))
    expect(screen.queryByText(/Saving slide images/)).toBeNull()
    expect(screen.getByText("1 slide image couldn't be saved.")).toBeInTheDocument()
  })

  test('says when decks could not be reached', async () => {
    const fake = createFakeApi({
      'canva:decks': [deck(null)],
      'canva:refreshSlides': { decks: 2, formatChanged: 0, unreachable: 2 }
    })
    renderWithLibrary(<SlidesRefresh />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh slides' }))
    expect(
      await screen.findByText("Couldn't reach Canva for 2 decks. Their saved slides stay in use.")
    ).toBeInTheDocument()
  })

  test('"Canva links need checking" while a deck’s format changed', async () => {
    const fake = createFakeApi({ 'canva:decks': [deck(FORMAT_CHANGED)] })
    renderWithLibrary(<SlidesRefresh />, fake.api)
    expect(await screen.findByText(/Canva links need checking/)).toBeInTheDocument()
    fake.emit('library:changed', null)
    await waitFor(() => expect(fake.callsTo('canva:decks').length).toBeGreaterThan(1))
  })

  test('hidden until a deck has been added', async () => {
    const fake = createFakeApi({ 'canva:decks': [] })
    renderWithLibrary(<SlidesRefresh />, fake.api)
    await waitFor(() => expect(fake.callsTo('canva:decks')).toHaveLength(1))
    expect(screen.queryByRole('button', { name: 'Refresh slides' })).toBeNull()
  })
})
