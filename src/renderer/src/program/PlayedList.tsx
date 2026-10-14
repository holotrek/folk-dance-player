import { Badge, Text, Title } from '@mantine/core'
import { setDraggedFiles } from '../library/drag'
import { useLibraryApi } from '../library/LibraryProvider'
import { useProgram } from './ProgramProvider'
import classes from './ProgramList.module.css'

const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

// Spec §6.2 "Previously played": the loaded program's play log, newest first. Double-click
// replays an entry (spec §7.1); entries can be dragged back into the program.
export default function PlayedList(): React.JSX.Element {
  const api = useLibraryApi()
  const played = useProgram((s) => s.played)
  return (
    <section className={classes.panel} aria-label="Previously played">
      <Title order={5} mb="xs">
        Previously played
      </Title>
      <div className={classes.list} role="list" aria-label="Played songs">
        {played.length === 0 && (
          <Text size="sm" c="dimmed" p="sm">
            Nothing played yet
          </Text>
        )}
        {played.map((entry) => (
          <div
            key={entry.logId}
            role="listitem"
            className={classes.row}
            draggable={entry.track !== null}
            onDragStart={(e) =>
              entry.track && setDraggedFiles(e.dataTransfer, [entry.track.fileId])
            }
            onDoubleClick={() => entry.track && void api.invoke('player:replay', entry.logId)}
            title={entry.track ? 'Double-click to play again' : undefined}
          >
            <Text span size="xs" c="dimmed" w={60}>
              {clock(entry.playedAt)}
            </Text>
            <span className={classes.label}>
              {entry.track?.label ?? 'Removed from the library'}
            </span>
            {entry.kind !== 'program' && (
              <Badge size="xs" variant="light">
                {entry.kind === 'preview' ? 'Preview' : 'Replay'}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
