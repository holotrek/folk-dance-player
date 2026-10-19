import { useEffect, useRef, useState } from 'react'
import { Badge, Group, Text, UnstyledButton } from '@mantine/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LibraryRow, SortColumn } from '@shared/library'
import { formatTime } from '../format-time'
import FavoriteToggle from './FavoriteToggle'
import { carriesFiles, getDraggedFiles, setDraggedFiles } from './drag'
import { useLibrary, useLibraryApi, useLibraryStore } from './LibraryProvider'
import { moveBefore } from './reorder'
import SongMenu, { openRowMenu } from './SongMenu'
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
      ) : (
        <FavoriteToggle fileId={r.fileId} label={r.label} isFavorite={r.isFavorite} />
      )
  },
  {
    sort: 'dance',
    label: 'Dance / Song',
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

// In a playlist: each song's number in the playlist's own order.
const NUMBER_COLUMN: Column = {
  sort: null,
  label: '#',
  render: (r) => (
    <Text span size="xs" c="dimmed">
      {r.playlistNumber}
    </Text>
  )
}

// In the review list: whether the song's file is still on disk (sync spec §6.2).
const FILE_COLUMN: Column = {
  sort: null,
  label: 'File',
  render: (r) => (
    <Text span size="xs" c="dimmed">
      {r.isMissing ? 'File gone' : 'File still on disk'}
    </Text>
  )
}

// Last in every row: its "⋯" menu (Edit details, favorites), shown on hover.
const MENU_COLUMN: Column = {
  sort: null,
  label: '',
  render: (r) => (
    <SongMenu
      songId={r.songId}
      fileId={r.fileId}
      label={r.label}
      isFavorite={r.isFavorite}
      className={classes.options}
    />
  )
}

// The Program page's library list (spec §6.2): the song and its dance, country and teacher.
const COMPACT = new Set(['', 'Dance / Song', 'Country', 'Teacher', 'Time'])
const COMPACT_COLUMNS = ALL_COLUMNS.filter((c) => COMPACT.has(c.label))

// Spec §6.3: browse, sort, search and select songs; drag them onto playlists or the program.
// Virtualized, so large libraries stay fast. In a playlist (in its own order), dropping songs on a
// row moves them. Double-click plays a preview (spec §7.1).
export default function LibraryTable({
  compact = false
}: {
  compact?: boolean
}): React.JSX.Element {
  const api = useLibraryApi()
  const store = useLibraryStore()
  const rows = useLibrary((s) => s.rows)
  const selected = useLibrary((s) => s.selected)
  const sort = useLibrary((s) => s.sort)
  const filter = useLibrary((s) => s.filter)
  const search = useLibrary((s) => s.search)
  const setSort = useLibrary((s) => s.setSort)
  const select = useLibrary((s) => s.select)
  const scrollTo = useLibrary((s) => s.scrollTo)
  const [dropTarget, setDropTarget] = useState<number | 'end' | null>(null)
  const inPlaylist = filter.kind === 'playlist'
  const playlists = useLibrary((s) => s.playlists)
  const COLUMNS = [
    ...(inPlaylist ? [NUMBER_COLUMN] : []),
    ...(compact ? COMPACT_COLUMNS : ALL_COLUMNS),
    ...(filter.kind === 'review' ? [FILE_COLUMN] : []),
    MENU_COLUMN
  ]
  const scroll = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 32,
    overscan: 12,
    initialRect: { width: 1000, height: 600 }
  })

  // "Edit details" asked for a song: bring its row into view once it is listed.
  useEffect(() => {
    if (scrollTo === null) return
    const index = rows.findIndex((r) => r.songId === scrollTo)
    if (index < 0) return
    virtualizer.scrollToIndex(index, { align: 'center' })
    store.getState().scrolled()
  }, [scrollTo, rows, virtualizer, store])

  const chosen = new Set(selected)
  // A search hides some of the playlist, so a move can't be placed within the whole order.
  // A mirror of a Music playlist is read-only (sync spec §6.3): no reordering, no drops.
  const mirror =
    filter.kind === 'playlist' && playlists.some((p) => p.id === filter.playlistId && p.mirror)
  const reorderable =
    filter.kind === 'playlist' && !mirror && sort.column === 'position' && search === ''

  const onHeader = (column: SortColumn): void => {
    const direction = sort.column === column && sort.direction === 'asc' ? 'desc' : 'asc'
    void setSort({ column, direction })
  }

  // Moves the dropped songs before `target`, or to the end when it is null.
  const dropOn = (target: LibraryRow | null, fileIds: number[]): void => {
    if (filter.kind !== 'playlist') return
    const order = rows.map((r) => r.playlistItemId!)
    const moving = rows.filter((r) => fileIds.includes(r.fileId)).map((r) => r.playlistItemId!)
    const next = moveBefore(order, moving, target?.playlistItemId ?? null)
    if (next.join() !== order.join()) void api.invoke('playlists:reorder', filter.playlistId, next)
  }

  return (
    <div
      className={[
        classes.table,
        compact ? classes.compact : '',
        inPlaylist ? classes.numbered : ''
      ].join(' ')}
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
                onContextMenu={openRowMenu}
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
        {/* Below the last row: songs dropped here move to the end of the playlist. */}
        <div
          className={`${classes.end} ${dropTarget === 'end' ? classes.dropBefore : ''}`}
          data-testid="songs-end"
          onDragOver={(e) => {
            if (!reorderable || !carriesFiles(e.dataTransfer)) return
            e.preventDefault()
            setDropTarget('end')
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => {
            setDropTarget(null)
            if (!reorderable) return
            e.preventDefault()
            dropOn(null, getDraggedFiles(e.dataTransfer))
          }}
        />
      </div>
    </div>
  )
}
