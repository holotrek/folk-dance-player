import { useState } from 'react'
import { Badge, Button, Group, Text, Title } from '@mantine/core'
import { setDraggedFiles } from '../library/drag'
import { errorMessage } from '../ipc-error'
import { useLibraryApi } from '../library/LibraryProvider'
import { useFollowBottom } from './useFollowBottom'
import { useProgram } from './ProgramProvider'
import classes from './ProgramList.module.css'

const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

// Spec §6.2 "Previously played": the loaded program's play log, oldest first (Clear hides it and idles the player). Double-click
// replays an entry (spec §7.1); entries can be dragged back into the program.
export default function PlayedList(): React.JSX.Element {
  const api = useLibraryApi()
  const played = useProgram((s) => s.played)
  const programId = useProgram((s) => s.player.programId)
  const loaded = useProgram((s) => s.player.current !== null)
  const [error, setError] = useState<string | null>(null)
  const list = useFollowBottom(played.length, programId)
  // Nothing to clear: no entries shown and nothing loaded in Now Playing.
  const canClear = programId !== null && (played.length > 0 || loaded)
  return (
    <section className={classes.panel} aria-label="Previously played">
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Title order={5}>Previously played</Title>
        <Button
          size="compact-xs"
          variant="default"
          disabled={!canClear}
          title="Stop the song and clear this list; played songs stay played and the history is kept"
          onClick={() =>
            void api
              .invoke('programs:clearPlayed', programId!)
              .then(() => setError(null))
              .catch((err) => setError(errorMessage(err)))
          }
        >
          Clear
        </Button>
      </Group>
      {error && (
        <Text c="red" size="xs" role="alert" mb="xs">
          {error}
        </Text>
      )}
      <div ref={list} className={classes.list} role="list" aria-label="Played songs">
        {played.length === 0 && (
          <Text size="sm" c="dimmed" p="sm">
            Nothing played yet
          </Text>
        )}
        {played.map((entry) => {
          // A removed song (sync spec §6.4) stays in the history, greyed, but can't be played.
          const removed = entry.track?.isRemoved === true
          const track = removed ? null : entry.track
          return (
            <div
              key={entry.logId}
              role="listitem"
              className={classes.row}
              data-removed={removed ? 'true' : undefined}
              draggable={track !== null}
              onDragStart={(e) => track && setDraggedFiles(e.dataTransfer, [track.fileId])}
              onDoubleClick={() => track && void api.invoke('player:replay', entry.logId)}
              title={track ? 'Double-click to play again' : undefined}
            >
              <Text span size="xs" c="dimmed" w={60}>
                {clock(entry.playedAt)}
              </Text>
              <span className={classes.label}>
                {entry.track?.label ?? 'Removed from the library'}
              </span>
              {removed && (
                <Badge size="xs" variant="light" color="gray">
                  removed
                </Badge>
              )}
              {entry.kind !== 'program' && (
                <Badge size="xs" variant="light">
                  {entry.kind === 'preview' ? 'Preview' : 'Replay'}
                </Badge>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
