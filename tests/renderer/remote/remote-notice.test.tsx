import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { PlayerState, RemoteStatus } from '@shared/program'
import type { TourStep } from '@renderer/tour/steps'
import RemoteNotice from '@renderer/remote/RemoteNotice'
import { TourProvider, useTour } from '@renderer/tour/TourProvider'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { playerState, playing, track } from '../program/fixtures'

const KEYS = ['MediaPlayPause']
const needsRestart: RemoteStatus = { trusted: true, keys: KEYS, restartNeeded: true }
const fine: RemoteStatus = { trusted: true, keys: KEYS, restartNeeded: false }
const SENTENCE = 'Remote control is allowed. Restart Folk Dance Player to turn it on.'

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

function setup(initial: RemoteStatus, player: PlayerState = playerState(), tour = false) {
  const fake = createFakeApi({
    'remote:status': initial,
    'remote:restart': undefined,
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
        <RemoteNotice />
      </TourProvider>
    ) : (
      <RemoteNotice />
    ),
    fake.api
  )
  return fake
}

describe('the remote notice', () => {
  test('shows nothing when no restart is needed', async () => {
    const fake = setup(fine)
    await fake.api.invoke('remote:status')
    expect(screen.queryByText(SENTENCE)).toBeNull()
  })

  test('shows the sentence and Restart when a restart is needed', async () => {
    setup(needsRestart)
    expect(await screen.findByText(SENTENCE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument()
  })

  test('appears when the grant is heard later', async () => {
    const fake = setup(fine)
    await fake.api.invoke('remote:status')
    act(() => fake.emit('remote:changed', needsRestart))
    expect(await screen.findByText(SENTENCE)).toBeInTheDocument()
  })

  test('Restart relaunches at once when nothing is playing', async () => {
    const fake = setup(needsRestart)
    await userEvent.click(await screen.findByRole('button', { name: 'Restart' }))
    expect(fake.callsTo('remote:restart')).toEqual([[]])
  })

  test.each([
    ['playing', playing(track(1, 'Hora'))],
    ['counting down', playerState({ status: 'countdown' })]
  ])('asks first while the player is %s', async (_n, player) => {
    const fake = setup(needsRestart, player)
    await userEvent.click(await screen.findByRole('button', { name: 'Restart' }))
    expect(await screen.findByText(/Music is playing/)).toBeInTheDocument()
    expect(fake.callsTo('remote:restart')).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(fake.callsTo('remote:restart')).toEqual([])

    await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Restart anyway' }))
    expect(fake.callsTo('remote:restart')).toEqual([[]])
  })

  test('✕ hides it, and the same grant heard again does not bring it back', async () => {
    const fake = setup(needsRestart)
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(SENTENCE)).toBeNull()
    act(() => fake.emit('remote:changed', needsRestart))
    expect(screen.queryByText(SENTENCE)).toBeNull()
  })

  test('is hidden while a tour runs', async () => {
    setup(needsRestart, playerState(), true)
    await waitFor(() => expect(screen.getByLabelText('touring')).toHaveTextContent('yes'))
    expect(screen.queryByText(SENTENCE)).toBeNull()
  })
})
