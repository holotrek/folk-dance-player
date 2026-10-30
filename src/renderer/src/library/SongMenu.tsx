import { useState } from 'react'
import { ActionIcon, Menu } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import type { SongDance } from '@shared/library'
import { errorMessage } from '../ipc-error'
import { useEditSong } from '../navigation'
import { favoriteIds, pdfDanceIds, type RowTarget } from './row-targets'
import { useLibraryApi } from './LibraryProvider'

// A row's right-click opens its "⋯" menu (the button carries `data-options`).
export function openRowMenu(e: React.MouseEvent<HTMLElement>): void {
  const button = e.currentTarget.querySelector<HTMLElement>('[data-options]')
  if (!button) return
  e.preventDefault()
  button.click()
}

// The "⋯" menu of a song in the library list or Holding (spec §6.2, §6.3): Edit details opens it
// on the Music page; Open PDF when the dance has one; favorites. It shows on hover (the caller's `className`) or by right-click.
export default function SongMenu(props: {
  songId: number
  fileId: number
  danceId: number | null
  hasNotesPdf: boolean
  label: string
  isFavorite: boolean
  targets?: RowTarget[] // the songs the favorites items act on; this song alone by default
  danceCount?: number
  // Holding: the dance the song is held as, which the menu can change (when it has several).
  danceChoice?: { current: number | null; onChoose: (danceId: number) => void }
  // Holding: the last, red item (Release), which acts on the whole selection.
  onRemove?: { label: string; run: () => void }
  className?: string
}): React.JSX.Element {
  const api = useLibraryApi()
  const editSong = useEditSong()
  const targets = props.targets ?? [
    {
      fileId: props.fileId,
      isFavorite: props.isFavorite,
      danceId: props.danceId,
      hasNotesPdf: props.hasNotesPdf
    }
  ]
  const pdfs = pdfDanceIds(targets)
  const [dances, setDances] = useState<SongDance[]>([])
  return (
    <Menu
      position="right-start"
      withinPortal
      onOpen={() => {
        if (props.danceChoice && (props.danceCount ?? 1) > 1) {
          void api.invoke('library:song', props.songId).then((s) => setDances(s?.dances ?? []))
        }
      }}
    >
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size="sm"
          color="gray"
          className={props.className}
          aria-label={`Options for ${props.label}`}
          data-options
          // A click on the button isn't a click on the row (selecting it, or previewing on a double).
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          ⋯
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {targets.length < 2 && (
          <Menu.Item onClick={() => editSong(props.songId)}>Edit details</Menu.Item>
        )}
        {pdfs.length > 0 && (
          <Menu.Item
            onClick={() => {
              for (const danceId of pdfs) {
                void api
                  .invoke('library:openNotesPdf', danceId)
                  .catch((err) => notifications.show({ color: 'red', message: errorMessage(err) }))
              }
            }}
          >
            Open PDF
          </Menu.Item>
        )}
        {props.danceChoice && targets.length < 2 && dances.length > 1 && (
          <>
            <Menu.Label>Dance</Menu.Label>
            {dances.map((d) => (
              <Menu.Item
                key={d.danceId}
                leftSection={d.danceId === props.danceChoice!.current ? '✓' : null}
                onClick={() => props.danceChoice!.onChoose(d.danceId)}
              >
                {d.label}
              </Menu.Item>
            ))}
            <Menu.Divider />
          </>
        )}
        <FavoriteItems targets={targets} />
        {props.onRemove && (
          <Menu.Item color="red" onClick={props.onRemove.run}>
            {props.onRemove.label}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  )
}

// "Add to favorites" and/or "Remove from favorites": both for a mixed selection, each applying to
// all the songs.
export function FavoriteItems(props: { targets: RowTarget[] }): React.JSX.Element {
  const api = useLibraryApi()
  const ids = favoriteIds(props.targets)
  const set = (favorite: boolean) => () => void api.invoke('library:setFavorite', ids, favorite)
  return (
    <>
      {props.targets.some((t) => !t.isFavorite) && (
        <Menu.Item onClick={set(true)}>Add to favorites</Menu.Item>
      )}
      {props.targets.some((t) => t.isFavorite) && (
        <Menu.Item onClick={set(false)}>Remove from favorites</Menu.Item>
      )}
    </>
  )
}
