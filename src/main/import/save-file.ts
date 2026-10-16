import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import type { DatabaseSync } from 'node:sqlite'
import { mapTags, type ImportMapping, type MappedTags } from './mapping'
import type { FileFacts } from './read-file'

export type SaveOutcome = 'added' | 'updated' | 'relinked' | 'unchanged'

export interface SaveContext {
  source: 'files' | 'apple_xml'
  applePersistentId: string | null
  mapping: ImportMapping
}

interface FileRow {
  id: number
  path: string
  file_size: number
  mtime_ms: number
  duration_ms: number | null
  content_hash: string | null
  tag_title: string | null
  tag_artist: string | null
  tag_album_artist: string | null
  tag_genre: string | null
  apple_persistent_id: string | null
  is_missing: number
}

// The file columns an import writes, keyed by column name.
function fileColumns(facts: FileFacts): Record<string, string | number | null> {
  return {
    path: facts.path,
    file_size: facts.fileSize,
    mtime_ms: facts.mtimeMs,
    duration_ms: facts.durationMs,
    content_hash: facts.contentHash,
    tag_title: facts.tags.title,
    tag_artist: facts.tags.artist,
    tag_album_artist: facts.tags.albumArtist,
    tag_genre: facts.tags.genre,
    is_missing: 0,
    missing_reason: null
  }
}

function findExisting(db: DatabaseSync, facts: FileFacts, ctx: SaveContext): FileRow | undefined {
  const byPath = db.prepare('SELECT * FROM files WHERE path = ?').get(facts.path) as
    FileRow | undefined
  if (byPath) return byPath
  if (ctx.applePersistentId) {
    return db
      .prepare('SELECT * FROM files WHERE apple_persistent_id = ?')
      .get(ctx.applePersistentId) as FileRow | undefined
  }
  return undefined
}

// A file with the same fingerprint whose old copy is gone (or already marked missing) has moved.
function findMoved(db: DatabaseSync, facts: FileFacts): FileRow | undefined {
  const candidates = db
    .prepare('SELECT * FROM files WHERE content_hash = ? ORDER BY is_missing DESC, id')
    .all(facts.contentHash) as unknown as FileRow[]
  return candidates.find((row) => row.is_missing === 1 || !existsSync(row.path))
}

