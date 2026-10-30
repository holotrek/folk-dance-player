import { useEffect, useState } from 'react'
import type { LabelParts } from '@shared/labels'
import {
  slideBox,
  type ProjectorEntry,
  type ProjectorProgress,
  type ProjectorSnapshot
} from '@shared/projector'
import { formatClock } from '@shared/program-time'
import { ChevronDownIcon } from '../components/icons'
import Logo from '../components/Logo'
import { useNow } from '../program/useNow'
import classes from './ProjectorView.module.css'

// The large part of a label: the dance, and the choreographer when the label needs it (spec §4).
const dance = (parts: LabelParts): string =>
  parts.choreographer ? `${parts.dance} (${parts.choreographer})` : parts.dance

// A list row: the dance and (smaller, only when it differs) ♪ the song on the left; the country on
// the right. `titleOnly` (previously played beside a slide, a narrow column) shows just the dance.
function Row({
  entry,
  titleOnly = false
}: {
  entry: ProjectorEntry
  titleOnly?: boolean
}): React.JSX.Element {
  return (
    <li className={classes.row}>
      <span className={classes.name}>
        <span className={classes.dance}>{dance(entry.parts)}</span>
        {!titleOnly && entry.parts.song && (
          <span className={classes.song}>♪ {entry.parts.song}</span>
        )}
      </span>
      {!titleOnly && <span className={classes.country}>{entry.country}</span>}
    </li>
  )
}

// ⌄ —— Teaching —— ⌄, pointing down at the dance that will be taught.
function Teaching({ as: Tag = 'li' }: { as?: 'li' | 'div' }): React.JSX.Element {
  return (
    <Tag className={classes.teaching}>
      <ChevronDownIcon size={28} />
      <span className={classes.rule} />
      <span>Teaching</span>
      <span className={classes.rule} />
      <ChevronDownIcon size={28} />
    </Tag>
  )
}

function percent(snapshot: ProjectorSnapshot, progress: ProjectorProgress | null): number {
  const { middle } = snapshot
  if (middle?.kind !== 'now' || !progress || progress.playId !== middle.playId) return 0
  if (!progress.durationMs) return 0
  return Math.min(100, Math.max(0, (progress.positionMs / progress.durationMs) * 100))
}

function useWindowSize(): { width: number; height: number } {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight })
  const [size, setSize] = useState(read)
  useEffect(() => {
    const update = () => setSize(read())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return size
}

// Spec §8.2: previously played across the top, then what's playing (or the next dance), then the
// rest of the program. With a Canva slide (§8.3) the top half is shared: previously played on the
// left, the slide on the right, in the box main lays its live view over. It only renders.
export default function ProjectorView({
  snapshot,
  progress
}: {
  snapshot: ProjectorSnapshot
  progress: ProjectorProgress | null
}): React.JSX.Element {
  const { middle, upcoming, played } = snapshot
  const size = useWindowSize()
  const now = useNow()
  // Nothing to show (no program, or one with nothing left, played or playing): the logo, never
  // a blank screen.
  if (!middle && upcoming.length === 0 && played.length === 0) {
    return (
      <div className={classes.screen}>
        <div className={classes.empty}>
          <Logo size="32vh" />
          <div>Folk Dance Player</div>
        </div>
      </div>
    )
  }
  const nextHeading =
    middle?.kind === 'next' && middle.countdown
      ? middle.countdown.reason === 'start'
        ? `Starting in ${middle.countdown.secondsLeft}…`
        : `Next in ${middle.countdown.secondsLeft}…`
      : 'Up next'
  const slide = middle?.slide
  // When the program will end: what is left of the song that is playing (from its progress; a
  // paused song's stays put while the clock runs on), then the rest of the program (0.3.0 §3.9).
  const left =
    middle?.kind === 'now' && progress?.playId === middle.playId && progress.durationMs !== null
      ? Math.max(progress.durationMs - progress.positionMs, 0)
      : 0
  const endsAt =
    snapshot.hasProgram && middle && snapshot.tailMs !== null ? now + left + snapshot.tailMs : null
  const box = slide ? slideBox(size.width, size.height) : null
  const playedList = played.length > 0 && (
    <section className={classes.played} aria-label="Previously played">
      <h2 className={classes.heading}>Previously played</h2>
      <ul className={classes.list}>
        {played.map((entry, i) => (
          <Row key={i} entry={entry} titleOnly={box !== null} />
        ))}
      </ul>
    </section>
  )
  return (
    <div className={classes.screen}>
      {slide && box ? (
        <div className={classes.slideRow} style={{ height: box.height }} data-testid="slide-row">
          {playedList || <div />}
          <div
            className={classes.slideArea}
            style={{ width: box.width, height: box.height }}
            data-testid="slide-area"
          >
            {slide.imageUrl && (
              <img
                className={classes.slideImage}
                src={slide.imageUrl}
                alt={`Slide for ${middle.entry.parts.dance}`}
              />
            )}
          </div>
        </div>
      ) : (
        playedList
      )}
      {middle && (
        <section
          className={classes.middle}
          aria-label={middle.kind === 'now' ? 'Now playing' : 'Up next'}
        >
          <h2 className={classes.heading}>
            {middle.kind === 'now' ? 'Now playing' : nextHeading}
            {middle.kind === 'now' && middle.paused && (
              <span className={classes.paused}>Paused</span>
            )}
          </h2>
          {middle.kind === 'next' && middle.teaching && <Teaching as="div" />}
          <div className={classes.nowLine}>
            <span className={classes.nowDance}>{dance(middle.entry.parts)}</span>
            <span className={classes.nowCountry}>{middle.entry.country}</span>
          </div>
          {middle.entry.parts.song && (
            <div className={classes.nowSong}>♪ {middle.entry.parts.song}</div>
          )}
          {middle.kind === 'now' && (
            <div className={classes.track}>
              <div
                className={classes.bar}
                data-testid="progress"
                style={{ width: `${percent(snapshot, progress)}%` }}
              />
            </div>
          )}
        </section>
      )}
      {upcoming.length > 0 && (
        <section
          className={classes.upcoming}
          aria-label={middle?.kind === 'next' ? 'After that' : 'Up next'}
        >
          <h2 className={classes.heading}>{middle?.kind === 'next' ? 'After that' : 'Up next'}</h2>
          <ul className={classes.list}>
            {upcoming.map((row, i) =>
              row.kind === 'teaching' ? <Teaching key={i} /> : <Row key={i} entry={row.entry} />
            )}
          </ul>
        </section>
      )}
      {endsAt !== null && (
        <footer className={classes.ending} aria-label="Ending time">
          Ending about {formatClock(endsAt)}
        </footer>
      )}
    </div>
  )
}
