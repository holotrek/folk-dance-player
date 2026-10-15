import { useCallback, useEffect, useState } from 'react'
import { ActionIcon, Text, Title } from '@mantine/core'
import type { LibraryRow } from '@shared/library'
import FavoriteToggle from '../library/FavoriteToggle'
import { carriesFiles, getDraggedFiles, setDraggedFiles } from '../library/drag'
import { useLibraryApi } from '../library/LibraryProvider'
import classes from './ProgramList.module.css'

const HOLDING = {
  search: '',
  filter: { kind: 'holding' as const },
  sort: { column: 'title' as const, direction: 'asc' as const } // holding keeps its own order
}

// Spec §6.2 holding panel: songs set aside for this session, in the order they were placed.
// Drag and drop works as in the program: songs dropped on a held song go before it, anywhere else
// in the panel at the end, and held songs dragged within the panel move. Drag them into the
// program; double-click to preview; the star to favorite; ✕ to release.
export default function HoldingPanel(): React.JSX.Element {
  const api = useLibraryApi()
  const [rows, setRows] = useState<LibraryRow[]>([])
  const [dropTarget, setDropTarget] = useState<number | 'end' | null>(null)
  const refresh = useCallback(() => {
    void api.invoke('library:list', HOLDING).then(setRows)
  }, [api])
  useEffect(() => {
    refresh()
    return api.on('library:changed', refresh)
  }, [api, refresh])

  const over = (e: React.DragEvent, target: number | 'end'): void => {
    if (!carriesFiles(e.dataTransfer)) return
    e.preventDefault()
    setDropTarget(target)
  }

  // Holds the dropped songs before `before` (a held song) or at the end. Dropping a song onto
  // itself leaves the order unchanged.
  const drop = (e: React.DragEvent, before: number | null): void => {
    setDropTarget(null)
    const fileIds = getDraggedFiles(e.dataTransfer)
    if (!fileIds.length) return
    e.preventDefault()
    if (before !== null && fileIds.includes(before)) return
    void api.invoke('library:setHolding', fileIds, true, before)
  }

  return (
    <section
      className={`${classes.panel} ${dropTarget === 'end' ? classes.panelActive : ''}`}
      aria-label="Holding"
      onDragOver={(e) => over(e, 'end')}
      onDragLeave={() => setDropTarget(null)}
      onDrop={(e) => drop(e, null)}
    >
      <Title order={5} mb="xs">
        Holding
      </Title>
      <div className={classes.list} role="list" aria-label="Held songs">
        {rows.length === 0 && (
          <Text size="sm" c="dimmed" p="sm">
            Drag songs here to keep them handy
          </Text>
        )}
        {rows.map((r) => (
          <div
            key={r.fileId}
            role="listitem"
            className={`${classes.row} ${dropTarget === r.fileId ? classes.dropBefore : ''}`}
            draggable
            onDragStart={(e) => setDraggedFiles(e.dataTransfer, [r.fileId])}
            onDragOver={(e) => {
              e.stopPropagation()
              over(e, r.fileId)
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              e.stopPropagation()
              drop(e, r.fileId)
            }}
            onDoubleClick={() => void api.invoke('player:preview', r.fileId)}
          >
            <FavoriteToggle fileId={r.fileId} label={r.label} isFavorite={r.isFavorite} />
            <span className={classes.label}>{r.label}</span>
            <Text span size="xs" c="dimmed">
              {r.country}
            </Text>
            <ActionIcon
              variant="subtle"
              size="sm"
              color="gray"
              className={classes.release}
              aria-label={`Release ${r.label}`}
              title="Release from holding"
              onClick={() => void api.invoke('library:setHolding', [r.fileId], false)}
            >
              ✕
            </ActionIcon>
          </div>
        ))}
      </div>
    </section>
  )
}
