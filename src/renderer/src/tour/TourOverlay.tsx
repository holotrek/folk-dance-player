import { useEffect, useLayoutEffect, useState } from 'react'
import { Button, Group, Modal, Popover, Stack, Text } from '@mantine/core'
import type { TourStep } from './steps'
import classes from './TourOverlay.module.css'

const MARGIN = 6 // the hole is a little larger than what it lights up
const POLL_MS = 150 // layout moves (a dialog opens, a list scrolls): follow it
const GONE_MS = 700 // a target missing for less than this is a re-render, not a missing target

export interface Hole {
  x: number
  y: number
  w: number
  h: number
}

const MAX_SCROLLS = 6 // tries to bring a target into view before leaving it as it is

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

const box = (r: DOMRect): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })

// The part of `el` that can actually be seen: its box cut down to the window and to every ancestor
// that scrolls or clips, so a tall panel half below the fold is lit only where it shows.
function visibleBox(el: HTMLElement): Box {
  let seen = box(el.getBoundingClientRect())
  const view = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  const cut = (b: Box): void => {
    seen = {
      left: Math.max(seen.left, b.left),
      top: Math.max(seen.top, b.top),
      right: Math.min(seen.right, b.right),
      bottom: Math.min(seen.bottom, b.bottom)
    }
  }
  cut(view)
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(p)
    if (/(auto|scroll|hidden|clip)/.test(overflowX + overflowY)) cut(box(p.getBoundingClientRect()))
  }
  return seen
}

// Whole in view, or as much as fits: a target taller than its panel is in view once it fills it.
function inView(el: HTMLElement): boolean {
  const full = el.getBoundingClientRect()
  const seen = visibleBox(el)
  const shown = Math.max(0, seen.bottom - seen.top)
  const wanted = Math.min(full.height, window.innerHeight)
  return shown >= wanted - 2 && seen.right > seen.left
}

const CARD_H = 260 // about as tall as a card gets, with its arrow and gap
const CARD_W = 380

// The side the card opens on: the step's choice (below by default) when the card fits there,
// otherwise the opposite side if it fits, since a card past the window's edge cannot be scrolled
// into view. Left alone when neither fits.
export function sideFor(want: NonNullable<TourStep['placement']>, hole: Hole): typeof want {
  const room = {
    top: hole.y,
    bottom: window.innerHeight - (hole.y + hole.h),
    left: hole.x,
    right: window.innerWidth - (hole.x + hole.w)
  }
  const need = (side: typeof want): number =>
    side === 'top' || side === 'bottom' ? CARD_H : CARD_W
  const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const
  if (room[want] >= need(want)) return want
  return room[opposite[want]] >= need(want) ? opposite[want] : want
}

const ids = (target: TourStep['target']): string[] =>
  target === undefined ? [] : Array.isArray(target) ? target : [target]

