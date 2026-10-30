import { Badge, Text, Title } from '@mantine/core'
import { setDraggedFiles } from '../library/drag'
import { useLibraryApi } from '../library/LibraryProvider'
import { useFollowBottom } from './useFollowBottom'
import { useProgram } from './ProgramProvider'
import classes from './ProgramList.module.css'

const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

// Spec §6.2 "Previously played": the loaded program's play log, oldest first. Double-click
// replays an entry (spec §7.1); entries can be dragged back into the program.
export default function PlayedList(): React.JSX.Element {
  const api = useLibraryApi()
  const played = useProgram((s) => s.played)
  const programId = useProgram((s) => s.player.programId)
  const list = useFollowBottom(played.length, programId)
  return (
    <section className={classes.panel} aria-label="Previously played">
      <Title order={5} mb="xs">
        Previously played
      </Title>
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
