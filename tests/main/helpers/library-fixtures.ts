import type { DatabaseSync } from 'node:sqlite'

// Builders for songs, dances and pairings in schema and search tests.

export function addFile(db: DatabaseSync, path = '/music/a.mp3'): number {
  return Number(
    db
      .prepare("INSERT INTO files (path, file_size, mtime_ms, source) VALUES (?, 1, 1, 'files')")
      .run(path).lastInsertRowid
  )
}

export function addSong(
  db: DatabaseSync,
  fileId: number,
  song: { title: string; artist?: string | null }
): number {
  return Number(
    db
      .prepare('INSERT INTO songs (file_id, uuid, title, artist) VALUES (?, ?, ?, ?)')
      .run(fileId, crypto.randomUUID(), song.title, song.artist ?? null).lastInsertRowid
  )
}

export function addDance(
  db: DatabaseSync,
  dance: { name: string; country?: string | null; choreographer?: string | null }
): number {
  return Number(
    db
      .prepare('INSERT INTO dances (uuid, name, country, choreographer) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), dance.name, dance.country ?? null, dance.choreographer ?? null)
      .lastInsertRowid
  )
}

// Links a dance to a song; returns the dance_songs id.
export function link(db: DatabaseSync, danceId: number, songId: number, teacher?: string): number {
  const id = Number(
    db.prepare('INSERT INTO dance_songs (dance_id, song_id) VALUES (?, ?)').run(danceId, songId)
      .lastInsertRowid
  )
  if (teacher) {
    db.prepare('INSERT INTO dance_song_prefs (dance_song_id, teacher) VALUES (?, ?)').run(
      id,
      teacher
    )
  }
  return id
}

// Titles of the songs matching an FTS5 query, in title order.
export function searchSongs(db: DatabaseSync, query: string): string[] {
  return db
    .prepare(
      `SELECT s.title FROM library_fts JOIN songs s ON s.id = library_fts.rowid
       WHERE library_fts MATCH ? ORDER BY s.title`
    )
    .all(query)
    .map((r) => r.title as string)
}

export interface SongView {
  title: string
  artist: string | null
  dance: string | null
  country: string | null
  choreographer: string | null
  teacher: string | null
}

// A file's song as the library shows it: with its default dance and that pairing's teacher.
export function songView(db: DatabaseSync, fileId: number): SongView {
  return db
    .prepare(
      `SELECT s.title, s.artist, d.name AS dance, d.country, d.choreographer, p.teacher
       FROM songs s
       LEFT JOIN song_prefs sp ON sp.song_id = s.id
       LEFT JOIN dances d ON d.id = sp.default_dance_id
       LEFT JOIN dance_songs ds ON ds.song_id = s.id AND ds.dance_id = d.id
       LEFT JOIN dance_song_prefs p ON p.dance_song_id = ds.id
       WHERE s.file_id = ?`
    )
    .get(fileId) as unknown as SongView
}