// Where the step's targets are on screen. `undefined`: not measured yet (nothing is shown for it);
// `null`: it has been missing for a while; otherwise one hole per target.
export function useHoles(target: TourStep['target']): Hole[] | null | undefined {
  const key = ids(target).join('|')
  const [holes, setHoles] = useState<Hole[] | null | undefined>(undefined)
  // A layout effect, so the first measurement lands before the first paint: no frame shows a card
  // for a target that is merely about to be found, or the previous step's outline.
  useLayoutEffect(() => {
    setHoles(undefined)
    let scrolls = 0
    let lastSeen = Date.now()
    // Missing now: keep what we have for a moment, so a re-render doesn't flip the step to "not on
    // screen" (whose card would sit over the screen and catch the pointer).
    const missing = (): void => {
      if (Date.now() - lastSeen > GONE_MS) setHoles(null)
    }
    const measure = (): void => {
      const found = ids(target).map((id) =>
        document.querySelector<HTMLElement>(`[data-tour="${id}"]`)
      )
      if (found.length === 0 || found.some((el) => el === null)) return missing()
      const rects = found.map((el) => el!.getBoundingClientRect())
      if (rects.some((r) => r.width === 0 && r.height === 0)) return missing()
      lastSeen = Date.now()
      // The tour locks the person's scrolling, so it scrolls the target into view itself: to its top
      // when it is taller than its panel (the dances, say), else only as far as needed.
      const first = found[0]!
      if (scrolls < MAX_SCROLLS && !inView(first)) {
        scrolls++
        const tall = first.getBoundingClientRect().height > window.innerHeight * 0.6
        first.scrollIntoView?.({ block: tall ? 'start' : 'nearest', inline: 'nearest' })
      }
      const next = found.map((el) => {
        const b = visibleBox(el!)
        return {
          x: Math.round(b.left - MARGIN),
          y: Math.round(b.top - MARGIN),
          w: Math.round(b.right - b.left + 2 * MARGIN),
          h: Math.round(b.bottom - b.top + 2 * MARGIN)
        }
      })
      setHoles((old) => (old && JSON.stringify(old) === JSON.stringify(next) ? old : next))
    }
    measure()
    const timer = setInterval(measure, POLL_MS)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      clearInterval(timer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the target's identity
  }, [key])
  return holes
}

// The whole window with a hole cut out for each target (even-odd), so only the holes take clicks.
const clip = (holes: Hole[]): string | undefined =>
  holes.length === 0
    ? undefined
    : `path(evenodd, "M0 0H${window.innerWidth}V${window.innerHeight}H0Z ${holes
        .map((h) => `M${h.x} ${h.y}h${h.w}v${h.h}h${-h.w}Z`)
        .join(' ')}")`

export interface TourOverlayProps {
  step: TourStep
  placement?: TourStep['placement']
  index: number
  total: number
  onNext(): void
  onChoose(choice: string): void
  onLeave(): void // the person confirmed leaving
  onGoThere(): void // "Take me there": back to the step's page
}

const paragraphs = (text: string): React.JSX.Element[] =>
  text.split(/\n\n/).map((p, i) => (
    <Text key={i} size="sm">
      {p}
    </Text>
  ))

// One step of the tour on screen (tour spec §2.3): the dim layer with its holes and rings, and a
// popover pointing at the first target, or a centered card for an intro, a choice, or a target
// that isn't on screen. Escape and Leave the tour both ask before leaving.
export default function TourOverlay(props: TourOverlayProps): React.JSX.Element {
  const { step } = props
  const holes = useHoles(step.target)
  const [asking, setAsking] = useState(false)
  // No scrolling during a step, by wheel or touch, and no scrollbars: the popover and the hole follow
  // their target, so a scrolled panel would drag the tour around. Steps that need it say so.
  useEffect(() => {
    if (props.step.scroll) return
    const stop = (e: Event): void => {
      if (e.cancelable) e.preventDefault()
    }
    document.addEventListener('wheel', stop, { passive: false, capture: true })
    document.addEventListener('touchmove', stop, { passive: false, capture: true })
    document.documentElement.setAttribute('data-tour-lock', '')
    return () => {
      document.removeEventListener('wheel', stop, true)
      document.removeEventListener('touchmove', stop, true)
      document.documentElement.removeAttribute('data-tour-lock')
    }
  }, [props.step.scroll])
  // While the person drags something, the popover steps aside: it could be over the drop.
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const start = (): void => setDragging(true)
    const stop = (): void => setDragging(false)
    document.addEventListener('dragstart', start, true)
    document.addEventListener('dragend', stop, true)
    document.addEventListener('drop', stop, true)
    return () => {
      document.removeEventListener('dragstart', start, true)
      document.removeEventListener('dragend', stop, true)
      document.removeEventListener('drop', stop, true)
    }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAsking(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const counter = `Step ${props.index + 1} of ${props.total}`
  const leave = (
    <Button variant="subtle" color="gray" size="compact-xs" onClick={() => setAsking(true)}>
      Leave the tour
    </Button>
  )
  const lit = Array.isArray(holes) && holes.length > 0
  // The "not on screen" card is only for a target that has been missing a while, not one that has
  // not been measured yet.
  const centered = holes === null

  const card = (
    <Stack gap="xs">
      {paragraphs(step.body)}
      <Group justify="space-between" mt="xs">
        <Text size="xs" c="dimmed">
          {counter}
        </Text>
        <Group gap="xs">
          {leave}
          {step.kind === 'explain' && (
            <Button size="compact-sm" aria-label="Next step" onClick={props.onNext}>
              Next
            </Button>
          )}
        </Group>
      </Group>
    </Stack>
  )

  return (
    <>
      <div
        className={classes.blocker}
        data-testid="tour-blocker"
        data-holes={(holes ?? []).map((h) => `${h.x},${h.y},${h.w},${h.h}`).join(';')}
        style={{ clipPath: clip(holes ?? []) }}
      />
      {(holes ?? []).map((h, i) => (
        <div
          key={i}
          className={classes.ring}
          style={{ left: h.x, top: h.y, width: h.w, height: h.h }}
        />
      ))}

      {lit && step.kind !== 'choice' && step.kind !== 'intro' && (
        <Popover
          opened={!dragging}
          position={sideFor(props.placement ?? 'bottom', holes[0])}
          withArrow
          offset={16}
          // Whichever side has room: a card past the window's edge cannot be scrolled into view.
          middlewares={{ flip: { padding: 8 }, shift: { padding: 8 } }}
          zIndex={400}
          shadow="lg"
          transitionProps={{ duration: 0 }}
        >
          <Popover.Target>
            <div
              className={classes.anchor}
              style={{ left: holes[0].x, top: holes[0].y, width: holes[0].w, height: holes[0].h }}
            />
          </Popover.Target>
          <Popover.Dropdown className={classes.popover}>
            <Stack gap="xs">
              <Text fw={600}>{step.title}</Text>
              {card}
            </Stack>
          </Popover.Dropdown>
        </Popover>
      )}

      <Modal
        opened={centered || step.kind === 'choice' || step.kind === 'intro'}
        onClose={() => undefined}
        title={step.title}
        centered
        withCloseButton={false}
        closeOnEscape={false}
        closeOnClickOutside={false}
        zIndex={400}
        withOverlay={false}
        styles={{ inner: { pointerEvents: 'none' }, content: { pointerEvents: 'auto' } }}
      >
        <Stack gap="sm">
          {paragraphs(step.body)}
          {centered && step.kind !== 'choice' && step.kind !== 'intro' && (
            <Text size="sm" c="dimmed">
              This step points at something that isn’t on screen right now.
            </Text>
          )}
          <Group justify="space-between" mt="xs">
            <Text size="xs" c="dimmed">
              {counter}
            </Text>
            <Group gap="xs">
              {leave}
              {step.kind === 'choice' &&
                step.choices?.map((c, i) => (
                  <Button
                    key={c.id}
                    variant={i === 0 ? 'default' : 'filled'}
                    onClick={() => props.onChoose(c.id)}
                  >
                    {c.label}
                  </Button>
                ))}
              {step.kind === 'intro' && <Button onClick={props.onNext}>Let’s go</Button>}
              {centered && step.kind !== 'choice' && step.kind !== 'intro' && (
                <Button onClick={props.onGoThere}>Take me there</Button>
              )}
            </Group>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={asking}
        onClose={() => setAsking(false)}
        title="Leave the tour?"
        centered
        zIndex={500}
      >
        <Stack>
          <Text size="sm">Your practice library is thrown away. Your real music is untouched.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAsking(false)}>
              Keep going
            </Button>
            <Button color="red" onClick={props.onLeave}>
              Leave
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
