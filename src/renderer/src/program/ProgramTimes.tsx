import { Stack, Text } from '@mantine/core'
import { formatClock, formatTotal, playTime, tailMs, totalMs } from '@shared/program-time'
import { useProgram } from './ProgramProvider'
import { useNow } from './useNow'

// The Program page header's times (0.3.0 spec §3.9): what is left to play, and when the program
// will end. Pauses at STOP markers are not counted, which is said when the program has one.
export default function ProgramTimes(): React.JSX.Element | null {
  const program = useProgram((s) => s.program)
  const player = useProgram((s) => s.player)
  const positionMs = useProgram((s) => s.positionMs)
  const now = useNow()
  if (!program) return null
  const items = program.items
  const time = playTime(items)
  const loaded =
    player.current !== null && player.status !== 'idle' && player.status !== 'countdown'
  const songsLeft = items.some((i) => i.kind === 'track' && !i.isMissing && !i.isRemoved)
  if (!songsLeft && !loaded) return null
  // What is left of the song that is loaded: stopped (⏹) rewinds it to the start.
  const duration = player.current?.track.durationMs ?? 0
  const remaining = !loaded
    ? 0
    : player.status === 'stopped'
      ? duration
      : Math.max(duration - positionMs, 0)
  const endsAt = now + remaining + tailMs(items, player)
  const pauses = items.some((i) => i.kind === 'stop')
  return (
    <Stack gap={0} align="center">
      {songsLeft && (
        <Text size="xs" c="dimmed">
          {`Total play time: ${formatTotal(totalMs(time, player.autoContinue))}`}
        </Text>
      )}
      <Text size="xs" c="dimmed" title="Pauses at STOP markers are not counted">
        {`Ending about ${formatClock(endsAt)}${pauses ? ' if no pauses' : ''}`}
      </Text>
    </Stack>
  )
}
