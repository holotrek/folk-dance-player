import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import { ImportBusyError, ImportService } from '../../../src/main/import/import-service'
import { startInProcessWorker } from '../../../src/main/import/in-process-worker'
import type { ImportMapping } from '../../../src/main/import/mapping'
import type { FileFacts } from '../../../src/main/import/read-file'
import { saveImportedFile, type SaveContext } from '../../../src/main/import/save-file'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { removeSong, songView } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

// Add Music… while Apple Music sync is on (sync spec §5.7), and removed songs added again (§7.3).
const mapping: ImportMapping = {
  artistTagTarget: 'artist',
  albumArtistTagTarget: 'ignore',
  genreIsCountry: true
}
const ctx: SaveContext = { source: 'files', applePersistentId: null, mapping }

let db: DatabaseSync
beforeEach(() => (db = createTestDb()))

const facts = (path: string, hash: string, title = 'Kolo'): FileFacts => ({
  path,
  fileSize: 1000,
  mtimeMs: 1_700_000_000_000,
  durationMs: 180_000,
  contentHash: hash,
  tags: { title, artist: null, albumArtist: null, genre: null }
})
const synced = (fileId: number) =>
  db.prepare("UPDATE files SET apple_sync = 'synced' WHERE id = ?").run(fileId)

describe('while Apple Music sync is on (sync spec §5.7)', () => {
  test('the exact file a synced song uses is already present, and nothing changes', () => {
    const first = saveImportedFile(db, facts('/m/Kolo.mp3', 'h1'), ctx)
    synced(first.fileId)
    db.prepare("UPDATE songs SET title = 'From Music' WHERE file_id = ?").run(first.fileId)
    expect(saveImportedFile(db, facts('/m/Kolo.mp3', 'h1', 'File tag'), ctx)).toEqual({
      outcome: 'appleSynced',
      fileId: first.fileId
    })
    expect(songView(db, first.fileId).title).toBe('From Music')
  })

  test('a copy of a synced song is skipped', () => {
    const first = saveImportedFile(db, facts('/m/Kolo.mp3', 'h1'), ctx)
    synced(first.fileId)
    expect(saveImportedFile(db, facts('/Downloads/Kolo.mp3', 'h1'), ctx).outcome).toBe(
      'appleSynced'
    )
    expect(db.prepare('SELECT COUNT(*) AS n FROM files').get()).toEqual({ n: 1 })
  })

  test('copies of local songs behave as before (not skipped)', () => {
    saveImportedFile(db, facts('/m/Kolo.mp3', 'h1'), ctx)
    // The first path isn't on disk here, so the existing rule relinks the song to the copy.
    expect(saveImportedFile(db, facts('/Downloads/Kolo.mp3', 'h1'), ctx).outcome).toBe('relinked')
  })
})

describe('removed songs (sync spec §7.3)', () => {
  test('adding the same file again restores the song as a local song', () => {
    const first = saveImportedFile(db, facts('/m/Kolo.mp3', 'h1'), ctx)
    removeSong(db, first.fileId)
    expect(saveImportedFile(db, facts('/m/Kolo.mp3', 'h1'), ctx)).toEqual({
      outcome: 'restored',
      fileId: first.fileId
    })
    expect(db.prepare('SELECT removed_at, apple_sync FROM files').get()).toEqual({
      removed_at: null,
      apple_sync: null
    })
  })

  test('adding a copy restores it too, pointing at the copy', () => {
    const first = saveImportedFile(db, facts('/m/Kolo.mp3', 'h1'), ctx)
    removeSong(db, first.fileId)
    expect(saveImportedFile(db, facts('/Downloads/Kolo.mp3', 'h1'), ctx).outcome).toBe('restored')
    expect(db.prepare('SELECT path FROM files').get()).toEqual({ path: '/Downloads/Kolo.mp3' })
  })
})

describe('ImportService while syncing', () => {
  const service = (deps: { syncEnabled?: () => boolean; isSyncing?: () => boolean }) =>
    new ImportService({
      db,
      settings: new SettingsStore(db),
      startWorker: startInProcessWorker,
      onProgress: () => undefined,
      ...deps
    })

  test('a Library.xml import is refused while sync is on', async () => {
    await expect(
      service({ syncEnabled: () => true }).run({
        kind: 'apple',
        xmlPath: '/x.xml',
        selection: { mode: 'all' },
        decisions: {}
      })
    ).rejects.toThrow('Turn off Sync with Apple Music')
  })

  test('an import is refused while a sync runs', async () => {
    await expect(
      service({ isSyncing: () => true }).run({ kind: 'paths', paths: ['/nowhere'] })
    ).rejects.toThrow(ImportBusyError)
  })
})