function updateFile(db: DatabaseSync, row: FileRow, facts: FileFacts, ctx: SaveContext): boolean {
  const next = fileColumns(facts)
  if (ctx.applePersistentId && row.apple_persistent_id === null) {
    const taken = db
      .prepare('SELECT 1 FROM files WHERE apple_persistent_id = ?')
      .get(ctx.applePersistentId)
    if (!taken) next.apple_persistent_id = ctx.applePersistentId
  }
  const current = row as unknown as Record<string, unknown>
  const changed = Object.keys(next).filter((col) => (current[col] ?? null) !== next[col])
  if (changed.length === 0) return false
  db.prepare(`UPDATE files SET ${changed.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
    ...changed.map((c) => next[c]),
    row.id
  )
  return true
}

// Fills the empty columns of one row with mapped values; returns whether anything changed.
function fillEmpty(
  db: DatabaseSync,
  table: string,
  where: string,
  id: number,
  values: Record<string, string | null>
): boolean {
  const cols = Object.keys(values)
  const row = db.prepare(`SELECT ${cols.join(', ')} FROM ${table} WHERE ${where} = ?`).get(id) as
    Record<string, string | null> | undefined
  if (!row) return false
  const empty = cols.filter((c) => (row[c] ?? '') === '' && values[c] !== null)
  if (empty.length === 0) return false
  db.prepare(
    `UPDATE ${table} SET ${empty.map((c) => `${c} = ?`).join(', ')} WHERE ${where} = ?`
  ).run(...empty.map((c) => values[c]), id)
  return true
}

// The pairing for the song's default dance (song_prefs.default_dance_id), if it is still linked,
// and how many songs that dance is linked to.
export function defaultPairing(
  db: DatabaseSync,
  songId: number
): { id: number; danceId: number; songCount: number } | undefined {
  return db
    .prepare(
      `SELECT ds.id, ds.dance_id AS danceId,
         (SELECT COUNT(*) FROM dance_songs o WHERE o.dance_id = ds.dance_id) AS songCount
       FROM song_prefs sp JOIN dance_songs ds
         ON ds.song_id = sp.song_id AND ds.dance_id = sp.default_dance_id
       WHERE sp.song_id = ?`
    )
    .get(songId) as { id: number; danceId: number; songCount: number } | undefined
}

// Re-imports never overwrite fields the user has edited; they only fill empty ones (spec §5.4):
// the song, its default dance, and that pairing's teacher. A dance shared with other songs is
// never filled from one song's tags (it would change every song using it), and nothing is filled
// when the song's default dance is no longer linked.
function fillEmptyFields(db: DatabaseSync, fileId: number, mapped: MappedTags): boolean {
  const { id: songId } = db.prepare('SELECT id FROM songs WHERE file_id = ?').get(fileId) as {
    id: number
  }
  let changed = fillEmpty(db, 'songs', 'id', songId, mapped.song)
  const pairing = defaultPairing(db, songId)
  if (!pairing) return changed
  if (pairing.songCount === 1) {
    changed = fillEmpty(db, 'dances', 'id', pairing.danceId, mapped.dance) || changed
  }
  if (mapped.teacher !== null) {
    db.prepare('INSERT OR IGNORE INTO dance_song_prefs (dance_song_id) VALUES (?)').run(pairing.id)
    changed =
      fillEmpty(db, 'dance_song_prefs', 'dance_song_id', pairing.id, { teacher: mapped.teacher }) ||
      changed
  }
  return changed
}

// A new file gets its song, an automatic dance with the song's title, the pairing between them,
// and that dance as the song's default (spec §4). Never linked to an existing dance by name.
function insertFile(
  db: DatabaseSync,
  facts: FileFacts,
  ctx: SaveContext,
  mapped: MappedTags
): number {
  const cols = {
    ...fileColumns(facts),
    source: ctx.source,
    apple_persistent_id: ctx.applePersistentId
  }
  const names = Object.keys(cols)
  const insert = (sql: string, ...values: (string | number | null)[]): number =>
    Number(db.prepare(sql).run(...values).lastInsertRowid)

  const fileId = insert(
    `INSERT INTO files (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(cols)
  )
  const songId = insert(
    'INSERT INTO songs (file_id, uuid, title, artist) VALUES (?, ?, ?, ?)',
    fileId,
    randomUUID(),
    mapped.song.title,
    mapped.song.artist
  )
  const danceId = insert(
    'INSERT INTO dances (uuid, name, country, choreographer) VALUES (?, ?, ?, ?)',
    randomUUID(),
    mapped.dance.name,
    mapped.dance.country,
    mapped.dance.choreographer
  )
  const pairingId = insert(
    'INSERT INTO dance_songs (dance_id, song_id) VALUES (?, ?)',
    danceId,
    songId
  )
  if (mapped.teacher !== null) {
    insert(
      'INSERT INTO dance_song_prefs (dance_song_id, teacher) VALUES (?, ?)',
      pairingId,
      mapped.teacher
    )
  }
  insert('INSERT INTO song_prefs (song_id, default_dance_id) VALUES (?, ?)', songId, danceId)
  return fileId
}

export function saveImportedFile(
  db: DatabaseSync,
  facts: FileFacts,
  ctx: SaveContext
): { outcome: SaveOutcome; fileId: number } {
  const mapped = mapTags(facts.tags, facts.path, ctx.mapping)

  const existing = findExisting(db, facts, ctx)
  if (existing) {
    const fileChanged = updateFile(db, existing, facts, ctx)
    const songChanged = fillEmptyFields(db, existing.id, mapped)
    return { outcome: fileChanged || songChanged ? 'updated' : 'unchanged', fileId: existing.id }
  }

  const moved = findMoved(db, facts)
  if (moved) {
    updateFile(db, moved, facts, ctx)
    fillEmptyFields(db, moved.id, mapped)
    return { outcome: 'relinked', fileId: moved.id }
  }

  return { outcome: 'added', fileId: insertFile(db, facts, ctx, mapped) }
}
