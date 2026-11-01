import { useCallback, useEffect, useState } from 'react'
import { ActionIcon, Badge, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import type { HoldingItem } from '@shared/program'
import FavoriteToggle from '../library/FavoriteToggle'
import {
  carriesFiles,
  carriesHolding,
  carriesItems,
  carriesSongItems,
  getDraggedFiles,
  getDraggedHolding,
  getDraggedItems,
  setDragCountImage,
  setDraggedHolding
} from '../library/drag'
import { errorMessage } from '../ipc-error'
import { useLibraryApi } from '../library/LibraryProvider'
import type { RowTarget } from '../library/row-targets'
import SongMenu, { openRowMenu } from '../library/SongMenu'
import { chooseDances } from './dance-choices'
import DanceChoiceDialog, { type DanceChoice } from './DanceChoiceDialog'
import { useProgram } from './ProgramProvider'
import { EMPTY_SELECTION, pruneSelection, selectedInOrder, selectIn } from './selection'
import classes from './ProgramList.module.css'

// Spec §6.2 holding panel (0.3.0 spec §3.12): songs set aside for this session, each with the dance
// it is held as, in the order they were placed. It works like the program on the side:
// - songs dragged in from the library, a playlist or Previously played are held (a song with
//   several dances asks which one); program items dragged in are moved here, keeping their dance;
//   held rows dragged within the panel reorder, and dragged into the program they move there;
// - rows can be selected (click, shift-click, cmd/ctrl-click), and then the star, the menu's
//   favorites, Open PDF, ✕ and Release act on all of them;
// - double-click previews; ⋯ or right-click opens the menu.
export default function HoldingPanel(): React.JSX.Element {
  const api = useLibraryApi()
  const programId = useProgram((s) => s.player.programId)
  const [rows, setRows] = useState<HoldingItem[]>([])
  const [selection, setSelection] = useState(EMPTY_SELECTION)
  const [dropTarget, setDropTarget] = useState<number | 'end' | null>(null)
  const [choices, setChoices] = useState<DanceChoice[]>([])
  const refresh = useCallback(() => {
    void api.invoke('library:holding').then((fresh) => {
      setRows(fresh)
      setSelection((s) =>
        pruneSelection(
          s,
          fresh.map((r) => r.id)
        )
      )
    })
  }, [api])
  useEffect(() => {
    refresh()
    return api.on('library:changed', refresh)
  }, [api, refresh])

  const order = rows.map((r) => r.id)
  const chosen = new Set(selection.ids)
  const fail = (err: unknown): void =>
    void notifications.show({ color: 'red', message: errorMessage(err) })
  const run = (action: () => Promise<unknown>): void => void action().catch(fail)

  // What a row's star, menu and ✕ act on: the whole selection when the row is in it, else the row.
  const actOn = (id: number): number[] =>
    chosen.has(id) ? selectedInOrder(selection, order) : [id]
  const targetsFor = (id: number): RowTarget[] => {
    const ids = new Set(actOn(id))
    return rows
      .filter((r) => ids.has(r.id))
      .map((r) => ({
        fileId: r.fileId,
        isFavorite: r.isFavorite,
        danceId: r.danceId,
        hasNotesPdf: r.hasNotesPdf
      }))
  }

  const click = (e: React.MouseEvent, id: number): void => {
    if ((e.target as HTMLElement).closest('button')) return // a row's star, ✕ or ⋯
    setSelection((s) =>
      selectIn(s, order, id, e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single')
    )
  }

  const startDrag = (e: React.DragEvent, id: number): void => {
    const now = chosen.has(id) ? selection : selectIn(selection, order, id, 'single')
    if (!chosen.has(id)) setSelection(now)
    const ids = selectedInOrder(now, order)
    setDraggedHolding(e.dataTransfer, ids)
    if (ids.length > 1) setDragCountImage(e.dataTransfer, ids.length, classes.dragImage)
  }

  // Songs from the library, a playlist or Previously played: held as their default dance, then a
  // song with several dances asks which one.
  const hold = (fileIds: number[], before: number | null): void =>
    run(async () => {
      const added = await api.invoke('library:holdSongs', fileIds, before)
      const fresh = await api.invoke('library:holding')
      setChoices(
        await chooseDances(
          api,
          fresh.filter((r) => added.includes(r.id))
        )
      )
    })

  const accepts = (e: React.DragEvent): boolean =>
    carriesFiles(e.dataTransfer) ||
    carriesHolding(e.dataTransfer) ||
    (carriesItems(e.dataTransfer) && carriesSongItems(e.dataTransfer))

  const over = (e: React.DragEvent, target: number | 'end'): void => {
    if (!accepts(e)) return
    e.preventDefault()
    setDropTarget(target)
  }

  // Drops go before `before` (a held row) or at the end; dropping rows onto one of themselves
  // leaves the order alone.
  const drop = (e: React.DragEvent, before: number | null): void => {
    setDropTarget(null)
    if (!accepts(e)) return
    e.preventDefault()
    if (carriesHolding(e.dataTransfer)) {
      const ids = getDraggedHolding(e.dataTransfer)
      if (before === null || !ids.includes(before)) {
        run(() => api.invoke('library:moveHolding', ids, before))
      }
    } else if (carriesItems(e.dataTransfer)) {
      if (programId !== null) {
        const ids = getDraggedItems(e.dataTransfer)
        run(() => api.invoke('programs:moveToHolding', programId, ids, before))
      }
    } else {
      hold(getDraggedFiles(e.dataTransfer), before)
    }
  }

  return (
    <section
      className={`${classes.panel} ${dropTarget === 'end' ? classes.panelActive : ''}`}
      aria-label="Holding"
      data-tour="holding.panel"
      onDragOver={(e) => over(e, 'end')}
      onDragLeave={() => setDropTarget(null)}
      onDrop={(e) => drop(e, null)}
    >
      <Title order={5} mb="xs">
        Holding
      </Title>
      <div
        className={classes.list}
        role="listbox"
        aria-multiselectable="true"
        aria-label="Held songs"
        onClick={(e) => {
          // Clicks in a row's portaled menu bubble here through React but are not in the list.
          const target = e.target as HTMLElement
          if (e.currentTarget.contains(target) && !target.closest('[role=option]')) {
            setSelection(EMPTY_SELECTION)
          }
        }}
      >
        {rows.length === 0 && (
          <Text size="sm" c="dimmed" p="sm">
            Drag songs here to keep them handy
          </Text>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            role="option"
            aria-selected={chosen.has(r.id)}
            className={`${classes.row} ${dropTarget === r.id ? classes.dropBefore : ''}`}
            data-removed={r.isRemoved ? 'true' : undefined}
            data-tour={`holding.row:${r.title}`}
            draggable
            onClick={(e) => click(e, r.id)}
            onDragStart={(e) => startDrag(e, r.id)}
            onDragOver={(e) => {
              e.stopPropagation()
              over(e, r.id)
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              e.stopPropagation()
              drop(e, r.id)
            }}
            onDoubleClick={() => void api.invoke('player:preview', r.fileId)}
            onContextMenu={openRowMenu}
          >
            <FavoriteToggle
              fileId={r.fileId}
              label={r.label}
              isFavorite={r.isFavorite}
              targets={targetsFor(r.id)}
            />
            {r.isMissing && (
              <Text span c="red" aria-label="File missing" title="The file can't be found">
                ⚠
              </Text>
            )}
            <span className={classes.label}>{r.label}</span>
            {r.isRemoved && (
              <Badge size="xs" variant="light" color="gray">
                removed
              </Badge>
            )}
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
              onClick={() => run(() => api.invoke('library:releaseHolding', actOn(r.id)))}
            >
              ✕
            </ActionIcon>
            <SongMenu
              songId={r.songId}
              fileId={r.fileId}
              danceId={r.danceId}
              hasNotesPdf={r.hasNotesPdf}
              label={r.label}
              isFavorite={r.isFavorite}
              targets={targetsFor(r.id)}
              danceCount={r.danceCount}
              danceChoice={{
                current: r.danceId,
                onChoose: (danceId) =>
                  run(() => api.invoke('library:setHoldingDance', r.id, danceId))
              }}
              onRemove={{
                label: 'Release',
                run: () => run(() => api.invoke('library:releaseHolding', actOn(r.id)))
              }}
              className={classes.options}
            />
          </div>
        ))}
      </div>
      <DanceChoiceDialog
        choices={choices}
        onClose={() => setChoices([])}
        onDone={(changes) => {
          setChoices([])
          for (const { itemId, danceId } of changes) {
            run(() => api.invoke('library:setHoldingDance', itemId, danceId))
          }
        }}
      />
    </section>
  )
}
