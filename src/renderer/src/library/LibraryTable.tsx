import { useRef, useState } from 'react'
import { Badge, Group, Text, UnstyledButton } from '@mantine/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LibraryRow, SortColumn } from '@shared/library'
import { formatTime } from '../format-time'
import { carriesFiles, getDraggedFiles, setDraggedFiles } from './drag'
import { useLibrary, useLibraryApi, useLibraryStore } from './LibraryProvider'
import { moveBefore } from './reorder'
import classes from './LibraryTable.module.css'

interface Column {
  sort: SortColumn | null
  label: string
  render: (row: LibraryRow) => React.ReactNode
}

const ALL_COLUMNS: Column[] = [
  {
    sort: null,
    label: '',
    render: (r) =>
      r.isMissing ? (
        <Text span c="red" aria-label="File missing" title="The file can't be found">
          ⚠
        </Text>
      ) : r.isFavorite ? (
        <Text span aria-label="Favorite">
          ★
        </Text>
      ) : null
  },
  {
    sort: 'title',
    label: 'Song / Dance',
    render: (r) => (
      <Group gap={6} wrap="nowrap">
        <span className={classes.cell}>{r.label}</span>
        {r.danceCount > 1 && (
          <Badge size="xs" variant="light" title={`${r.danceCount} dances`}>
            +{r.danceCount - 1}
          </Badge>
        )}
      </Group>
    )
  },
  { sort: 'country', label: 'Country', render: (r) => r.country },
  { sort: 'teacher', label: 'Teacher', render: (r) => r.teacher },
  { sort: 'choreographer', label: 'Choreographer', render: (r) => r.choreographer },
  { sort: 'danceType', label: 'Type', render: (r) => r.danceType },
  {
    sort: 'difficulty',
    label: 'Difficulty',
    render: (r) => (r.difficulty ? '●'.repeat(r.difficulty) : '')
  },
  { sort: 'duration', label: 'Time', render: (r) => formatTime(r.durationMs) }
]

// The Program page's library list (spec §6.2): the song and its dance, country and teacher.
const COMPACT = new Set(['', 'Song / Dance', 'Country', 'Teacher', 'Time'])
const COMPACT_COLUMNS = ALL_COLUMNS.filter((c) => COMPACT.has(c.label))

// Spec §6.3: browse, sort, search and select songs; drag them onto playlists or the program.
// Virtualized, so large libraries stay fast. In a playlist (in its own order), dropping songs on a
// row moves them. Double-click plays a preview (spec §7.1).
export default function LibraryTable({
  compact = false
}: {
  compact?: boolean
}): React.JSX.Element {
  const COLUMNS = compact ? COMPACT_COLUMNS : ALL_COLUMNS
  const api = useLibraryApi()
  const store = useLibraryStore()
  const rows = useLibrary((s) => s.rows)
  const selected = useLibrary((s) => s.selected)
  const sort = useLibrary((s) => s.sort)
  const filter = useLibrary((s) => s.filter)
  const search = useLibrary((s) => s.search)
  const setSort = useLibrary((s) => s.setSort)
  const select = useLibrary((s) => s.select)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 32,
    overscan: 12,
    initialRect: { width: 1000, height: 600 }
  })

  const chosen = new Set(selected)
  // A search hides some of the playlist, so a move can't be placed within the whole order.
  const reorderable = filter.kind === 'playlist' && sort.column === 'position' && search === ''

  const onHeader = (column: SortColumn): void => {
    const direction = sort.column === column && sort.direction === 'asc' ? 'desc' : 'asc'
    void setSort({ column, direction })
  }

  const dropOn = (target: LibraryRow, fileIds: number[]): void => {
    if (filter.kind !== 'playlist') return
    const order = rows.map((r) => r.playlistItemId!)
    const moving = rows.filter((r) => fileIds.includes(r.fileId)).map((r) => r.playlistItemId!)
    const next = moveBefore(order, moving, target.playlistItemId)
    if (next.join() !== order.join()) void api.invoke('playlists:reorder', filter.playlistId, next)
  }

  return (
    <div
      className={`${classes.table} ${compact ? classes.compact : ''}`}
      role="table"
      aria-label="Songs"
      aria-rowcount={rows.length}
      // Focusable, so clicking a row gives the table the keyboard: ⌘A / Ctrl+A selects every song.
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault()
          store.getState().selectAll()
        }
      }}
    >
      <div className={classes.header} role="row">
        {COLUMNS.map((c, i) => (
          <div
            key={i}
            role="columnheader"
            aria-sort={
              c.sort && sort.column === c.sort
                ? sort.direction === 'asc'
                  ? 'ascending'
                  : 'descending'
                : undefined
            }
          >
            {c.sort ? (
              <UnstyledButton fz="sm" fw={600} onClick={() => onHeader(c.sort!)}>
                {c.label}
                {sort.column === c.sort ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </UnstyledButton>
            ) : (
              c.label
            )}
          </div>
        ))}
      </div>
      <div ref={scroll} className={classes.scroll}>
        <div className={classes.body} style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((v) => {
            const r = rows[v.index]
            return (
              <div
                key={r.songId}
                role="row"
                aria-selected={chosen.has(r.songId)}
                className={`${classes.item} ${r.isMissing ? classes.missing : ''} ${
                  dropTarget === r.songId ? classes.dropBefore : ''
                }`}
                style={{ transform: `translateY(${v.start}px)` }}
                onDoubleClick={() => void api.invoke('player:preview', r.fileId)}
                onClick={(e) =>
                  select(
                    r.songId,
                    e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single'
                  )
                }
                draggable
                onDragStart={(e) => {
                  if (!chosen.has(r.songId)) select(r.songId, 'single')
                  const fileIds = store
                    .getState()
                    .selectedRows()
                    .map((x) => x.fileId)
                  setDraggedFiles(e.dataTransfer, fileIds.length ? fileIds : [r.fileId])
                }}
                onDragOver={(e) => {
                  if (!reorderable || !carriesFiles(e.dataTransfer)) return
                  e.preventDefault()
                  setDropTarget(r.songId)
                }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => {
                  setDropTarget(null)
                  if (!reorderable) return
                  e.preventDefault()
                  dropOn(r, getDraggedFiles(e.dataTransfer))
                }}
              >
                {COLUMNS.map((c, i) => (
                  <div key={i} role="cell" className={classes.cell}>
                    {c.render(r)}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
