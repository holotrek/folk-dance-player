import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Group, Text, TextInput, Title } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import type { ReapplyResult } from '@shared/library'
import ConfirmDialog from '../components/ConfirmDialog'
import DropZone from '../import/DropZone'
import ImportDialog from '../import/ImportDialog'
import { useImportFlow } from '../import/useImportFlow'
import { errorMessage } from '../ipc-error'
import LibraryTable from '../library/LibraryTable'
import { useLibrary, useLibraryApi, useLibraryStore } from '../library/LibraryProvider'
import classes from './MusicPage.module.css'

const songCount = (n: number): string =>
  n === 0 ? 'Your library is empty.' : `${n} ${n === 1 ? 'song' : 'songs'} in your library`

function reapplyMessage(result: ReapplyResult): string {
  const songs = `Updated ${result.songs} ${result.songs === 1 ? 'song' : 'songs'}.`
  const n = result.skippedSharedDances
  if (n === 0) return songs
  return `${songs} ${n} ${n === 1 ? 'dance used by other songs was' : 'dances used by other songs were'} left unchanged.`
}

// Spec §6.3: browse, search and organize the library; import music.
export default function MusicPage(): React.JSX.Element {
  const api = useLibraryApi()
  const store = useLibraryStore()
  const filter = useLibrary((s) => s.filter)
  const selected = useLibrary((s) => s.selected)
  const rows = useLibrary((s) => s.rows)
  const setSearch = useLibrary((s) => s.setSearch)
  const [fileCount, setFileCount] = useState<number | null>(null)
  const [search, setSearchText] = useState('')
  const [debounced] = useDebouncedValue(search, 150)
  const [confirmReapply, setConfirmReapply] = useState(false)
  const [notice, setNotice] = useState<{ color: string; text: string } | null>(null)

  const refresh = useCallback(() => {
    api.invoke('library:stats').then((s) => setFileCount(s.fileCount))
  }, [api])
  useEffect(refresh, [refresh])
  useEffect(() => {
    void setSearch(debounced)
  }, [debounced, setSearch])
  const flow = useImportFlow(api, refresh)

  const chosen = new Set(selected)
  const selectedRows = rows.filter((r) => chosen.has(r.songId))
  const allFavorite = selectedRows.length > 0 && selectedRows.every((r) => r.isFavorite)

  const act = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      await action()
    } catch (err) {
      setNotice({ color: 'red', text: errorMessage(err) })
    }
  }

  return (
    <div className={classes.root}>
      <Group justify="space-between">
        <div>
          <Title order={2}>Music</Title>
          {fileCount !== null && <Text c="dimmed">{songCount(fileCount)}</Text>}
        </div>
        <Group>
          <Button onClick={flow.addMusic}>Add Music…</Button>
          <Button variant="default" onClick={flow.importFromApple}>
            Import from Apple Music…
          </Button>
        </Group>
      </Group>
      <Group>
        <TextInput
          type="search"
          role="searchbox"
          aria-label="Search music"
          placeholder="Search song, dance, teacher, choreographer or country"
          value={search}
          onChange={(e) => setSearchText(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        {selected.length > 0 && (
          <>
            <Button
              variant="default"
              onClick={() =>
                act(() =>
                  api.invoke(
                    'library:setFavorite',
                    selectedRows.map((r) => r.fileId),
                    !allFavorite
                  )
                )
              }
            >
              {allFavorite ? 'Unfavorite' : 'Favorite'}
            </Button>
            <Button variant="default" onClick={() => setConfirmReapply(true)}>
              Re-apply mapping…
            </Button>
            {filter.kind === 'playlist' && (
              <Button
                variant="default"
                onClick={() =>
                  act(() =>
                    api.invoke(
                      'playlists:remove',
                      filter.playlistId,
                      selectedRows.map((r) => r.playlistItemId!)
                    )
                  )
                }
              >
                Remove from playlist
              </Button>
            )}
          </>
        )}
      </Group>
      {notice && (
        <Alert color={notice.color} withCloseButton onClose={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}
      <DropZone onFiles={flow.dropFiles} />
      <div className={classes.body}>
        <LibraryTable />
      </div>
      <ImportDialog flow={flow} />
      <ConfirmDialog
        opened={confirmReapply}
        title="Re-apply mapping?"
        message={`Re-apply the import mapping to ${selected.length} ${
          selected.length === 1 ? 'song' : 'songs'
        }? Their artist, teacher, choreographer and country are replaced from the files' tags, using the mapping in Settings.`}
        confirmLabel="Re-apply"
        onConfirm={() =>
          act(async () => {
            const ids = store
              .getState()
              .selectedRows()
              .map((r) => r.songId)
            const result = await api.invoke('library:reapplyMapping', ids)
            setNotice({ color: 'blue', text: reapplyMessage(result) })
          })
        }
        onClose={() => setConfirmReapply(false)}
      />
    </div>
  )
}
