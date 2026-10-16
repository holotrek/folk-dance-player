import type { DatabaseSync } from 'node:sqlite'
import { mapTags, type ImportMapping, type MappedTags, type RawTags } from '../import/mapping'
import { defaultPairing } from '../import/save-file'

// The fields sync keeps in step with Music's tags (sync spec §5.4): the song's title and artist, its
// default dance's name, country and choreographer (only while that dance has this one song), and
// that pairing's teacher.
export type SyncField = 'title' | 'artist' | 'danceName' | 'country' | 'choreographer' | 'teacher'
export type SyncBaseline = Record<SyncField, string | null>

const FIELDS: readonly SyncField[] = [
  'title',
  'artist',
  'danceName',
  'country',
  'choreographer',
  'teacher'
]

const norm = (v: string | null | undefined): string | null => v?.trim() || null

const baselineOf = (m: MappedTags): SyncBaseline => ({
  title: m.song.title,
  artist: m.song.artist,
  danceName: m.dance.name,
  country: m.dance.country,
  choreographer: m.dance.choreographer,
  teacher: m.teacher
})

function parseBaseline(text: string | null): SyncBaseline | null {
  if (!text) return null
  try {
    const value = JSON.parse(text) as Record<string, unknown>
    return FIELDS.every((f) => value[f] === null || typeof value[f] === 'string')
      ? (value as SyncBaseline)
      : null
  } catch {
    return null
  }
}

interface FileTags {
  path: string
  sync_baseline: string | null
  tag_title: string | null
  tag_artist: string | null
  tag_album_artist: string | null
  tag_genre: string | null
}

// A field changes only when Music changed it and the app still has the value sync last wrote; the
// baseline always moves to Music's value, so a field edited here is never overridden later.
export function applyMusicTags(
  db: DatabaseSync,
  fileId: number,
  tags: RawTags,
  mapping: ImportMapping
): boolean {
  const file = db
    .prepare(
      'SELECT path, sync_baseline, tag_title, tag_artist, tag_album_artist, tag_genre FROM files WHERE id = ?'
    )
    .get(fileId) as FileTags | undefined
  const song = db.prepare('SELECT id, title, artist FROM songs WHERE file_id = ?').get(fileId) as
    { id: number; title: string; artist: string | null } | undefined
  if (!file || !song) return false

  const next = baselineOf(mapTags(tags, file.path, mapping))
  // Songs imported before sync, or adopted local songs: what an import of their stored tags wrote.
  const base =
    parseBaseline(file.sync_baseline) ??
    baselineOf(
      mapTags(
        {
          title: file.tag_title,
          artist: file.tag_artist,
          albumArtist: file.tag_album_artist,
          genre: file.tag_genre
        },
        file.path,
        mapping
      )
    )

  const pairing = defaultPairing(db, song.id)
  const dance =
    pairing && pairing.songCount === 1
      ? (db
          .prepare('SELECT name, country, choreographer FROM dances WHERE id = ?')
          .get(pairing.danceId) as {
          name: string
          country: string | null
          choreographer: string | null
        })
      : null
  const current: Partial<SyncBaseline> = { title: song.title, artist: song.artist }
  if (dance) {
    current.danceName = dance.name
    current.country = dance.country
    current.choreographer = dance.choreographer
  }
  if (pairing) {
    const row = db
      .prepare('SELECT teacher FROM dance_song_prefs WHERE dance_song_id = ?')
      .get(pairing.id) as { teacher: string | null } | undefined
    current.teacher = row?.teacher ?? null
  }

  const writes = FIELDS.filter(
    (f) => f in current && norm(next[f]) !== norm(base[f]) && norm(current[f]) === norm(base[f])
  )
  const set = (table: string, column: string, where: string, value: string | null, id: number) =>
    db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${where} = ?`).run(value, id)
  for (const f of writes) {
    if (f === 'title') set('songs', 'title', 'id', next.title, song.id)
    else if (f === 'artist') set('songs', 'artist', 'id', next.artist, song.id)
    else if (f === 'danceName') set('dances', 'name', 'id', next.danceName, pairing!.danceId)
    else if (f === 'country') set('dances', 'country', 'id', next.country, pairing!.danceId)
    else if (f === 'choreographer')
      set('dances', 'choreographer', 'id', next.choreographer, pairing!.danceId)
    else {
      db.prepare('INSERT OR IGNORE INTO dance_song_prefs (dance_song_id) VALUES (?)').run(
        pairing!.id
      )
      set('dance_song_prefs', 'teacher', 'dance_song_id', next.teacher, pairing!.id)
    }
  }
  db.prepare(
    `UPDATE files SET sync_baseline = ?, tag_title = ?, tag_artist = ?, tag_album_artist = ?,
       tag_genre = ? WHERE id = ?`
  ).run(JSON.stringify(next), tags.title, tags.artist, tags.albumArtist, tags.genre, fileId)
  return writes.length > 0
}
