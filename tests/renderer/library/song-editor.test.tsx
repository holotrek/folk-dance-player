import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { SongDetail } from '@shared/library'
import SongEditor from '@renderer/library/SongEditor'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from './render-library'

const detail = (overrides: Partial<SongDetail> = {}): SongDetail => ({
  songId: 1,
  fileId: 101,
  title: 'Pusteno Ludo',
  artist: 'Trakia',
  path: '/Music/Pusteno Ludo.mp3',
  durationMs: 183_000,
  isMissing: false,
  isFavorite: false,
  dances: [
    {
      danceId: 11,
      pairingId: 21,
      name: 'Pravo Rhodopsko Oro',
      country: 'Bulgaria',
      choreographer: 'Yves Moreau',
      danceType: null,
      difficulty: 2,
      notes: null,
      teacher: 'Sonia Dion',
      songCount: 3,
      isDefault: true,
      sameAsSong: false,
      notesPdf: null,
      slideImage: null,
      slideShows: null,
      label: 'Pravo Rhodopsko Oro (Yves Moreau) ♪ Pusteno Ludo',
      slide: null
    },
    {
      danceId: 12,
      pairingId: 22,
      name: 'Lesnoto',
      country: null,
      choreographer: 'Someone',
      danceType: null,
      difficulty: null,
      notes: null,
      teacher: null,
      songCount: 1,
      isDefault: false,
      sameAsSong: false,
      notesPdf: null,
      slideImage: null,
      slideShows: null,
      label: 'Lesnoto (Someone) ♪ Pusteno Ludo',
      slide: null
    }
  ],
  suggestions: [],
  ...overrides
})

function setup(song: SongDetail = detail(), extra: Record<string, unknown> = {}) {
  const fake = createFakeApi({
    'library:song': song,
    'library:suggestions': {
      people: ['Sonia Dion', 'Yves Moreau'],
      countries: ['Bulgaria'],
      danceTypes: ['Line']
    },
    'library:updateSong': undefined,
    'library:updateDance': undefined,
    'library:setTeacher': undefined,
    'library:setDefaultDance': undefined,
    'library:unlinkDance': undefined,
    'library:linkDance': undefined,
    'library:createDance': 13,
    'library:mergeDances': undefined,
    'library:sameDance': undefined,
    'library:markDifferent': undefined,
    'library:searchDances': [
      { danceId: 12, name: 'Lesnoto', choreographer: 'Someone', country: null, songCount: 1 },
      { danceId: 30, name: 'Lesnoto', choreographer: null, country: 'Macedonia', songCount: 9 }
    ],
    ...extra
  })
  renderWithLibrary(<SongEditor songId={1} />, fake.api)
  return fake
}

const danceCard = (name: string) => screen.getByRole('group', { name }) as HTMLElement

async function edit(input: HTMLElement, value: string): Promise<void> {
  await userEvent.clear(input)
  if (value) await userEvent.type(input, value)
  fireEvent.blur(input)
}

