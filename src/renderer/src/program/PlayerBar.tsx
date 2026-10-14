import { useEffect, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Checkbox,
  Group,
  NumberInput,
  Paper,
  Slider,
  Text,
  Tooltip
} from '@mantine/core'
import type { PlayerState } from '@shared/program'
import { NextIcon, PauseIcon, PlayIcon, RestartIcon, StopIcon } from '../components/icons'
import { formatTime } from '../format-time'
import { useLibraryApi } from '../library/LibraryProvider'
import { useProgram } from './ProgramProvider'
import { useAudio } from './useAudio'
import classes from './PlayerBar.module.css'

const nextLabel = (player: PlayerState): string | null =>
  player.nextUp === null
    ? null
    : player.nextUp.kind === 'stop'
      ? 'STOP / TEACHING'
      : player.nextUp.label

// The line under the transport: what's playing, the countdown, or what's next (spec §6.2, §7.2).
function status(player: PlayerState): { title: string; detail: string | null } {
  const next = nextLabel(player)
  if (player.current) {
    return { title: player.current.track.label, detail: player.current.track.country }
  }
  if (player.countdown) {
    const n = player.countdown.secondsLeft
    return player.countdown.reason === 'start'
      ? { title: `Starting in ${n}…`, detail: next }
      : { title: `Next: ${next ?? ''} in ${n}…`, detail: null }
  }
  if (player.programId === null) return { title: 'No program loaded', detail: null }
  return next
    ? { title: `Next up: ${next}`, detail: null }
    : { title: 'Nothing left to play', detail: null }
}

// ▶ turns into ⏸ under the pointer, so the second click of a habitual double-click is ignored
// (it would pause the song that just started).
// Spec §6.2 player bar: transport, the current song, a seek bar, speed (with 🔒) and volume,
// and auto-continue. Owns the <audio> element, so it's mounted once, above the tabs (App).
export default function PlayerBar(): React.JSX.Element {
  const api = useLibraryApi()
  const player = useProgram((s) => s.player)
  const audio = useAudio(api, player)
  const [seeking, setSeeking] = useState<number | null>(null)
  const [seconds, setSeconds] = useState<string | number>(player.autoContinue.seconds)
  useEffect(() => setSeconds(player.autoContinue.seconds), [player.autoContinue.seconds])

  const { title, detail } = status(player)
  const playing = player.status === 'playing'
  const loaded = player.current !== null
  const canStart = player.status !== 'idle' || player.nextUp !== null
  const duration = audio.durationMs ?? 0

  return (
    <Paper withBorder p="sm" className={classes.bar}>
      <audio ref={audio.ref} data-testid="player-audio" />
      <Group gap="xs" wrap="nowrap">
        <ActionIcon
          variant="default"
          size="lg"
          aria-label="Restart song"
          disabled={!loaded}
          onClick={() => audio.seek(0)}
        >
          <RestartIcon />
        </ActionIcon>
        {playing ? (
          <ActionIcon
            size="lg"
            aria-label="Pause"
            onClick={(e) => e.detail < 2 && void api.invoke('player:pause')}
          >
            <PauseIcon />
          </ActionIcon>
        ) : (
          <ActionIcon
            size="lg"
            aria-label="Play"
            disabled={!canStart}
            onClick={(e) => e.detail < 2 && void api.invoke('player:play')}
          >
            <PlayIcon />
          </ActionIcon>
        )}
        <ActionIcon
          variant="default"
          size="lg"
          aria-label="Stop"
          disabled={player.status === 'idle' || player.status === 'stopped'}
          onClick={() => void api.invoke('player:stop')}
        >
          <StopIcon />
        </ActionIcon>
        <ActionIcon
          variant="default"
          size="lg"
          aria-label="Next"
          disabled={player.programId === null}
          onClick={() => void api.invoke('player:next')}
        >
          <NextIcon />
        </ActionIcon>
        <div className={classes.now} aria-live="polite">
          <Group gap={6} wrap="nowrap">
            <Text fw={600} className={classes.label} data-testid="player-title">
              {title}
            </Text>
            {player.current && player.current.source !== 'program' && (
              <Badge size="xs" variant="light">
                {player.current.source === 'preview' ? 'Preview' : 'Replay'}
              </Badge>
            )}
          </Group>
          {detail && (
            <Text size="sm" c="dimmed" className={classes.label}>
              {detail}
            </Text>
          )}
        </div>
        <Group gap={4} wrap="nowrap" w={210}>
          <Text size="sm" w={40}>{`${player.speed}×`}</Text>
          <Slider
            aria-label="Speed"
            min={0.5}
            max={1.5}
            step={0.05}
            value={player.speed}
            onChange={(v) => void api.invoke('player:setSpeed', v)}
            label={(v) => `${v}×`}
            style={{ flex: 1 }}
          />
          <Tooltip
            label={
              player.speedLocked ? 'Speed kept for the next song' : 'Speed resets for each song'
            }
          >
            <ActionIcon
              variant={player.speedLocked ? 'filled' : 'subtle'}
              size="sm"
              aria-label="Keep speed for the next song"
              aria-pressed={player.speedLocked}
              onClick={() => void api.invoke('player:setSpeedLocked', !player.speedLocked)}
            >
              {player.speedLocked ? '🔒' : '🔓'}
            </ActionIcon>
          </Tooltip>
        </Group>
        <Group gap={4} wrap="nowrap" w={140}>
          <Text size="sm">Vol</Text>
          <Slider
            aria-label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={player.volume}
            onChange={(v) => void api.invoke('player:setVolume', v)}
            label={(v) => `${Math.round(v * 100)}%`}
            style={{ flex: 1 }}
          />
        </Group>
      </Group>
      <Group gap="sm" wrap="nowrap">
        <Slider
          aria-label="Position"
          min={0}
          max={Math.max(duration, 1)}
          value={seeking ?? Math.min(audio.positionMs, duration)}
          disabled={!loaded}
          onChange={setSeeking}
          onChangeEnd={(ms) => {
            audio.seek(ms)
            setSeeking(null)
          }}
          label={(ms) => formatTime(ms)}
          color="red"
          style={{ flex: 1 }}
        />
        <Text size="sm" className={classes.time}>
          {loaded ? `${formatTime(seeking ?? audio.positionMs)} / ${formatTime(duration)}` : ''}
        </Text>
        <Checkbox
          label="Auto-continue"
          checked={player.autoContinue.enabled}
          onChange={(e) =>
            void api.invoke('player:setAutoContinue', { enabled: e.currentTarget.checked })
          }
        />
        <Text size="sm">after</Text>
        <NumberInput
          aria-label="Auto-continue after (seconds)"
          size="xs"
          w={70}
          min={0}
          max={600}
          allowDecimal={false}
          clampBehavior="strict"
          value={seconds}
          onChange={setSeconds}
          onBlur={() => {
            const n = Number(seconds)
            if (seconds === '' || !Number.isInteger(n))
              return setSeconds(player.autoContinue.seconds)
            if (n !== player.autoContinue.seconds)
              void api.invoke('player:setAutoContinue', { seconds: n })
          }}
        />
        <Text size="sm">s</Text>
      </Group>
      {player.warning && (
        <Alert
          color="orange"
          withCloseButton
          closeButtonLabel="Dismiss warning"
          onClose={() => void api.invoke('player:dismissWarning')}
          role="alert"
        >
          {player.warning}
        </Alert>
      )}
    </Paper>
  )
}
