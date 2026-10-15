import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { CanvaDeck, DanceSlide } from '@shared/canva'
import DanceSlideField from '@renderer/library/DanceSlideField'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from './render-library'

const deck: CanvaDeck = {
  id: 4,
  viewUrl: 'https://www.canva.com/design/DAH/TOK/view',
  designId: 'DAH',
  title: "Dance n' Jam Tunes",
  pageCount: 3,
  syncedAt: '2026-10-14 10:00:00',
  lastError: null
}
const pages = [
  { id: 'P1', title: 'Ajde Jano' },
  { id: 'P2', title: null },
  { id: 'P3', title: 'Ali Paşa' }
]
const linked: DanceSlide = {
  deckId: 4,
  deckTitle: "Dance n' Jam Tunes",
  viewUrl: deck.viewUrl,
  pageId: 'P3',
  title: 'Ali Paşa',
  position: 3,
  status: 'ok',
  imageUrl: 'fdp-media://slide/4/P3?v=1',
  captureError: null
}

function setup(slide: DanceSlide | null, extra: Record<string, unknown> = {}) {
  const fake = createFakeApi({
    'canva:decks': [deck],
    'canva:deckPages': pages,
    'canva:linkSlide': linked,
    'canva:linkPageLink': linked,
    'canva:clearSlide': undefined,
    'canva:addDeck': { ...deck, id: 5, title: 'Workshop' },
    ...extra
  })
  renderWithLibrary(<DanceSlideField danceId={11} danceName="Ali Paşa" slide={slide} />, fake.api)
  return fake
}

// Opens the dialog from the field's button.
async function open(button = 'Link a slide…') {
  await userEvent.click(screen.getByRole('button', { name: button }))
  return within(await screen.findByRole('dialog', { name: 'Slide for Ali Paşa' }))
}

describe('a dance’s Canva slide (spec §6.3)', () => {
  test('links a slide by its number in a deck, showing the slide’s title', async () => {
    const fake = setup(null)
    const dialog = await open()
    const number = await dialog.findByLabelText('Slide number')
    await userEvent.clear(number)
    await userEvent.type(number, '3')
    expect(await dialog.findByText('Ali Paşa')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Link' }))
    expect(fake.callsTo('canva:linkSlide')).toEqual([[11, 4, 3]])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  test('adds a deck by pasting its view link, then picks from it', async () => {
    const fake = setup(null, { 'canva:decks': [] })
    const dialog = await open()
    const link = await dialog.findByLabelText('Deck link')
    await userEvent.type(link, 'https://www.canva.com/design/DAX/TOK/view')
    await userEvent.click(dialog.getByRole('button', { name: 'Add deck' }))
    expect(fake.callsTo('canva:addDeck')).toEqual([['https://www.canva.com/design/DAX/TOK/view']])
    expect(await dialog.findByDisplayValue('Workshop')).toBeInTheDocument()
  })

  test('links a slide from a pasted slide link', async () => {
    const fake = setup(null)
    const dialog = await open()
    await userEvent.click(await dialog.findByRole('radio', { name: 'Paste a slide link' }))
    await userEvent.type(dialog.getByLabelText('Slide link'), 'https://canva.link/abc')
    await userEvent.click(dialog.getByRole('button', { name: 'Link' }))
    expect(fake.callsTo('canva:linkPageLink')).toEqual([[11, 'https://canva.link/abc']])
  })

  test('shows a Canva error in the dialog and keeps it open', async () => {
    setup(null, {
      'canva:linkPageLink': () => {
        throw new Error("That link isn't a Canva slide link")
      }
    })
    const dialog = await open()
    await userEvent.click(await dialog.findByRole('radio', { name: 'Paste a slide link' }))
    await userEvent.type(dialog.getByLabelText('Slide link'), 'https://example.com')
    await userEvent.click(dialog.getByRole('button', { name: 'Link' }))
    expect(await dialog.findByText("That link isn't a Canva slide link")).toBeInTheDocument()
  })

  test('a linked slide shows its deck, number, title and saved image; Remove unlinks it', async () => {
    const fake = setup(linked)
    expect(screen.getByText("Dance n' Jam Tunes · slide 3: Ali Paşa")).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Slide for Ali Paşa' })).toHaveAttribute(
      'src',
      linked.imageUrl
    )
    await userEvent.click(screen.getByRole('button', { name: 'Remove slide' }))
    expect(fake.callsTo('canva:clearSlide')).toEqual([[11]])
  })

  test('warns when the slide is gone from its deck, or its image could not be saved', () => {
    setup({
      ...linked,
      status: 'missing',
      position: null,
      imageUrl: null,
      captureError: 'Timed out'
    })
    expect(screen.getByText(/no longer in the deck/)).toBeInTheDocument()
    expect(screen.getByText(/Couldn't save the slide image: Timed out/)).toBeInTheDocument()
  })
})
