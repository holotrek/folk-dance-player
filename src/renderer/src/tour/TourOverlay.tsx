import { useEffect, useState } from 'react'
import { Button, Group, Modal, Popover, Stack, Text } from '@mantine/core'
import type { TourStep } from './steps'
import classes from './TourOverlay.module.css'

const MARGIN = 6 // the hole is a little larger than what it lights up
const POLL_MS = 150 // layout moves (a dialog opens, a list scrolls): follow it
const GONE_MS = 700 // a target missing for less than this is a re-render, not a missing target

interface Hole {
  x: number
  y: number
  w: number
  h: number
}

const ids = (target: TourStep['target']): string[] =>
  target === undefined ? [] : Array.isArray(target) ? target : [target]

// Where the step's targets are on screen; null when one of them isn't (yet).
function useHoles(target: TourStep['target']): Hole[] | null {
  const key = ids(target).join('|')
  const [holes, setHoles] = useState<Hole[] | null>(null)
  useEffect(() => {
    let scrolled = false
    let lastSeen = Date.now()
    // Missing now: keep the last hole for a moment, so a re-render doesn't flip the step to "not on
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
      if (!scrolled) {
        scrolled = true
        found[0]!.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
      }
      const next = rects.map((r) => ({
        x: Math.round(r.left - MARGIN),
        y: Math.round(r.top - MARGIN),
        w: Math.round(r.width + 2 * MARGIN),
        h: Math.round(r.height + 2 * MARGIN)
      }))
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
  const lit = holes !== null && holes.length > 0
  const centered = !lit

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
          position={props.placement ?? 'bottom'}
          withArrow
          offset={16}
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
