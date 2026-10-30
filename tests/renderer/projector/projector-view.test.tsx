import { render, screen, within } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ProjectorEntry, ProjectorSnapshot } from '@shared/projector'
import { formatClock } from '@shared/program-time'
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
  played: [hora, misirlou],
  tailMs: 20 * 60_000
}

const region = (name: string) => screen.getByRole('region', { name })

describe('the ending time in the footer', () => {
  const START = new Date(2026, 9, 30, 20, 0, 0)
  const clocked = () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(START)
  }
  const footer = () => screen.queryByRole('contentinfo', { name: 'Ending time' })
  afterEach(() => vi.useRealTimers())

  test('shows when the program will end: what is left of the song, then the rest', () => {
    clocked()
    render(
      <ProjectorView
        snapshot={playing}
        progress={{ playId: 4, positionMs: 60_000, durationMs: 180_000 }}
      />
    )
    // 2:00 of Pravo is left, and 20:00 after it
    expect(footer()).toHaveTextContent(
      `Ending about ${formatClock(START.getTime() + 120_000 + 20 * 60_000)}`
    )
  })

  test('while paused it moves later as the clock runs', () => {
    clocked()
    const paused: ProjectorSnapshot = {
      ...playing,
      middle: { kind: 'now', entry: pravo, playId: 4, paused: true }
    }
    render(
      <ProjectorView
        snapshot={paused}
        progress={{ playId: 4, positionMs: 60_000, durationMs: 180_000 }}
      />
    )
    act(() => void vi.advanceTimersByTime(3 * 60_000))
    expect(footer()).toHaveTextContent(
      `Ending about ${formatClock(START.getTime() + 3 * 60_000 + 120_000 + 20 * 60_000)}`
    )
  })

  test('before the song reports progress, the rest of the program is what counts', () => {
    clocked()
    render(<ProjectorView snapshot={playing} progress={null} />)
    expect(footer()).toHaveTextContent(`Ending about ${formatClock(START.getTime() + 20 * 60_000)}`)
  })

  test('a progress report for another play is ignored', () => {
    clocked()
    render(
      <ProjectorView
        snapshot={playing}
        progress={{ playId: 99, positionMs: 60_000, durationMs: 180_000 }}
      />
    )
    expect(footer()).toHaveTextContent(`Ending about ${formatClock(START.getTime() + 20 * 60_000)}`)
  })

  test('nothing is shown without a program or without a time', () => {
    clocked()
    const { rerender } = render(
      <ProjectorView snapshot={{ ...playing, tailMs: null }} progress={null} />
    )
    expect(footer()).toBeNull()
    rerender(<ProjectorView snapshot={{ ...playing, hasProgram: false }} progress={null} />)
    expect(footer()).toBeNull()
  })

  test('never shows the total or the pauses note', () => {
    clocked()
    render(<ProjectorView snapshot={playing} progress={null} />)
    expect(screen.queryByText(/Total play time|no pauses/)).toBeNull()
  })
})

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

  test('previously played is listed oldest first, the newest last, with countries; a missing country is left blank', () => {
    render(<ProjectorView snapshot={playing} progress={null} />)
    const rows = within(region('Previously played')).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      'Hora Mare♪ Hora de la MunteRomania',
      'Misirlou'
    ])
  })

  test('the newest previously played song is last, in the section just above Now Playing', () => {
    render(<ProjectorView snapshot={playing} progress={null} />)
    expect(region('Previously played').nextElementSibling).toBe(region('Now playing'))
    const rows = within(region('Previously played')).getAllByRole('listitem')
    expect(rows.at(-1)).toHaveTextContent('Misirlou')
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

  test('a loaded program with nothing left, played or playing shows the logo, not a blank screen', () => {
    render(
      <ProjectorView
        snapshot={{ hasProgram: true, middle: null, upcoming: [], played: [], tailMs: null }}
        progress={null}
      />
    )
    expect(screen.getByTestId('logo')).toBeInTheDocument()
    expect(screen.getByText('Folk Dance Player')).toBeInTheDocument()
  })

  test('with no program and nothing playing, only the app’s name', () => {
    render(
      <ProjectorView
        snapshot={{ hasProgram: false, middle: null, upcoming: [], played: [], tailMs: null }}
        progress={null}
      />
    )
    expect(screen.getByText('Folk Dance Player')).toBeInTheDocument()
    expect(screen.getByTestId('logo')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Now playing' })).toBeNull()
  })

  describe('with a Canva slide (spec §8.3)', () => {
    const slide = {
      kind: 'canva' as const,
      deckId: 1,
      pageId: 'P6',
      imageUrl: 'fdp-media://slide/1/P6?v=1',
      live: false
    }
    const withSlide: ProjectorSnapshot = {
      ...playing,
      middle: { kind: 'now', entry: pravo, playId: 4, paused: false, slide }
    }

    test('the saved image sits top right, sized to the slide box, beside Previously played', () => {
      render(<ProjectorView snapshot={withSlide} progress={null} />)
      const image = screen.getByRole('img', { name: 'Slide for Pravo Rhodopsko Oro' })
      expect(image).toHaveAttribute('src', slide.imageUrl)
      // jsdom's window is 1024×768: the box is 16:9 within two-thirds of the width, the top half.
      expect(image.parentElement).toHaveStyle({ width: '628px', height: '353px' })
      const top = screen.getByTestId('slide-row')
      expect(within(top).getByRole('region', { name: 'Previously played' })).toBeInTheDocument()
      expect(within(region('Now playing')).getByText('♪ Pusteno Ludo')).toBeInTheDocument()
    })

    test('beside the slide, previously played still reads oldest to newest', () => {
      render(
        <ProjectorView snapshot={{ ...withSlide, played: [hora, misirlou] }} progress={null} />
      )
      const rows = within(region('Previously played')).getAllByRole('listitem')
      expect(rows.map((r) => r.textContent)).toEqual(['Hora Mare', 'Misirlou'])
    })

    test('beside the slide, previously played shows titles only (the column is narrow)', () => {
      render(<ProjectorView snapshot={withSlide} progress={null} />)
      const played = region('Previously played')
      expect(within(played).getByText('Misirlou')).toBeInTheDocument()
      expect(within(played).queryByText('Romania')).toBeNull()
      expect(within(played).queryByText('♪ Hora de la Munte')).toBeNull()
    })

    test('a live slide with no saved image keeps the area, for the live view to cover', () => {
      render(
        <ProjectorView
          snapshot={{
            ...withSlide,
            middle: { ...withSlide.middle!, slide: { ...slide, imageUrl: null, live: true } }
          }}
          progress={null}
        />
      )
      expect(screen.queryByRole('img')).toBeNull()
      expect(screen.getByTestId('slide-area')).toBeInTheDocument()
    })

    test('follows the window size', () => {
      render(<ProjectorView snapshot={withSlide} progress={null} />)
      act(() => {
        window.innerWidth = 1920
        window.innerHeight = 1080
        window.dispatchEvent(new Event('resize'))
      })
      expect(screen.getByTestId('slide-area')).toHaveStyle({ width: '902px', height: '508px' })
      window.innerWidth = 1024
      window.innerHeight = 768
    })

    test('an image slide is drawn in the same slide area and layout', () => {
      const image = { kind: 'image' as const, imageUrl: 'fdp-media://dance-image/7?v=7-ab.png' }
      render(
        <ProjectorView
          snapshot={{
            ...playing,
            middle: { kind: 'now', entry: pravo, playId: 4, paused: false, slide: image }
          }}
          progress={null}
        />
      )
      expect(screen.getByTestId('slide-row')).toBeInTheDocument()
      expect(screen.getByTestId('slide-area')).toBeInTheDocument()
      expect(screen.getByRole('img', { name: /Slide for/ })).toHaveAttribute('src', image.imageUrl)
    })

    test('without a slide the layout is unchanged', () => {
      render(<ProjectorView snapshot={playing} progress={null} />)
      expect(screen.queryByTestId('slide-area')).toBeNull()
    })
  })
})
