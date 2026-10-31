import { useEffect, useRef, useState } from 'react'
import { NavLink } from '@mantine/core'
import type { PlaylistFolder } from '@shared/apple-sync'
import type { RendererApi } from '@shared/contract'
import type { PlaylistSummary } from '@shared/library'

export interface FolderNode {
  folder: PlaylistFolder
  folders: FolderNode[]
  playlists: PlaylistSummary[]
}

// Music's folders as a tree (sync spec §6.2). Folders keep Music's order; playlists keep the list's
// order (mirrors, then local). A playlist whose folder is gone shows at the top level.
export function buildTree(
  folders: PlaylistFolder[],
  playlists: PlaylistSummary[]
): { folders: FolderNode[]; playlists: PlaylistSummary[] } {
  const nodes = new Map<number, FolderNode>(
    folders.map((f) => [f.id, { folder: f, folders: [], playlists: [] }])
  )
  const top: FolderNode[] = []
  for (const node of nodes.values()) {
    const parent = node.folder.parentId === null ? undefined : nodes.get(node.folder.parentId)
    ;(parent ? parent.folders : top).push(node)
  }
  const loose: PlaylistSummary[] = []
  for (const p of playlists) {
    const folder = p.folderId === null ? undefined : nodes.get(p.folderId)
    ;(folder ? folder.playlists : loose).push(p)
  }
  return { folders: top, playlists: loose }
}

// Which folders are open, by persistent ID, saved in the playlistFolders.open setting. The saved
// list is read once; if a folder was toggled before it arrived, the toggles win. `latest` is the
// current set, so two quick clicks both count.
export function useOpenFolders(api: RendererApi): [Set<string>, (id: string) => void] {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const latest = useRef<Set<string>>(open)
  const toggled = useRef(false)
  useEffect(() => {
    let live = true
    void api.invoke('settings:getAll').then((s) => {
      if (!live || toggled.current) return
      latest.current = new Set(s['playlistFolders.open'])
      setOpen(latest.current)
    })
    return () => {
      live = false
    }
  }, [api])
  const toggle = (id: string): void => {
    toggled.current = true
    const next = new Set(latest.current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    latest.current = next
    setOpen(next)
    void api.invoke('settings:set', 'playlistFolders.open', [...next])
  }
  return [open, toggle]
}

// A collapsible folder; not selectable as a playlist.
export function FolderEntry(props: {
  node: FolderNode
  open: Set<string>
  onToggle: (id: string) => void
  renderPlaylist: (p: PlaylistSummary) => React.ReactNode
}): React.JSX.Element {
  const { node, open, onToggle, renderPlaylist } = props
  const id = node.folder.persistentId
  return (
    <NavLink
      label={node.folder.name}
      data-tour={`sidebar.folder:${node.folder.name}`}
      opened={id !== null && open.has(id)}
      onChange={() => id !== null && onToggle(id)}
      childrenOffset="sm"
    >
      {node.folders.map((child) => (
        <FolderEntry key={child.folder.id} {...props} node={child} />
      ))}
      {node.playlists.map(renderPlaylist)}
    </NavLink>
  )
}
