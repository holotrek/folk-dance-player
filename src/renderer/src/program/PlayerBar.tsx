import { useEffect, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Checkbox,
  Divider,
  Group,
  NumberInput,
  Paper,
  Slider,
  Switch,
  Text,
  Tooltip
} from '@mantine/core'
import type { PlayerState } from '@shared/program'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'
import { NextIcon, PauseIcon, PlayIcon, RestartIcon, StopIcon } from '../components/icons'
import { formatTime } from '../format-time'
import { useLibraryApi } from '../library/LibraryProvider'
import { useProgram, useProgramStore } from './ProgramProvider'
import { useAudio } from './useAudio'
import { useProjectorStatus } from './useProjectorStatus'
import classes from './PlayerBar.module.css'

const nextLabel = (player: PlayerState): string | null =>
  player.nextUp === null
    ? null
    : player.nextUp.kind === 'stop'
      ? 'STOP / TEACHING'
      : player.nextUp.label

// The title's parts: only `name` shortens (…) when space runs out, so "Next:" and "in 3…" stay.
interface Title {
  before?: string
  name: string
  after?: string
}

// The lines under the transport: what's playing, the countdown, or what's next (spec §6.2, §7.2).
function status(player: PlayerState): {
  title: Title
  song?: string | null
  detail: string | null
} {
  const next = nextLabel(player)
  if (player.current) {
    // Now Playing is the one place a label takes two lines: the dance, then ♪ the song.
    const { parts, country } = player.current.track
    const dance = parts.choreographer ? `${parts.dance} (${parts.choreographer})` : parts.dance
    return { title: { name: dance }, song: parts.song, detail: country }
  }
  if (player.countdown) {
    const n = player.countdown.secondsLeft
    return player.countdown.reason === 'start'
      ? { title: { name: `Starting in ${n}…` }, detail: next }
      : { title: { before: 'Next: ', name: next ?? '', after: ` in ${n}…` }, detail: null }
  }
  if (player.programId === null) return { title: { name: 'No program loaded' }, detail: null }
  return next
    ? { title: { before: 'Next up: ', name: next }, detail: null }
    : { title: { name: 'Nothing left to play' }, detail: null }
}

// "[✓] Label  after [N] s": an option that waits a number of seconds (auto-continue, auto-show).
// The seconds are saved when the field is left, if they're a whole number in range; anything
// else goes back to the saved value.
function DelayOption(props: {
  label: string
  checked: boolean
  onToggle: (on: boolean) => void
  seconds: number
  min: number
  max: number
  onSeconds: (seconds: number) => void
}): React.JSX.Element {
  const [text, setText] = useState<string | number>(props.seconds)
  useEffect(() => setText(props.seconds), [props.seconds])
  return (
    <Group gap={6} wrap="nowrap">
      <Checkbox
        label={props.label}
        checked={props.checked}
        onChange={(e) => props.onToggle(e.currentTarget.checked)}
        styles={{ label: { whiteSpace: 'nowrap' } }}
      />
      <Text size="sm">after</Text>
      <NumberInput
        aria-label={`${props.label.split(' ')[0]} after (seconds)`}
        size="xs"
        w={64}
        min={props.min}
        max={props.max}
        allowDecimal={false}
        clampBehavior="none"
        value={text}
        onChange={setText}
        onBlur={() => {
          const n = Number(text)
          if (text === '' || !Number.isInteger(n) || n < props.min || n > props.max)
            return setText(props.seconds)
          if (n !== props.seconds) props.onSeconds(n)
        }}
      />
      <Text size="sm">s</Text>
    </Group>
  )
}

// The laptop-mode auto-show (spec §7.3): settings, read once and saved from the bar.
function useAutoShow(api: ReturnType<typeof useLibraryApi>) {
  const [autoShow, setAutoShow] = useState({
    enabled: DEFAULT_SETTINGS['autoFullscreen.enabled'],
    seconds: DEFAULT_SETTINGS['autoFullscreen.seconds']
  })
  const apply = (s: Settings) =>
    setAutoShow({ enabled: s['autoFullscreen.enabled'], seconds: s['autoFullscreen.seconds'] })
  useEffect(() => void api.invoke('settings:getAll').then(apply), [api])
  return {
    ...autoShow,
    set: (key: 'autoFullscreen.enabled' | 'autoFullscreen.seconds', value: boolean | number) =>
      void api.invoke('settings:set', key, value).then(apply)
  }
}

