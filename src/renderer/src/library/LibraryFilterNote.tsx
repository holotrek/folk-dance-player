import { Button, Text } from '@mantine/core'
import { useLibrary } from './LibraryProvider'
import classes from './LibraryFilterNote.module.css'

// Says when the library list is narrowed to a playlist or the favorites (chosen in the sidebar),
// so a short list never looks like the whole library; "Show all music" goes back.
export default function LibraryFilterNote(): React.JSX.Element | null {
  const filter = useLibrary((s) => s.filter)
  const playlists = useLibrary((s) => s.playlists)
  const setFilter = useLibrary((s) => s.setFilter)
  if (filter.kind !== 'favorites' && filter.kind !== 'playlist') return null
  const name =
    filter.kind === 'favorites'
      ? 'Favorites'
      : `playlist “${playlists.find((p) => p.id === filter.playlistId)?.name ?? '…'}”`
  return (
    <div className={classes.note}>
      <Text size="sm" fw={500}>
        Showing {name}
      </Text>
      <Button size="compact-xs" variant="subtle" onClick={() => void setFilter({ kind: 'all' })}>
        Show all music
      </Button>
    </div>
  )
}
