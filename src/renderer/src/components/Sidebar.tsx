import { useRef, useState } from 'react'
import { ActionIcon, Group, Menu, NavLink, ScrollArea, Text, TextInput } from '@mantine/core'
import type { LibraryFilter, PlaylistSummary } from '@shared/library'
import { carriesFiles, getDraggedFiles } from '../library/drag'
import { useLibrary, useLibraryApi } from '../library/LibraryProvider'
import ConfirmDialog from './ConfirmDialog'
import NamePrompt from './NamePrompt'
import classes from './Sidebar.module.css'

const sameFilter = (a: LibraryFilter, b: LibraryFilter): boolean =>
  a.kind === b.kind && (a.kind !== 'playlist' || a.playlistId === (b as typeof a).playlistId)

// A sidebar entry that songs can be dropped onto.
function DropTarget(props: { onFiles: (fileIds: number[]) => void; children: React.ReactNode }) {
  const [over, setOver] = useState(false)
  return (
    <div
      className={over ? classes.dropActive : undefined}
      onDragOver={(e) => {
        if (!carriesFiles(e.dataTransfer)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const fileIds = getDraggedFiles(e.dataTransfer)
        if (fileIds.length === 0) return
        e.preventDefault()
        props.onFiles(fileIds)
      }}
    >
      {props.children}
    </div>
  )
}

// A playlist in the sidebar: a drop target, with an options menu ("⋯", or right-click).
function PlaylistEntry(props: {
  playlist: PlaylistSummary
  link: React.ReactNode
  onDropFiles: (fileIds: number[]) => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
}): React.JSX.Element {
  const options = useRef<HTMLButtonElement>(null)
  return (
    <div
      className={classes.playlist}
      onContextMenu={(e) => {
        e.preventDefault()
        options.current?.click()
      }}
    >
      <DropTarget onFiles={props.onDropFiles}>{props.link}</DropTarget>
      <Menu position="right-start" withinPortal>
        <Menu.Target>
          <ActionIcon
            ref={options}
            variant="subtle"
            size="sm"
            className={classes.options}
            aria-label={`Options for ${props.playlist.name}`}
          >
            ⋯
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={props.onRename}>Rename…</Menu.Item>
          <Menu.Item onClick={props.onDuplicate}>Duplicate</Menu.Item>
          <Menu.Item color="red" onClick={props.onDelete}>
            Delete…
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  )
}

const heading = (text: string): React.JSX.Element => (
  <Text size="xs" fw={700} c="dimmed" tt="uppercase">
    {text}
  </Text>
)

// Spec §6.1. Programs arrive in plan 4.
export default function Sidebar(): React.JSX.Element {
  const api = useLibraryApi()
  const filter = useLibrary((s) => s.filter)
  const setFilter = useLibrary((s) => s.setFilter)
  const playlists = useLibrary((s) => s.playlists)
  const [prompt, setPrompt] = useState<
    { mode: 'create' } | { mode: 'rename'; playlist: PlaylistSummary } | null
  >(null)
  const [deleting, setDeleting] = useState<PlaylistSummary | null>(null)

  const entry = (label: string, target: LibraryFilter, extra?: React.ReactNode) => {
    const active = sameFilter(filter, target)
    return (
      <NavLink
        label={label}
        rightSection={extra}
        active={active}
        aria-current={active ? 'page' : undefined}
        onClick={() => void setFilter(target)}
      />
    )
  }

  return (
    <nav className={classes.root} aria-label="Library">
      {heading('Library')}
      {entry('♪ All Music', { kind: 'all' })}
      <DropTarget onFiles={(ids) => void api.invoke('library:setFavorite', ids, true)}>
        {entry('★ Favorites', { kind: 'favorites' })}
      </DropTarget>

      <Group justify="space-between" mt="md">
        {heading('Playlists')}
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="New playlist"
          onClick={() => setPrompt({ mode: 'create' })}
        >
          +
        </ActionIcon>
      </Group>
      <div className={classes.playlists} role="group" aria-label="Playlists">
        {playlists.length === 0 && (
          <Text size="sm" c="dimmed">
            No playlists yet
          </Text>
        )}
        {playlists.map((p) => (
          <PlaylistEntry
            key={p.id}
            playlist={p}
            link={entry(
              p.name,
              { kind: 'playlist', playlistId: p.id },
              p.source === 'apple_xml' ? (
                <Text
                  span
                  size="xs"
                  c="dimmed"
                  aria-label="From Apple Music"
                  title="Imported from Apple Music"
                ></Text>
              ) : undefined
            )}
            onDropFiles={(ids) => void api.invoke('playlists:add', p.id, ids)}
            onRename={() => setPrompt({ mode: 'rename', playlist: p })}
            onDuplicate={() => void api.invoke('playlists:duplicate', p.id)}
            onDelete={() => setDeleting(p)}
          />
        ))}
      </div>

      {heading('Programs')}
      <TextInput size="xs" placeholder="Search programs…" aria-label="Search programs" my="xs" />
      <ScrollArea className={classes.programs}>
        <Text size="sm" c="dimmed">
          No programs yet
        </Text>
      </ScrollArea>

      <NamePrompt
        opened={prompt !== null}
        title={prompt?.mode === 'rename' ? 'Rename playlist' : 'New playlist'}
        initialValue={prompt?.mode === 'rename' ? prompt.playlist.name : ''}
        submitLabel={prompt?.mode === 'rename' ? 'Save' : 'Create'}
        onSubmit={(name) =>
          prompt?.mode === 'rename'
            ? api.invoke('playlists:rename', prompt.playlist.id, name)
            : api.invoke('playlists:create', name)
        }
        onClose={() => setPrompt(null)}
      />
      <ConfirmDialog
        opened={deleting !== null}
        title="Delete playlist?"
        message={`"${deleting?.name}" will be deleted. The songs stay in your library.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (!deleting) return
          void api.invoke('playlists:delete', deleting.id)
          if (sameFilter(filter, { kind: 'playlist', playlistId: deleting.id }))
            void setFilter({ kind: 'all' })
        }}
        onClose={() => setDeleting(null)}
      />
    </nav>
  )
}
