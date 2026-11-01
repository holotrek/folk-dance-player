import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Group, Text, Title } from '@mantine/core'
import type { ReapplyResult } from '@shared/library'
import AppleSyncStatusBar from '../apple-sync/AppleSyncStatusBar'
import AppleSyncSwitch from '../apple-sync/AppleSyncSwitch'
import { useAppleSync } from '../apple-sync/useAppleSync'
import ConfirmDialog from '../components/ConfirmDialog'
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
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false)
  const sync = useAppleSync(api)
  const syncOn = sync !== null && sync.state !== 'off'
  // Keep all / Remove all act on the review list's songs as shown (a search narrows them), so the
  // confirmation's count is what happens.
  const shownFileIds = (): number[] => store.getState().rows.map((r) => r.fileId)
  const playlists = useLibrary((s) => s.playlists)
  // A mirror of a Music playlist is read-only (sync spec §6.3).
  const inMirror =
    filter.kind === 'playlist' && playlists.some((p) => p.id === filter.playlistId && p.mirror)

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
          <Button onClick={flow.addMusic} data-tour="music.add">
            Add Music…
          </Button>
          {/* While Apple Music sync is on, Music is read directly (sync spec §5.7). */}
          {!syncOn && (
            <Button variant="default" onClick={flow.importFromApple}>
              Import from Apple Music…
            </Button>
          )}
          <AppleSyncSwitch api={api} status={sync} />
        </Group>
      </Group>
      <SlidesNotices state={slides} />
      <AppleSyncStatusBar api={api} status={sync} />
      {filter.kind === 'review' && (
        <Group>
          <Text size="sm" c="dimmed" style={{ flex: 1 }}>
            Apple Music no longer has these songs. Keep them as your own songs, or remove them from
            the library (their dances, notes and history are kept, and come back if the file is
            added again).
          </Text>
          <Button
            variant="default"
            disabled={selectedRows.length === 0}
            onClick={() =>
              act(() =>
                api.invoke(
                  'appleSync:resolve',
                  selectedRows.map((r) => r.fileId),
                  'keep'
                )
              )
            }
          >
            Keep
          </Button>
          <Button
            variant="default"
            disabled={selectedRows.length === 0}
            onClick={() =>
              act(() =>
                api.invoke(
                  'appleSync:resolve',
                  selectedRows.map((r) => r.fileId),
                  'remove'
                )
              )
            }
          >
            Remove
          </Button>
          <Button
            variant="default"
            onClick={() => act(() => api.invoke('appleSync:resolve', shownFileIds(), 'keep'))}
          >
            Keep all
          </Button>
          <Button variant="default" color="red" onClick={() => setConfirmRemoveAll(true)}>
            Remove all
          </Button>
        </Group>
      )}
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
            {filter.kind === 'playlist' && !inMirror && (
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
      <ConfirmDialog
        opened={confirmRemoveAll}
        title="Remove all these songs?"
        message="They leave the library. Their dances, notes and history are kept, and come back if the same file is added again."
        confirmLabel={`Remove ${rows.length} ${rows.length === 1 ? 'song' : 'songs'}`}
        danger
        onConfirm={() => void act(() => api.invoke('appleSync:resolve', shownFileIds(), 'remove'))}
        onClose={() => setConfirmRemoveAll(false)}
      />
    </div>
  )
}