// ▶ turns into ⏸ under the pointer, so the second click of a habitual double-click is ignored
// (it would pause the song that just started).
// Spec §6.2 player bar. Row 1: transport, the current song, speed (with 🔒), volume, the projector
// switch and auto-show. Row 2: the seek bar, the elapsed time and auto-continue. Owns the <audio> element, so it's mounted once, above the tabs (App).
export default function PlayerBar(): React.JSX.Element {
  const api = useLibraryApi()
  const player = useProgram((s) => s.player)
  const audio = useAudio(api, player)
  const store = useProgramStore()
  // The Program page's ending time reads the position, to the second.
  const second = Math.floor(audio.positionMs / 1000)
  useEffect(() => store.getState().setPosition(second * 1000), [store, second])
  const projector = useProjectorStatus(api)
  const autoShow = useAutoShow(api)
  const [seeking, setSeeking] = useState<number | null>(null)

  const { title, song, detail } = status(player)
  const playing = player.status === 'playing'
  const loaded = player.current !== null
  const canStart = player.status !== 'idle' || player.nextUp !== null
  const duration = audio.durationMs ?? 0

  return (
    <Paper withBorder p="sm" className={classes.bar}>
      <audio ref={audio.ref} data-testid="player-audio" />
      <Group gap="xs" wrap="nowrap" data-testid="player-row-1">
        <ActionIcon
          variant="default"
          size="lg"
          aria-label="Restart song"
          disabled={!loaded}
          onClick={() => void api.invoke('player:restart')}
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
            <Text fw={600} className={classes.title} data-testid="player-title">
              {title.before && <span className={classes.fixed}>{title.before}</span>}
              <span className={classes.label} data-testid="player-title-name">
                {title.name}
              </span>
              {title.after && <span className={classes.fixed}>{title.after}</span>}
            </Text>
            {player.current && player.current.source !== 'program' && (
              <Badge size="xs" variant="light">
                {player.current.source === 'preview' ? 'Preview' : 'Replay'}
              </Badge>
            )}
          </Group>
          {song && (
            <Text size="sm" c="dimmed" className={classes.label} data-testid="player-song">
              ♪ {song}
            </Text>
          )}
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
        <Divider orientation="vertical" mx="xs" />
        <div>
          <Switch
            label="Projector"
            checked={projector.enabled}
            onChange={(e) => void api.invoke('projector:setEnabled', e.currentTarget.checked)}
            styles={{ label: { whiteSpace: 'nowrap' } }}
          />
          {projector.open && (
            <Text
              size="xs"
              c="dimmed"
              className={classes.projectorNote}
              title={projector.notice ?? `On ${projector.display}`}
            >
              {projector.notice ?? `On ${projector.display}`}
            </Text>
          )}
        </div>
        <Divider orientation="vertical" mx="xs" />
        <DelayOption
          label="Auto-show when playing"
          checked={autoShow.enabled}
          onToggle={(on) => autoShow.set('autoFullscreen.enabled', on)}
          seconds={autoShow.seconds}
          min={5}
          max={3600}
          onSeconds={(n) => autoShow.set('autoFullscreen.seconds', n)}
        />
      </Group>
      <Group gap="sm" wrap="nowrap" data-testid="player-row-2">
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
        <Divider orientation="vertical" mx="xs" />
        <DelayOption
          label="Auto-continue"
          checked={player.autoContinue.enabled}
          onToggle={(enabled) => void api.invoke('player:setAutoContinue', { enabled })}
          seconds={player.autoContinue.seconds}
          min={0}
          max={600}
          onSeconds={(seconds) => void api.invoke('player:setAutoContinue', { seconds })}
        />
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
