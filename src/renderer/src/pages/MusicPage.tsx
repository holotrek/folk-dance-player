import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Group, Text, Title } from '@mantine/core'
import type { ReapplyResult } from '@shared/library'
import DropZone from '../import/DropZone'
import ImportDialog from '../import/ImportDialog'
import { useImportFlow } from '../import/useImportFlow'
import { errorMessage } from '../ipc-error'
import LibraryFilterNote from '../library/LibraryFilterNote'
import LibrarySearch from '../library/LibrarySearch'
import LibraryTable from '../library/LibraryTable'
import ReapplyDialog from '../library/ReapplyDialog'
import { SlidesNotices, SlidesRefreshButton, useSlidesRefresh } from '../library/SlidesRefresh'
import SongEditor from '../library/SongEditor'
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

// Spec §6.3: browse, search and organize the library; import music; refresh Canva slides.
export default function MusicPage(): React.JSX.Element {
  const api = useLibraryApi()
  const store = useLibraryStore()
  const filter = useLibrary((s) => s.filter)
  const selected = useLibrary((s) => s.selected)
  const rows = useLibrary((s) => s.rows)
  const [fileCount, setFileCount] = useState<number | null>(null)
  const [confirmReapply, setConfirmReapply] = useState(false)
  // The selection when the dialog opened, so a refresh behind the dialog can't change it.
  const [reapplyIds, setReapplyIds] = useState<number[]>([])
  const [notice, setNotice] = useState<{ color: string; text: string } | null>(null)

  const refresh = useCallback(() => {
    api.invoke('library:stats').then((s) => setFileCount(s.fileCount))
  }, [api])
  useEffect(refresh, [refresh])
  const flow = useImportFlow(api, refresh)
  const slides = useSlidesRefresh()

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
          <SlidesRefreshButton state={slides} />
          <Button onClick={flow.addMusic}>Add Music…</Button>
          <Button variant="default" onClick={flow.importFromApple}>
            Import from Apple Music…
          </Button>
        </Group>
      </Group>
      <SlidesNotices state={slides} />
      <Group>
        <LibrarySearch style={{ flex: 1 }} />
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
            <Button
              variant="default"
              onClick={() => {
                setReapplyIds(
                  store
                    .getState()
                    .selectedRows()
                    .map((r) => r.songId)
                )
                setConfirmReapply(true)
              }}
            >
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
      <LibraryFilterNote />
      <div className={classes.body}>
        <LibraryTable />
        {selected.length === 1 && (
          <aside className={classes.editor} aria-label="Song editor">
            <SongEditor key={selected[0]} songId={selected[0]} />
          </aside>
        )}
      </div>
      <ImportDialog flow={flow} />
      <ReapplyDialog
        opened={confirmReapply}
        songIds={reapplyIds}
        onConfirm={(mapping) =>
          act(async () => {
            const result = await api.invoke('library:reapplyMapping', reapplyIds, mapping)
            setNotice({ color: 'blue', text: reapplyMessage(result) })
          })
        }
        onClose={() => setConfirmReapply(false)}
      />
    </div>
  )
}
