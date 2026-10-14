import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { ProjectorEntry, ProjectorSnapshot } from '@shared/projector'
import ProjectorView from '@renderer/projector/ProjectorView'

const pravo: ProjectorEntry = {
  parts: { song: 'Pusteno Ludo', dance: 'Pravo Rhodopsko Oro', choreographer: 'Yves Moreau' },
  country: 'Bulgaria'
}
const svornato: ProjectorEntry = {
  parts: { song: null, dance: 'Svornato', choreographer: 'Jaap Leegwater' },
  country: 'Bulgaria'
}
const hora: ProjectorEntry = {
  parts: { song: 'Hora de la Munte', dance: 'Hora Mare', choreographer: null },
  country: 'Romania'
}
const misirlou: ProjectorEntry = {
  parts: { song: null, dance: 'Misirlou', choreographer: null },
  country: null
}

const playing: ProjectorSnapshot = {
  hasProgram: true,
  middle: { kind: 'now', entry: pravo, playId: 4, paused: false },
  upcoming: [
    { kind: 'dance', entry: svornato },
    { kind: 'teaching' },
    { kind: 'dance', entry: hora }
  ],
  played: [misirlou, hora]
}

const region = (name: string) => screen.getByRole('region', { name })

describe('projector view (spec §8.2)', () => {
  test('Now Playing: the dance large with its choreographer, ♪ the song below, the country right', () => {
    render(<ProjectorView snapshot={playing} progress={null} />)
    const now = region('Now playing')
    expect(within(now).getByText('Pravo Rhodopsko Oro (Yves Moreau)')).toBeInTheDocument()
    expect(within(now).getByText('♪ Pusteno Ludo')).toBeInTheDocument()
    expect(within(now).getByText('Bulgaria')).toBeInTheDocument()
  })

  test('the red line shows how far the playing song has got; another play’s position is ignored', () => {
    const { rerender } = render(
      <ProjectorView
        snapshot={playing}
        progress={{ playId: 4, positionMs: 45_000, durationMs: 180_000 }}
      />
    )
    expect(screen.getByTestId('progress')).toHaveStyle({ width: '25%' })
    rerender(
      <ProjectorView
        snapshot={playing}
        progress={{ playId: 3, positionMs: 90_000, durationMs: 180_000 }}
      />
    )
    expect(screen.getByTestId('progress')).toHaveStyle({ width: '0%' })
  })

  test('Up Next lists dances with ♪ songs on the same line, and a Teaching row before a taught dance', () => {
    render(<ProjectorView snapshot={playing} progress={null} />)
    const rows = within(region('Up next')).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      'Svornato (Jaap Leegwater)Bulgaria',
      'Teaching',
      'Hora Mare♪ Hora de la MunteRomania'
    ])
    expect(rows[1].querySelectorAll('svg')).toHaveLength(2) // ⌄ arrows pointing at the dance
  })

  test('previously played is listed newest first with countries; a missing country is left blank', () => {
    render(<ProjectorView snapshot={playing} progress={null} />)
    const rows = within(region('Previously played')).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      'Misirlou',
      'Hora Mare♪ Hora de la MunteRomania'
    ])
  })

  test('a paused or stopped song says so', () => {
    render(
      <ProjectorView
        snapshot={{ ...playing, middle: { kind: 'now', entry: svornato, playId: 4, paused: true } }}
        progress={null}
      />
    )
    expect(within(region('Now playing')).getByText('Paused')).toBeInTheDocument()
  })

  test('nothing playing: the next dance in the middle, with the countdown, and what comes after it', () => {
    const next = (
      countdown: { secondsLeft: number; reason: 'start' | 'continue' } | null,
      teaching = false
    ) =>
      ({
        ...playing,
        middle: { kind: 'next', entry: hora, countdown, teaching },
        upcoming: [{ kind: 'dance', entry: svornato }]
      }) as ProjectorSnapshot
    const { rerender } = render(<ProjectorView snapshot={next(null)} progress={null} />)
    expect(within(region('Up next')).getByText('Hora Mare')).toBeInTheDocument()
    expect(within(region('After that')).getByText('Svornato (Jaap Leegwater)')).toBeInTheDocument()
    rerender(<ProjectorView snapshot={next({ secondsLeft: 3, reason: 'start' })} progress={null} />)
    expect(within(region('Up next')).getByText('Starting in 3…')).toBeInTheDocument()
    rerender(
      <ProjectorView snapshot={next({ secondsLeft: 2, reason: 'continue' })} progress={null} />
    )
    expect(within(region('Up next')).getByText('Next in 2…')).toBeInTheDocument()
    rerender(<ProjectorView snapshot={next(null, true)} progress={null} />)
    expect(within(region('Up next')).getByText('Teaching')).toBeInTheDocument()
  })

  test('with no program and nothing playing, only the app’s name', () => {
    render(
      <ProjectorView
        snapshot={{ hasProgram: false, middle: null, upcoming: [], played: [] }}
        progress={null}
      />
    )
    expect(screen.getByText('Folk Dance Player')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Now playing' })).toBeNull()
  })
})
