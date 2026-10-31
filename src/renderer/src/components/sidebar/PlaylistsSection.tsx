import { useRef, useState } from 'react'
import { ActionIcon, Group, Menu, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import type { PlaylistSummary } from '@shared/library'
import { useLibrary, useLibraryApi } from '../../library/LibraryProvider'
import ConfirmDialog from '../ConfirmDialog'
import { MusicNoteIcon } from '../icons'
import NamePrompt from '../NamePrompt'
import classes from '../Sidebar.module.css'
import DropTarget from './DropTarget'
import FilterEntry, { sameFilter } from './FilterEntry'
import { buildTree, FolderEntry, useOpenFolders } from './PlaylistTree'
import SectionHeading from './SectionHeading'

// A playlist in the sidebar: a drop target, with an options menu ("⋯", or right-click). A mirror of
// a Music playlist is read-only (sync spec §6.3): it is marked, takes no drops, and its menu only
// duplicates it.
function PlaylistEntry(props: {
  playlist: PlaylistSummary
  onRename: () => void
  onDelete: () => void
}): React.JSX.Element {
  const api = useLibraryApi()
  const options = useRef<HTMLButtonElement>(null)
  const p = props.playlist
  return (
    <div
      className={classes.entry}
      onContextMenu={(e) => {
        e.preventDefault()
        options.current?.click()
      }}
    >
      <DropTarget
        onFiles={(ids) =>
          p.mirror
            ? notifications.show({ message: 'Edit this playlist in Music.', color: 'yellow' })
            : void api.invoke('playlists:add', p.id, ids)
        }
      >
        <FilterEntry
          label={p.name}
          filter={{ kind: 'playlist', playlistId: p.id }}
          extra={
            p.mirror ? (
              <Text
                span
                c="dimmed"
                aria-label="Apple Music playlist"
                title="Synced from Apple Music"
              >
                <MusicNoteIcon size={12} />
              </Text>
            ) : p.source === 'apple_xml' ? (
              <Text
                span
                size="xs"
                c="dimmed"
                aria-label="From Apple Music"
                title="Imported from Apple Music"
              ></Text>
            ) : undefined
          }
        />
      </DropTarget>
      <Menu position="right-start" withinPortal>
        <Menu.Target>
          <ActionIcon
            ref={options}
            variant="subtle"
            size="sm"
            className={classes.options}
            aria-label={`Options for ${p.name}`}
            data-tour={`sidebar.playlist-options:${p.name}`}
          >
            ⋯
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {p.mirror ? (
            <Menu.Item onClick={() => void api.invoke('playlists:duplicate', p.id)}>
              Duplicate as my playlist
            </Menu.Item>
          ) : (
            <>
              <Menu.Item onClick={props.onRename}>Rename…</Menu.Item>
              <Menu.Item onClick={() => void api.invoke('playlists:duplicate', p.id)}>
                Duplicate
              </Menu.Item>
              <Menu.Item color="red" onClick={props.onDelete}>
                Delete…
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    </div>
  )
}

// Spec §6.1 PLAYLISTS: its own scroll container, at most 40% of the sidebar.
export default function PlaylistsSection(): React.JSX.Element {
  const api = useLibraryApi()
  const filter = useLibrary((s) => s.filter)
  const setFilter = useLibrary((s) => s.setFilter)
  const playlists = useLibrary((s) => s.playlists)
  const folders = useLibrary((s) => s.folders)
  const [open, toggle] = useOpenFolders(api)
  const [prompt, setPrompt] = useState<
    { mode: 'create' } | { mode: 'rename'; playlist: PlaylistSummary } | null
  >(null)
  const [deleting, setDeleting] = useState<PlaylistSummary | null>(null)
  // Music's folders first (sync spec §6.2), then the playlists outside any folder.
  const tree = buildTree(folders, playlists)
  const entry = (p: PlaylistSummary): React.ReactNode => (
    <PlaylistEntry
      key={p.id}
      playlist={p}
      onRename={() => setPrompt({ mode: 'rename', playlist: p })}
      onDelete={() => setDeleting(p)}
    />
  )

  return (
    <>
      <Group justify="space-between" mt="md">
        <SectionHeading>Playlists</SectionHeading>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="New playlist"
          onClick={() => setPrompt({ mode: 'create' })}
        >
          +
        </ActionIcon>
      </Group>
      <div
        className={classes.playlists}
        role="group"
        aria-label="Playlists"
        data-tour="sidebar.playlists"
      >
        {playlists.length === 0 && (
          <Text size="sm" c="dimmed">
            No playlists yet
          </Text>
        )}
        {tree.folders.map((node) => (
          <FolderEntry
            key={node.folder.id}
            node={node}
            open={open}
            onToggle={toggle}
            renderPlaylist={entry}
          />
        ))}
        {tree.playlists.map(entry)}
      </div>
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
    </>
  )
}
