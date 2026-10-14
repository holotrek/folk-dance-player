import type { DatabaseSync } from 'node:sqlite'
import type { ImportMapping } from '@shared/import'
import type { ReapplyResult, Suggestions } from '@shared/library'
import { inTransaction } from '../db/transaction'
import { mapTags } from '../import/mapping'
import { shownPairingSql } from './list'

interface SongTags {
  songId: number
  path: string
  title: string | null
  artist: string | null
  albumArtist: string | null
  genre: string | null
  pairingId: number | null
  danceId: number | null
  danceSongs: number
}

// "Re-apply mapping to selected" (spec §5.2): deliberately overwrites the fields the current
// mapping targets, from each file's raw tags. A default dance shared with other songs is left
// unchanged (its country/choreographer would change for all of them) and counted as skipped.
export function reapplyMapping(
  db: DatabaseSync,
  songIds: number[],
  mapping: ImportMapping
): ReapplyResult {
  const targets = new Set([mapping.artistTagTarget, mapping.albumArtistTagTarget])
  const read = db.prepare(
    `SELECT s.id AS songId, f.path, f.tag_title AS title, f.tag_artist AS artist,
       f.tag_album_artist AS albumArtist, f.tag_genre AS genre, p.id AS pairingId, p.dance_id AS danceId,
       (SELECT COUNT(*) FROM dance_songs c WHERE c.dance_id = p.dance_id) AS danceSongs
     FROM songs s JOIN files f ON f.id = s.file_id
     LEFT JOIN dance_songs p ON p.id = ${shownPairingSql('s.id')}
     WHERE s.id = ?`
  )
  const result: ReapplyResult = { songs: 0, skippedSharedDances: 0 }
  inTransaction(db, () => {
    for (const songId of songIds) {
      const row = read.get(songId) as SongTags | undefined
      if (!row) continue
      const mapped = mapTags(row, row.path, mapping)
      result.songs += 1
      if (targets.has('artist')) {
        db.prepare('UPDATE songs SET artist = ? WHERE id = ?').run(mapped.song.artist, songId)
      }
      if (row.pairingId === null || row.danceId === null) continue
      if (targets.has('teacher')) {
        db.prepare('INSERT OR IGNORE INTO dance_song_prefs (dance_song_id) VALUES (?)').run(
          row.pairingId
        )
        db.prepare('UPDATE dance_song_prefs SET teacher = ? WHERE dance_song_id = ?').run(
          mapped.teacher,
          row.pairingId
        )
      }
      const danceFields: Record<string, string | null> = {}
      if (targets.has('choreographer')) danceFields.choreographer = mapped.dance.choreographer
      if (mapping.genreIsCountry) danceFields.country = mapped.dance.country
      if (Object.keys(danceFields).length === 0) continue
      if (row.danceSongs > 1) {
        result.skippedSharedDances += 1
        continue
      }
      const cols = Object.keys(danceFields)
      db.prepare(`UPDATE dances SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
        ...cols.map((c) => danceFields[c]),
        row.danceId
      )
    }
  })
  return result
}

const distinct = (db: DatabaseSync, sql: string): string[] =>
  db
    .prepare(sql)
    .all()
    .map((r) => (r.value as string).trim())
    .filter(Boolean)

const sorted = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

export function getSuggestions(db: DatabaseSync, danceTypeSuggestions: string[]): Suggestions {
  return {
    people: sorted([
      ...distinct(
        db,
        'SELECT DISTINCT teacher AS value FROM dance_song_prefs WHERE teacher IS NOT NULL'
      ),
      ...distinct(
        db,
        'SELECT DISTINCT choreographer AS value FROM dances WHERE choreographer IS NOT NULL'
      )
    ]),
    countries: sorted(
      distinct(db, 'SELECT DISTINCT country AS value FROM dances WHERE country IS NOT NULL')
    ),
    danceTypes: sorted([
      ...danceTypeSuggestions,
      ...distinct(
        db,
        'SELECT DISTINCT dance_type AS value FROM dances WHERE dance_type IS NOT NULL'
      )
    ])
  }
}
