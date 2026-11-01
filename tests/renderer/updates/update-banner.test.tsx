import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { PlayerState } from '@shared/program'
import type { UpdateState } from '@shared/updates'
import type { TourStep } from '@renderer/tour/steps'
import UpdateBanner from '@renderer/updates/UpdateBanner'
import { TourProvider, useTour } from '@renderer/tour/TourProvider'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { playerState, playing, track } from '../program/fixtures'

// One step is enough to be touring.
const INTRO: TourStep = {
  id: 'i',
  part: 'basic',
  page: null,
  kind: 'intro',
  title: 'Welcome',
  body: 'Hello.'
}

function Touring(): React.JSX.Element {
  return <output aria-label="touring">{useTour().touring ? 'yes' : 'no'}</output>
}

const ready = (version: string): UpdateState => ({ kind: 'ready', version })

function setup(initial: UpdateState, player: PlayerState = playerState(), tour = false) {
  const fake = createFakeApi({
    'updates:getState': initial,
    'updates:install': undefined,
    'player:getState': player,
    'tour:state': { part: tour ? 'basic' : null, landOn: null },
    'tour:offer': null
  })
  renderWithLibrary(
    tour ? (
      <TourProvider
        page="program"
        setPage={() => undefined}
        stepsFor={() => ({ steps: [INTRO], advanced: [] })}
      >
        <Touring />
        <UpdateBanner />
      </TourProvider>
    ) : (
      <UpdateBanner />
    ),
    fake.api
  )
  return fake
}

const banner = () => screen.queryByRole('status', { name: /update/i })

describe('the update banner', () => {
  test.each([
    ['idle', { kind: 'idle' }],
    ['checking', { kind: 'checking' }],
    ['downloading', { kind: 'downloading', version: '0.3.1' }],
    ['an error', { kind: 'error', message: 'offline' }]
  ] as [string, UpdateState][])('shows nothing while %s', async (_name, state) => {
    const fake = setup(state)
    await fake.api.invoke('updates:getState')
    expect(banner()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restart to Update' })).toBeNull()
  })

  test('shows the version and Restart to Update once an update is ready', async () => {
    setup(ready('0.3.1'))
    expect(await screen.findByText('Version 0.3.1 is ready.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restart to Update' })).toBeInTheDocument()
  })

  test('appears when the update becomes ready later', async () => {
    const fake = setup({ kind: 'downloading', version: '0.3.1' })
    await fake.api.invoke('updates:getState')
    expect(screen.queryByText(/is ready/)).toBeNull()
    act(() => fake.emit('updates:state', ready('0.3.1')))
    expect(await screen.findByText('Version 0.3.1 is ready.')).toBeInTheDocument()
  })

  test('Restart to Update installs at once when nothing is playing, with no question', async () => {
    const fake = setup(ready('0.3.1'))
    await userEvent.click(await screen.findByRole('button', { name: 'Restart to Update' }))
    expect(fake.callsTo('updates:install')).toEqual([[]])
    expect(screen.queryByText(/Music is playing/)).toBeNull()
  })

  test.each([
    ['playing', playing(track(1, 'Hora'))],
    ['counting down', playerState({ status: 'countdown' })]
  ])(
    'asks first while the player is %s; Keep playing does nothing, Restart installs',
    async (_n, player) => {
      const fake = setup(ready('0.3.1'), player)
      await userEvent.click(await screen.findByRole('button', { name: 'Restart to Update' }))
      expect(await screen.findByText(/Music is playing/)).toBeInTheDocument()
      expect(fake.callsTo('updates:install')).toEqual([])
      await userEvent.click(screen.getByRole('button', { name: 'Keep playing' }))
      expect(fake.callsTo('updates:install')).toEqual([])

      await userEvent.click(screen.getByRole('button', { name: 'Restart to Update' }))
      await userEvent.click(await screen.findByRole('button', { name: 'Restart' }))
      expect(fake.callsTo('updates:install')).toEqual([[]])
    }
  )

  test('✕ hides the banner for that version, and a newer version brings it back', async () => {
    const fake = setup(ready('0.3.1'))
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/is ready/)).toBeNull()
    act(() => fake.emit('updates:state', ready('0.3.1'))) // the same version again
    expect(screen.queryByText(/is ready/)).toBeNull()
    act(() => fake.emit('updates:state', ready('0.3.2')))
    expect(await screen.findByText('Version 0.3.2 is ready.')).toBeInTheDocument()
  })

  test('is hidden while a tour runs', async () => {
    setup(ready('0.3.1'), playerState(), true)
    await waitFor(() => expect(screen.getByLabelText('touring')).toHaveTextContent('yes'))
    expect(screen.queryByText(/is ready/)).toBeNull()
  })
})
