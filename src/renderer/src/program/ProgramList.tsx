import { useState } from 'react'
import { ActionIcon, Badge, Button, Group, Menu, Text, Title } from '@mantine/core'
import type { SongDance } from '@shared/library'
import type { ProgramItem } from '@shared/program'
import { PauseIcon } from '../components/icons'
import NamePrompt from '../components/NamePrompt'
import FavoriteToggle from '../library/FavoriteToggle'
import DanceChoiceDialog, { type DanceChoice } from './DanceChoiceDialog'
import { errorMessage } from '../ipc-error'
import {
  carriesFiles,
  carriesItems,
  getDraggedFiles,
  getDraggedItems,
  setDraggedItems
} from '../library/drag'
import { useLibraryApi, useLibraryStore } from '../library/LibraryProvider'
import { moveBefore } from '../library/reorder'
import { formatTime } from '../format-time'
import { useEditSong } from '../navigation'
import { FavoriteItems, openRowMenu } from '../library/SongMenu'
import { pdfDanceIds, type RowTarget } from '../library/row-targets'
import { runStart, selectedInOrder } from './selection'
import { useProgram, useProgramStore } from './ProgramProvider'
import classes from './ProgramList.module.css'

// One program item's options: Edit details, Open PDF (when its dance has one), its dance (when the
// song has several), favorite, a STOP
// before it, remove.
function ItemMenu(props: {
  item: ProgramItem
  itemIds: number[] // the items Remove takes out: this one, or the whole selection it is in
  stopBefore: number // the item "Insert STOP before" goes above (see `runStart`)
  targets: RowTarget[] // the songs the favorites items act on
  onError: (message: string) => void
}): React.JSX.Element {
  const api = useLibraryApi()
  const editSong = useEditSong()
  const program = useProgram((s) => s.program)
  const [dances, setDances] = useState<SongDance[]>([])
  const { item } = props
  const run = (action: () => Promise<unknown>) => () =>
    void action().catch((err) => props.onError(errorMessage(err)))
  const name = item.kind === 'stop' ? 'STOP / TEACHING' : item.label
  return (
    <Menu
      position="right-start"
      withinPortal
      onOpen={() => {
        if (item.kind === 'track' && item.danceCount > 1) {
          void api.invoke('library:song', item.songId).then((song) => setDances(song?.dances ?? []))
        }
      }}
    >
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size="sm"
          className={classes.options}
          aria-label={`Options for ${name}`}
          data-options
        >
          ⋯
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {item.kind === 'track' && props.itemIds.length < 2 && (
          <Menu.Item onClick={() => editSong(item.songId)}>Edit details</Menu.Item>
        )}
        {pdfDanceIds(props.targets).length > 0 && (
          <Menu.Item
            onClick={run(() =>
              Promise.all(
                pdfDanceIds(props.targets).map((id) => api.invoke('library:openNotesPdf', id))
              )
            )}
          >
            Open PDF
          </Menu.Item>
        )}
        {dances.length > 1 && item.kind === 'track' && props.itemIds.length < 2 && (
          <>
            <Menu.Label>Dance</Menu.Label>
            {dances.map((d) => (
              <Menu.Item
                key={d.danceId}
                leftSection={d.danceId === item.danceId ? '✓' : null}
                onClick={run(() => api.invoke('programs:setItemDance', item.id, d.danceId))}
              >
                {d.label}
              </Menu.Item>
            ))}
            <Menu.Divider />
          </>
        )}
        {props.targets.length > 0 && <FavoriteItems targets={props.targets} />}
        <Menu.Item
          onClick={run(() => api.invoke('programs:addStop', program!.id, props.stopBefore))}
        >
          Insert STOP before
        </Menu.Item>
        <Menu.Item
          color="red"
          onClick={run(() => api.invoke('programs:removeItems', program!.id, props.itemIds))}
        >
          Remove
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

// Spec §6.2 program list: the loaded program's unplayed items, in order. Reorder by dragging;
// add songs by dropping them in or with "Add selected"; STOP markers; the dance per item.
// Double-clicking an item does nothing (the program means "play in this order").
export default function ProgramList(): React.JSX.Element {
  const api = useLibraryApi()
  const library = useLibraryStore()
  const programStore = useProgramStore()
  const program = useProgram((s) => s.program)
  const programId = useProgram((s) => s.player.programId)
  const [dropTarget, setDropTarget] = useState<number | 'end' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [choices, setChoices] = useState<DanceChoice[]>([])
  const selection = useProgram((s) => s.selection)
  const items = program?.items ?? []
  const chosen = new Set(selection.ids)

  const act = (action: () => Promise<unknown>): void =>
    void action()
      .then(() => setError(null))
      .catch((err) => setError(errorMessage(err)))

  // Songs from the library, holding, a playlist or "Previously played", placed before `before`.
  // Each is added as its default dance; songs with several dances then ask which one.
  const addFiles = (fileIds: number[], before: number | null) =>
    act(async () => {
      const id = await programStore.getState().ensureProgram()
      const added = new Set(await api.invoke('programs:addTracks', id, fileIds, before))
      const detail = await api.invoke('programs:get', id)
      const several = (detail?.items ?? []).filter(
        (i): i is DanceChoice['item'] => i.kind === 'track' && added.has(i.id) && i.danceCount > 1
      )
      const found = await Promise.all(
        several.map(async (item) => ({
          item,
          dances: (await api.invoke('library:song', item.songId))?.dances ?? []
        }))
      )
      setChoices(found.filter((c) => c.dances.length > 1))
    })

  const drop = (e: React.DragEvent, before: number | null): void => {
    setDropTarget(null)
    if (carriesItems(e.dataTransfer) && program) {
      e.preventDefault()
      const order = items.map((i) => i.id)
      const next = moveBefore(order, getDraggedItems(e.dataTransfer), before)
      if (next.join() !== order.join()) act(() => api.invoke('programs:reorder', program.id, next))
    } else if (carriesFiles(e.dataTransfer)) {
      e.preventDefault()
      addFiles(getDraggedFiles(e.dataTransfer), before)
    }
  }

  // An unselected item becomes the whole selection when dragged; a selected one drags them all.
  const startDrag = (e: React.DragEvent, id: number): void => {
    if (!chosen.has(id)) programStore.getState().selectItem(id, 'single')
    const ids = selectedInOrder(
      programStore.getState().selection,
      items.map((i) => i.id)
    )
    setDraggedItems(e.dataTransfer, ids)
    if (ids.length > 1) {
      const image = document.createElement('div')
      image.className = classes.dragImage
      image.textContent = `${ids.length} items`
      document.body.appendChild(image)
      e.dataTransfer.setDragImage?.(image, 0, 0)
      setTimeout(() => image.remove(), 0)
    }
  }

  // What a row's star, menu and ✕ act on: the whole selection when the row is in it, else the row.
  const actOn = (id: number): number[] =>
    chosen.has(id)
      ? selectedInOrder(
          selection,
          items.map((i) => i.id)
        )
      : [id]
  const favoriteTargets = (id: number): RowTarget[] => {
    const ids = new Set(actOn(id))
    return items.flatMap((i) =>
      i.kind === 'track' && ids.has(i.id)
        ? [
            {
              fileId: i.fileId,
              isFavorite: i.isFavorite,
              danceId: i.danceId,
              hasNotesPdf: i.hasNotesPdf
            }
          ]
        : []
    )
  }

  const click = (e: React.MouseEvent, id: number): void => {
    if ((e.target as HTMLElement).closest('button')) return // a row's star, ✕ or ⋯
    programStore
      .getState()
      .selectItem(id, e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single')
  }

  const over = (e: React.DragEvent, target: number | 'end'): void => {
    if (!carriesItems(e.dataTransfer) && !carriesFiles(e.dataTransfer)) return
    e.preventDefault()
    setDropTarget(target)
  }

  const selected = () =>
    library
      .getState()
      .selectedRows()
      .map((r) => r.fileId)

  return (
    // The whole panel takes drops: on an item they go before it, anywhere else at the end.
    <section
      className={`${classes.panel} ${dropTarget === 'end' ? classes.panelActive : ''}`}
      aria-label="Program"
      onDragOver={(e) => over(e, 'end')}
      onDragLeave={() => setDropTarget(null)}
      onDrop={(e) => drop(e, null)}
    >
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <Title order={5} style={{ whiteSpace: 'nowrap' }}>
            {program ? `Program: ${program.name}` : 'Program'}
          </Title>
          {program && (
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label="Rename program"
              onClick={() => setRenaming(true)}
            >
              ✎
            </ActionIcon>
          )}
        </Group>
        <Group gap={6} wrap="nowrap">
          <Button
            size="compact-sm"
            variant="default"
            disabled={!program}
            onClick={() => act(() => api.invoke('programs:addStop', program!.id, null))}
          >
            + STOP
          </Button>
          <Button
            size="compact-sm"
            title="Add the songs selected in the library to the end"
            onClick={() => {
              const fileIds = selected()
              if (fileIds.length) addFiles(fileIds, null)
            }}
          >
            ➕ Add selected
          </Button>
        </Group>
      </Group>
      {error && (
        <Text c="red" size="sm" role="alert" mb="xs">
          {error}
        </Text>
      )}
      <div
        className={classes.list}
        role="listbox"
        aria-multiselectable="true"
        aria-label="Program items"
        onClick={(e) => {
          // Clicks in a row's portaled menu bubble here through React but are not in the list.
          const target = e.target as HTMLElement
          if (e.currentTarget.contains(target) && !target.closest('[role=option]')) {
            programStore.getState().clearSelection()
          }
        }}
      >
        {items.map((item, i) => (
          <div
            key={item.id}
            role="option"
            aria-selected={chosen.has(item.id)}
            className={[
              classes.row,
              i === 0 ? classes.next : '',
              item.kind === 'stop' ? classes.stop : '',
              dropTarget === item.id ? classes.dropBefore : ''
            ].join(' ')}
            data-removed={item.kind === 'track' && item.isRemoved ? 'true' : undefined}
            draggable
            onClick={(e) => click(e, item.id)}
            onDragStart={(e) => startDrag(e, item.id)}
            onDragOver={(e) => {
              e.stopPropagation()
              over(e, item.id)
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              e.stopPropagation()
              drop(e, item.id)
            }}
            onContextMenu={openRowMenu}
          >
            {item.kind === 'stop' ? (
              <span className={`${classes.label} ${classes.stopLabel}`}>
                <PauseIcon size={14} />
                <span>STOP / TEACHING</span>
              </span>
            ) : (
              <>
                <FavoriteToggle
                  fileId={item.fileId}
                  label={item.label}
                  isFavorite={item.isFavorite}
                  targets={favoriteTargets(item.id)}
                />
                {item.isMissing && (
                  <Text span c="red" aria-label="File missing" title="The file can't be found">
                    ⚠
                  </Text>
                )}
                <span className={classes.label}>{item.label}</span>
                {item.isRemoved && (
                  <Badge size="xs" variant="light" color="gray">
                    removed
                  </Badge>
                )}
                <Text span size="xs" c="dimmed">
                  {item.country}
                </Text>
                <Text span size="xs" c="dimmed">
                  {formatTime(item.durationMs)}
                </Text>
              </>
            )}
            <ActionIcon
              variant="subtle"
              size="sm"
              color="gray"
              className={classes.remove}
              aria-label={`Remove ${item.kind === 'stop' ? 'STOP / TEACHING' : item.label}`}
              title="Remove from the program"
              onClick={() =>
                act(() => api.invoke('programs:removeItems', program!.id, actOn(item.id)))
              }
            >
              ✕
            </ActionIcon>
            <ItemMenu
              item={item}
              itemIds={actOn(item.id)}
              stopBefore={runStart(
                selection,
                items.map((i) => i.id),
                item.id
              )}
              targets={favoriteTargets(item.id)}
              onError={setError}
            />
          </div>
        ))}
        <div className={classes.end}>
          {items.length === 0 && (
            <Text size="sm" c="dimmed" p="sm">
              {programId === null
                ? 'No program loaded. Drag songs here to start one, or choose one in the sidebar.'
                : 'Nothing left to play. Drag songs here, or select songs and use ➕ Add selected.'}
            </Text>
          )}
        </div>
      </div>
      <DanceChoiceDialog
        choices={choices}
        onClose={() => setChoices([])}
        onDone={(changes) => {
          setChoices([])
          for (const { itemId, danceId } of changes) {
            act(() => api.invoke('programs:setItemDance', itemId, danceId))
          }
        }}
      />
      <NamePrompt
        opened={renaming}
        title="Rename program"
        initialValue={program?.name ?? ''}
        submitLabel="Save"
        onSubmit={(name) => api.invoke('programs:rename', program!.id, name)}
        onClose={() => setRenaming(false)}
      />
    </section>
  )
}
