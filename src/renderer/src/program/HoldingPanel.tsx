import { useCallback, useEffect, useState } from 'react'
import { ActionIcon, Text, Title } from '@mantine/core'
import type { LibraryRow } from '@shared/library'
import { carriesFiles, getDraggedFiles, setDraggedFiles } from '../library/drag'
import { useLibraryApi } from '../library/LibraryProvider'
import classes from './ProgramList.module.css'

const HOLDING = {
  search: '',
  filter: { kind: 'holding' as const },
  sort: { column: 'title' as const, direction: 'asc' as const }
}

// Spec §6.2 holding panel: songs set aside for this session (a per-file flag). Drop songs here
// to hold them; drag them into the program; double-click to preview; ✕ to release.
export default function HoldingPanel(): React.JSX.Element {
  const api = useLibraryApi()
  const [rows, setRows] = useState<LibraryRow[]>([])
  const [over, setOver] = useState(false)
  const refresh = useCallback(() => {
    void api.invoke('library:list', HOLDING).then(setRows)
  }, [api])
  useEffect(() => {
    refresh()
    return api.on('library:changed', refresh)
  }, [api, refresh])

  return (
    <section
      className={classes.panel}
      aria-label="Holding"
      onDragOver={(e) => {
        if (!carriesFiles(e.dataTransfer)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const fileIds = getDraggedFiles(e.dataTransfer)
        if (!fileIds.length) return
        e.preventDefault()
        void api.invoke('library:setHolding', fileIds, true)
      }}
    >
      <Title order={5} mb="xs">
        Holding
      </Title>
      <div
        className={`${classes.list} ${over ? classes.endActive : ''}`}
        role="list"
        aria-label="Held songs"
      >
        {rows.length === 0 && (
          <Text size="sm" c="dimmed" p="sm">
            Drag songs here to keep them handy
          </Text>
        )}
        {rows.map((r) => (
          <div
            key={r.fileId}
            role="listitem"
            className={classes.row}
            draggable
            onDragStart={(e) => setDraggedFiles(e.dataTransfer, [r.fileId])}
            onDoubleClick={() => void api.invoke('player:preview', r.fileId)}
          >
            <span className={classes.label}>{r.label}</span>
            <Text span size="xs" c="dimmed">
              {r.country}
            </Text>
            <ActionIcon
              variant="subtle"
              size="sm"
              className={classes.release}
              aria-label={`Release ${r.label}`}
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