describe('SongEditor', () => {
  test('shows the song and each dance by its label, with the default first', async () => {
    setup()
    expect(await screen.findByDisplayValue('Pusteno Ludo')).toBeInTheDocument()
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual([
      'Pravo Rhodopsko Oro (Yves Moreau) ♪ Pusteno Ludo',
      'Lesnoto (Someone) ♪ Pusteno Ludo'
    ])
    expect(
      within(danceCard('Pravo Rhodopsko Oro (Yves Moreau) ♪ Pusteno Ludo')).getByText(/Default/)
    ).toBeInTheDocument()
    expect(
      screen.getByText('Also used by 2 other songs: changes apply to all of them.')
    ).toBeInTheDocument()
  })

  test('saves the song title when you leave the field, only if it changed', async () => {
    const fake = setup()
    const title = await screen.findByLabelText('Title')
    fireEvent.blur(title)
    await edit(title, 'Pusteno Ludo (live)')
    await waitFor(() =>
      expect(fake.callsTo('library:updateSong')).toEqual([[1, { title: 'Pusteno Ludo (live)' }]])
    )
  })

  test('saves dance fields and the pairing’s teacher', async () => {
    const fake = setup()
    await screen.findByDisplayValue('Pusteno Ludo')
    const card = within(danceCard('Pravo Rhodopsko Oro (Yves Moreau) ♪ Pusteno Ludo'))
    await edit(card.getByLabelText('Country'), 'Bulgaria (Rhodopes)')
    await edit(card.getByLabelText('Teacher'), '')
    await waitFor(() =>
      expect(fake.callsTo('library:updateDance')).toEqual([
        [11, { country: 'Bulgaria (Rhodopes)' }]
      ])
    )
    expect(fake.callsTo('library:setTeacher')).toEqual([[21, '']])
  })

  test('each dance has its Canva slide field', async () => {
    setup()
    await screen.findByDisplayValue('Pusteno Ludo')
    const card = within(danceCard('Lesnoto (Someone) ♪ Pusteno Ludo'))
    expect(card.getByRole('button', { name: 'Link a slide…' })).toBeInTheDocument()
  })

  test('sets the difficulty', async () => {
    const fake = setup()
    await screen.findByDisplayValue('Pusteno Ludo')
    const card = within(danceCard('Lesnoto (Someone) ♪ Pusteno Ludo'))
    // Mantine's Rating takes the click on each star's label.
    const four = card.getByRole('radio', { name: '4' }) as HTMLInputElement
    await userEvent.click(four.labels![0])
    expect(fake.callsTo('library:updateDance')).toEqual([[12, { difficulty: 4 }]])
  })

  test('makes another dance the default, and unlinks one', async () => {
    const fake = setup()
    await screen.findByDisplayValue('Pusteno Ludo')
    const lesnoto = within(danceCard('Lesnoto (Someone) ♪ Pusteno Ludo'))
    await userEvent.click(lesnoto.getByRole('button', { name: 'Make default' }))
    expect(fake.callsTo('library:setDefaultDance')).toEqual([[1, 12]])
    await userEvent.click(lesnoto.getByRole('button', { name: 'Dance options' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Unlink from this song' }))
    expect(fake.callsTo('library:unlinkDance')).toEqual([[1, 12]])
  })

  test('links an existing dance found by searching', async () => {
    const fake = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Link a dance…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Link a dance' })
    await userEvent.type(within(dialog).getByLabelText('Search dances'), 'lesn')
    await waitFor(() => expect(fake.callsTo('library:searchDances').at(-1)).toEqual(['lesn']))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear search' }))
    expect(within(dialog).getByLabelText('Search dances')).toHaveValue('')
    await userEvent.type(within(dialog).getByLabelText('Search dances'), 'lesn')
    // Dances already linked to the song aren't offered.
    const options = await within(dialog).findAllByRole('button', { name: /^Link / })
    expect(options).toHaveLength(1)
    await userEvent.click(options[0])
    expect(fake.callsTo('library:linkDance')).toEqual([[1, 30]])
  })

  test('creates a new dance for the song', async () => {
    const fake = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'New dance…' }))
    const dialog = await screen.findByRole('dialog', { name: 'New dance' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Pravo Horo')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(fake.callsTo('library:createDance')).toEqual([[1, 'Pravo Horo']])
  })

  test('merges a dance into another after confirming', async () => {
    const fake = setup()
    await screen.findByDisplayValue('Pusteno Ludo')
    const lesnoto = within(danceCard('Lesnoto (Someone) ♪ Pusteno Ludo'))
    await userEvent.click(lesnoto.getByRole('button', { name: 'Dance options' }))
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Merge into another dance…' })
    )
    const picker = await screen.findByRole('dialog', { name: 'Merge “Lesnoto” into…' })
    await userEvent.type(within(picker).getByLabelText('Search dances'), 'lesnoto')
    await userEvent.click(
      await within(picker).findByRole('button', { name: /^Merge into Lesnoto/ })
    )
    const confirm = await screen.findByRole('dialog', { name: 'Merge dances?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Merge' }))
    expect(fake.callsTo('library:mergeDances')).toEqual([[30, 12]])
  })

  test('answers a same-name suggestion', async () => {
    const fake = setup(
      detail({
        suggestions: [
          {
            forDanceId: 12,
            candidate: {
              danceId: 30,
              name: 'Lesnoto',
              choreographer: null,
              country: 'Macedonia',
              songTitles: ['Lesnoto Oro', 'Gaida']
            }
          }
        ]
      })
    )
    const alert = await screen.findByText(/Another dance called “Lesnoto” exists/)
    expect(alert).toHaveTextContent('Lesnoto Oro, Gaida')
    await userEvent.click(screen.getByRole('button', { name: 'Same dance' }))
    expect(fake.callsTo('library:sameDance')).toEqual([[1, 12, 30]])
    await userEvent.click(screen.getByRole('button', { name: 'Different dance' }))
    expect(fake.callsTo('library:markDifferent')).toEqual([[12, 30]])
  })

  test('shows why a change was refused', async () => {
    setup(detail(), {
      'library:updateSong': () => {
        throw new Error(
          "Error invoking remote method 'library:updateSong': LibraryEditError: A song title can't be empty."
        )
      }
    })
    await edit(await screen.findByLabelText('Title'), ' ')
    expect(await screen.findByRole('alert')).toHaveTextContent("A song title can't be empty.")
  })

  test('refreshes when the library changes', async () => {
    const fake = setup()
    await screen.findByDisplayValue('Pusteno Ludo')
    const before = fake.callsTo('library:song').length
    fake.emit('library:changed', null)
    await waitFor(() => expect(fake.callsTo('library:song').length).toBe(before + 1))
  })

  describe('Same as song', () => {
    const base = detail()
    // The default dance used by this song only and named like it; plus the song's other dance.
    const withSameAsSong = (over: Partial<SongDetail['dances'][number]> = {}): SongDetail =>
      detail({
        dances: [
          {
            ...base.dances[0],
            name: 'Pusteno Ludo',
            label: 'Pusteno Ludo',
            songCount: 1,
            sameAsSong: true,
            ...over
          },
          base.dances[1]
        ]
      })
    const card = () => within(danceCard('Pusteno Ludo'))

    test('the default dance named like its song shows the box checked, with a locked name', async () => {
      setup(withSameAsSong())
      await screen.findByLabelText('Title')
      expect(card().getByRole('checkbox', { name: 'Same as song' })).toBeChecked()
      expect(card().getByLabelText('Dance name')).toBeDisabled()
    })

    test('a dance with a different name shows the box unchecked, with an editable name', async () => {
      setup(
        detail({ dances: [{ ...base.dances[0], songCount: 1, sameAsSong: false }, base.dances[1]] })
      )
      const group = within(await screen.findByRole('group', { name: /^Pravo/ }))
      expect(group.getByRole('checkbox', { name: 'Same as song' })).not.toBeChecked()
      expect(group.getByLabelText('Dance name')).not.toBeDisabled()
    })

    test("checking it sets the dance's name back to the song's title", async () => {
      const fake = setup(
        detail({ dances: [{ ...base.dances[0], songCount: 1, sameAsSong: false }, base.dances[1]] })
      )
      const group = within(await screen.findByRole('group', { name: /^Pravo/ }))
      await userEvent.click(group.getByRole('checkbox', { name: 'Same as song' }))
      await waitFor(() =>
        expect(fake.callsTo('library:updateDance')).toEqual([[11, { sameAsSong: true }]])
      )
    })

    test('unchecking makes the name editable, and checking again only locks it', async () => {
      const fake = setup(withSameAsSong())
      await screen.findByLabelText('Title')
      await userEvent.click(card().getByRole('checkbox', { name: 'Same as song' }))
      expect(card().getByRole('checkbox', { name: 'Same as song' })).not.toBeChecked()
      expect(card().getByLabelText('Dance name')).toBeEnabled()
      await userEvent.click(card().getByRole('checkbox', { name: 'Same as song' }))
      expect(card().getByRole('checkbox', { name: 'Same as song' })).toBeChecked()
      expect(card().getByLabelText('Dance name')).toBeDisabled()
      expect(fake.callsTo('library:updateDance')).toEqual([]) // the names were already equal
    })

    test('an unlocked name can be edited and saved', async () => {
      const fake = setup(withSameAsSong())
      await screen.findByLabelText('Title')
      await userEvent.click(card().getByRole('checkbox', { name: 'Same as song' }))
      await edit(card().getByLabelText('Dance name'), 'Pravo')
      await waitFor(() =>
        expect(fake.callsTo('library:updateDance')).toEqual([[11, { name: 'Pravo' }]])
      )
    })

    test('while the box is unchecked, a new song title keeps the dance name', async () => {
      const fake = setup(withSameAsSong())
      await screen.findByLabelText('Title')
      await userEvent.click(card().getByRole('checkbox', { name: 'Same as song' }))
      await edit(screen.getByLabelText('Title'), 'Pusteno Ludo II')
      await waitFor(() =>
        expect(fake.callsTo('library:updateSong')).toEqual([
          [1, { title: 'Pusteno Ludo II', keepDanceName: true }]
        ])
      )
    })

    test('with the box checked, a new song title is sent plainly', async () => {
      const fake = setup(withSameAsSong())
      await screen.findByLabelText('Title')
      await edit(screen.getByLabelText('Title'), 'Pusteno Ludo II')
      await waitFor(() =>
        expect(fake.callsTo('library:updateSong')).toEqual([[1, { title: 'Pusteno Ludo II' }]])
      )
    })

    test('the box sits beside the dance name, on its right', async () => {
      setup(withSameAsSong())
      await screen.findByLabelText('Title')
      const name = card().getByLabelText('Dance name')
      const box = card().getByRole('checkbox', { name: 'Same as song' })
      expect(name.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      const row = name.closest('[data-same-as-song-row]')
      expect(row).not.toBeNull()
      expect(row).toBe(box.closest('[data-same-as-song-row]'))
    })

    test('a locked name is not saved', async () => {
      const fake = setup(withSameAsSong())
      await screen.findByLabelText('Title')
      await userEvent.type(card().getByLabelText('Dance name'), 'x')
      fireEvent.blur(card().getByLabelText('Dance name'))
      expect(fake.callsTo('library:updateDance')).toEqual([])
    })

    test('a dance used by several songs, or a non-default dance, has no box', async () => {
      setup() // fixture: the default dance has 3 songs; the other dance is not the default
      await screen.findByLabelText('Title')
      expect(screen.queryByRole('checkbox', { name: 'Same as song' })).toBeNull()
      expect(screen.getAllByLabelText('Dance name')[0]).not.toBeDisabled()
    })

    test('only the default dance of a song with several dances has the box', async () => {
      setup(withSameAsSong())
      await screen.findByLabelText('Title')
      expect(screen.getAllByRole('checkbox', { name: 'Same as song' })).toHaveLength(1)
    })

    test('when the default changes, the box is on the new default', async () => {
      let current = withSameAsSong()
      const fake = setup(current, { 'library:song': () => current })
      await screen.findByLabelText('Title')
      expect(
        within(danceCard('Pusteno Ludo')).getByRole('checkbox', { name: 'Same as song' })
      ).toBeChecked()
      // "Lesnoto" becomes the default, and is named like the song.
      current = detail({
        dances: [
          {
            ...base.dances[1],
            name: 'Pusteno Ludo',
            label: 'Pusteno Ludo',
            isDefault: true,
            sameAsSong: true
          },
          {
            ...base.dances[0],
            name: 'Pusteno Ludo',
            label: 'Pusteno Ludo (2)',
            songCount: 1,
            isDefault: false
          }
        ]
      })
      fake.emit('library:changed', null)
      await waitFor(() =>
        expect(screen.getAllByRole('checkbox', { name: 'Same as song' })).toHaveLength(1)
      )
      expect(screen.getByRole('group', { name: 'Pusteno Ludo' })).toContainElement(
        screen.getByRole('checkbox', { name: 'Same as song' })
      )
    })
  })
})
