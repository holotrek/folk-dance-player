import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'
import type { PlayerState } from '@shared/program'
import PlayerBar from '@renderer/program/PlayerBar'
import { tourAudio } from '@renderer/tour/audio-hold'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { item, playerState, playing, stop, track } from './fixtures'

const hora = track(101, 'Hora', { country: 'Romania', durationMs: 185_000 })

const COMMANDS = [
  'player:play',
  'player:pause',
  'player:stop',
  'player:next',
  'player:ended',
  'player:failed',
  'player:setSpeed',
  'player:setSpeedLocked',
  'player:setVolume',
  'player:setAutoContinue',
  'player:dismissWarning',
  'player:restart',
  'projector:setEnabled'
] as const

function setup(state: PlayerState) {
  const fake = createFakeApi({
    'player:getState': state,
    ...Object.fromEntries(COMMANDS.map((c) => [c, undefined]))
  })
  renderWithLibrary(<PlayerBar />, fake.api)
  return fake
}

const audio = () => screen.getByTestId('player-audio') as HTMLAudioElement
const title = () => screen.getByTestId('player-title')

describe('player bar', () => {
  afterEach(() => tourAudio.reset())

  test('idle: shows next up, and ▶ starts the program', async () => {
    const fake = setup(playerState({ nextUp: item(1, hora) }))
    await waitFor(() => expect(title()).toHaveTextContent('Next up: Hora'))
    await userEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(fake.callsTo('player:play')).toEqual([[]])
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled()
  })

  test('a STOP marker next, or nothing loaded, says so', async () => {
    const fake = setup(playerState({ nextUp: stop(3) }))
    await waitFor(() => expect(title()).toHaveTextContent('Next up: STOP / TEACHING'))
    act(() => fake.emit('player:state', playerState({ programId: null })))
    expect(title()).toHaveTextContent('No program loaded')
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  })

  test('playing: loads the song by file id and plays it, showing its label and country', async () => {
    setup(playing(hora))
    await waitFor(() => expect(audio().src).toBe('fdp-media://file/101'))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
    expect(title()).toHaveTextContent('Hora')
    expect(screen.getByText('Romania')).toBeInTheDocument()
    expect(screen.getByText('0:00 / 3:05')).toBeInTheDocument()
  })

  test('during the tour a song repeats until the tour lets it end, and can jump to its last seconds', async () => {
    setup(playing(hora))
    await waitFor(() => expect(audio().src).toBe('fdp-media://file/101'))
    expect(audio().loop).toBe(false)
    act(() => tourAudio.setLoop(true))
    expect(audio().loop).toBe(true)
    Object.defineProperty(audio(), 'duration', { value: 185, configurable: true })
    act(() => tourAudio.jumpNearEnd())
    expect(audio().currentTime).toBeCloseTo(180, 0)
    act(() => tourAudio.setLoop(false))
    expect(audio().loop).toBe(false)
  })

  test('a double-click on ▶ or ⏸ counts as one press', async () => {
    const fake = setup(playerState({ nextUp: item(1, hora) }))
    const play = await screen.findByRole('button', { name: 'Play' })
    fireEvent.click(play, { detail: 1 })
    fireEvent.click(play, { detail: 2 })
    expect(fake.callsTo('player:play')).toHaveLength(1)
    act(() => fake.emit('player:state', playing(hora)))
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }), { detail: 2 })
    expect(fake.callsTo('player:pause')).toEqual([])
  })

  test('stopped: the song stays loaded at its start, and ▶ plays it again', async () => {
    const fake = setup(playing(hora))
    await waitFor(() => expect(audio().src).toContain('101'))
    audio().currentTime = 42
    act(() => fake.emit('player:state', { ...playing(hora), status: 'stopped' }))
    expect(audio().currentTime).toBe(0)
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    expect(title()).toHaveTextContent('Hora')
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(fake.callsTo('player:play')).toHaveLength(1)
  })

  test('transport buttons show matching drawn icons, not emoji characters', async () => {
    setup(playing(hora))
    for (const name of ['Restart song', 'Pause', 'Stop', 'Next']) {
      const button = await screen.findByRole('button', { name })
      expect(button.querySelector('svg')).not.toBeNull()
      expect(button.textContent).toBe('')
    }
  })

  test('transport buttons send pause, stop and next', async () => {
    const fake = setup(playing(hora))
    await userEvent.click(await screen.findByRole('button', { name: 'Pause' }))
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(fake.callsTo('player:pause')).toHaveLength(1)
    expect(fake.callsTo('player:stop')).toHaveLength(1)
    expect(fake.callsTo('player:next')).toHaveLength(1)
  })

  test('◀◀ asks main to restart; the audio rewinds when the restart count changes', async () => {
    const fake = setup(playing(hora))
    await waitFor(() => expect(audio().src).toContain('101'))
    audio().currentTime = 42
    await userEvent.click(screen.getByRole('button', { name: 'Restart song' }))
    expect(fake.callsTo('player:restart')).toEqual([[]])
    expect(audio().currentTime).toBe(42) // main decides; the remote's back button goes there too
    const state = playing(hora)
    act(() => fake.emit('player:state', { ...state, current: { ...state.current!, restarts: 1 } }))
    expect(audio().currentTime).toBe(0)
  })

  test('reports the end of the song, and a song that can’t be played, with its play id', async () => {
    const fake = setup(playing(hora, {}, 7))
    await waitFor(() => expect(audio().src).toContain('101'))
    fireEvent(audio(), new Event('ended'))
    expect(fake.callsTo('player:ended')).toEqual([[7]])
    Object.defineProperty(audio(), 'error', { configurable: true, value: { code: 4 } })
    fireEvent(audio(), new Event('error'))
    expect(fake.callsTo('player:failed')).toEqual([
      [7, "the file can't be read or isn't a supported format"]
    ])
  })

  test('shows the countdowns before the first song and between songs', async () => {
    const fake = setup(
      playerState({
        status: 'countdown',
        countdown: { secondsLeft: 3, reason: 'start' },
        nextUp: item(1, hora)
      })
    )
    await waitFor(() => expect(title()).toHaveTextContent('Starting in 3…'))
    act(() =>
      fake.emit(
        'player:state',
        playerState({
          status: 'countdown',
          countdown: { secondsLeft: 2, reason: 'continue' },
          nextUp: item(1, hora)
        })
      )
    )
    expect(title()).toHaveTextContent('Next: Hora in 2…')
  })

  test('a long dance name shortens on its own, so the countdown stays readable', async () => {
    setup(
      playerState({
        status: 'countdown',
        countdown: { secondsLeft: 2, reason: 'continue' },
        nextUp: item(1, hora)
      })
    )
    await waitFor(() => expect(title()).toHaveTextContent('Next: Hora in 2…'))
    // Only the name is in the part that ellipsizes; "Next:" and "in 2…" stay whole.
    expect(screen.getByTestId('player-title-name')).toHaveTextContent(/^Hora$/)
  })

  test('playing: the dance is the title and ♪ song is a smaller line under it', async () => {
    const t = track(102, 'Pusteno Ludo', {
      label: 'Pravo Rhodopsko Oro ♪ Pusteno Ludo',
      parts: { song: 'Pusteno Ludo', dance: 'Pravo Rhodopsko Oro', choreographer: null }
    })
    setup(playing(t))
    await waitFor(() =>
      expect(screen.getByTestId('player-title-name')).toHaveTextContent(/^Pravo Rhodopsko Oro$/)
    )
    expect(screen.getByTestId('player-song')).toHaveTextContent('♪ Pusteno Ludo')
  })

  test('playing: no ♪ line when song and dance match', async () => {
    setup(playing(hora))
    await waitFor(() => expect(title()).toHaveTextContent('Hora'))
    expect(screen.queryByTestId('player-song')).toBeNull()
  })

  test('playing: the choreographer stays with the dance', async () => {
    const t = track(103, 'Pusteno Ludo', {
      parts: { song: 'Pusteno Ludo', dance: 'Pravo Rhodopsko Oro', choreographer: 'Yves Moreau' }
    })
    setup(playing(t))
    await waitFor(() =>
      expect(screen.getByTestId('player-title-name')).toHaveTextContent(
        /^Pravo Rhodopsko Oro \(Yves Moreau\)$/
      )
    )
  })

  test('marks a preview, and keeps the speed and pitch on the audio element', async () => {
    const fake = setup(playing(hora, { speed: 0.75 }))
    await waitFor(() => expect(audio().playbackRate).toBe(0.75))
    expect(audio().preservesPitch).toBe(true)
    act(() =>
      fake.emit('player:state', {
        ...playing(hora, { speed: 0.75 }, 2),
        current: {
          playId: 2,
          source: 'preview',
          itemId: null,
          track: hora,
          restarts: 0,
          logId: null
        }
      })
    )
    expect(screen.getByText('Preview')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep speed for the next song' }))
    expect(fake.callsTo('player:setSpeedLocked')).toEqual([[true]])
  })

  test('auto-continue and its seconds are set from the bar', async () => {
    const fake = setup(playerState({ autoContinue: { enabled: true, seconds: 5 } }))
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Auto-continue' }))
    expect(fake.callsTo('player:setAutoContinue')).toEqual([[{ enabled: false }]])
    const seconds = screen.getByRole('textbox', { name: 'Auto-continue after (seconds)' })
    await userEvent.clear(seconds)
    await userEvent.type(seconds, '8')
    await userEvent.tab()
    expect(fake.callsTo('player:setAutoContinue')).toEqual([[{ enabled: false }], [{ seconds: 8 }]])
  })

  test('auto-show (the view over the laptop while playing) and its seconds are set from the bar', async () => {
    const fake = setup(playerState())
    const autoShow = await screen.findByRole('checkbox', { name: 'Auto-show when playing' })
    await waitFor(() => expect(autoShow).toBeChecked())
    await userEvent.click(autoShow)
    expect(fake.callsTo('settings:set')).toEqual([['autoFullscreen.enabled', false]])
    expect(autoShow).not.toBeChecked()
    const seconds = screen.getByRole('textbox', { name: 'Auto-show after (seconds)' })
    expect(seconds).toHaveValue('15')
    await userEvent.clear(seconds)
    await userEvent.type(seconds, '30')
    await userEvent.tab()
    expect(fake.callsTo('settings:set').at(-1)).toEqual(['autoFullscreen.seconds', 30])
    // Below the 5 s minimum: nothing is saved, and the field shows the saved value again.
    await userEvent.clear(seconds)
    await userEvent.type(seconds, '2')
    await userEvent.tab()
    expect(fake.callsTo('settings:set')).toHaveLength(2)
    expect(seconds).toHaveValue('30')
  })

  test('two rows: transport, song, speed, volume and the projector; then position and auto-continue', async () => {
    setup(playerState())
    const top = await screen.findByTestId('player-row-1')
    const bottom = screen.getByTestId('player-row-2')
    for (const name of ['Play', 'Next'])
      expect(within(top).getByRole('button', { name })).toBeInTheDocument()
    expect(
      within(top).getByRole('button', { name: 'Keep speed for the next song' })
    ).toBeInTheDocument()
    expect(within(top).getByRole('switch', { name: 'Projector' })).toBeInTheDocument()
    expect(
      within(top).getByRole('checkbox', { name: 'Auto-show when playing' })
    ).toBeInTheDocument()
    expect(within(bottom).getByRole('checkbox', { name: 'Auto-continue' })).toBeInTheDocument()
  })

  test('reports the playing song’s position, for the projector’s red line', async () => {
    const fake = setup(playing(hora, {}, 7))
    await waitFor(() => expect(audio().src).toContain('101'))
    audio().currentTime = 12
    fireEvent(audio(), new Event('timeupdate'))
    expect(fake.callsTo('projector:reportProgress').at(-1)).toEqual([7, 12_000, 185_000])
  })

  test('the projector switch turns projector mode on, and shows where it is and any notice', async () => {
    const fake = setup(playerState())
    await userEvent.click(await screen.findByRole('switch', { name: 'Projector' }))
    expect(fake.callsTo('projector:setEnabled')).toEqual([[true]])
    act(() =>
      fake.emit('projector:status', {
        enabled: true,
        open: true,
        mode: 'laptop',
        display: 'Built-in Retina Display',
        notice:
          'No separate display — showing on this screen (move the mouse or press Esc to close)'
      })
    )
    expect(screen.getByRole('switch', { name: 'Projector' })).toBeChecked()
    expect(screen.getByText(/No separate display/)).toBeInTheDocument()
    act(() =>
      fake.emit('projector:status', {
        enabled: true,
        open: true,
        mode: 'projector',
        display: 'Epson',
        notice: null
      })
    )
    expect(screen.getByText('On Epson')).toBeInTheDocument()
  })

  test('shows a warning until it is dismissed', async () => {
    const fake = setup(playerState({ warning: 'Skipped missing file: Hora' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Skipped missing file: Hora')
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss warning' }))
    expect(fake.callsTo('player:dismissWarning')).toHaveLength(1)
  })
})
