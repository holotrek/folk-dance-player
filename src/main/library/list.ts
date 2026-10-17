import type { DatabaseSync } from 'node:sqlite'
import { formatLabel, labelParts } from '@shared/labels'
import type { LibraryQuery, LibraryRow, SortColumn } from '@shared/library'
import { toFtsQuery } from '../db/fts'

// The pairing a song is shown with (spec §4): its default dance if still linked, else its
// earliest-linked dance. `songId` is a SQL expression for the song's id.
export const shownPairingSql = (songId: string): string => `COALESCE(
  (SELECT ds.id FROM dance_songs ds JOIN song_prefs sp
     ON sp.song_id = ds.song_id AND sp.default_dance_id = ds.dance_id
   WHERE ds.song_id = ${songId}),
  (SELECT ds.id FROM dance_songs ds WHERE ds.song_id = ${songId} ORDER BY ds.id LIMIT 1))`

// How many different (non-empty) choreographers a song's dances have; drives the label.
export const choreographerCountSql = (songId: string): string => `(
  SELECT COUNT(DISTINCT trim(d2.choreographer)) FROM dance_songs x JOIN dances d2 ON d2.id = x.dance_id
  WHERE x.song_id = ${songId} AND trim(COALESCE(d2.choreographer, '')) <> '')`

const SORT_SQL: Record<SortColumn, string> = {
  title: 's.title COLLATE NOCASE',
  dance: 'd.name COLLATE NOCASE',
  country: 'd.country COLLATE NOCASE',
  teacher: 'dsp.teacher COLLATE NOCASE',
  choreographer: 'd.choreographer COLLATE NOCASE',
  danceType: 'd.dance_type COLLATE NOCASE',
  difficulty: 'dp.difficulty',
  duration: 'f.duration_ms',
  position: 'pi.position'
}

interface Row {
  fileId: number
  songId: number
  title: string
  artist: string | null
  path: string
  durationMs: number | null
  isMissing: number
  isFavorite: number
  danceId: number | null
  danceName: string | null
  country: string | null
  choreographer: string | null
  teacher: string | null
  danceType: string | null
  difficulty: number | null
  danceCount: number
  choreographerCount: number
  playlistItemId: number | null
  playlistNumber: number | null
}

// The Music page's rows (spec §6.3): search, sidebar filter and sort are all done here.
export function listLibrary(db: DatabaseSync, query: LibraryQuery): LibraryRow[] {
  // A removed song (sync spec §6.4) is never listed; the review list shows songs Music no longer
  // has that haven't been decided yet.
  const where: string[] = ['f.removed_at IS NULL']
  const params: (string | number)[] = []
  if (query.filter.kind === 'review') where.push("f.apple_sync = 'gone'")
  const fts = toFtsQuery(query.search)
  if (fts) {
    where.push('s.id IN (SELECT rowid FROM library_fts WHERE library_fts MATCH ?)')
    params.push(fts)
  }
  if (query.filter.kind === 'favorites') where.push('fp.is_favorite = 1')
  if (query.filter.kind === 'holding') where.push('fp.in_holding = 1')

  const playlistId = query.filter.kind === 'playlist' ? query.filter.playlistId : null
  const playlist = playlistId !== null
  const playlistJoin = playlist
    ? 'JOIN playlist_items pi ON pi.file_id = f.id AND pi.playlist_id = ?'
    : ''
  if (playlistId !== null) params.unshift(playlistId)
  // Sorting by playlist position outside a playlist falls back to title.
  // Holding keeps the order songs were placed in (spec §6.2), whatever sort is asked for.
  const holding = query.filter.kind === 'holding'
  const sortExpr = holding
    ? 'fp.holding_position'
    : query.sort.column === 'position' && !playlist
      ? SORT_SQL.title
      : SORT_SQL[query.sort.column]
  const direction = !holding && query.sort.direction === 'desc' ? 'DESC' : 'ASC'

  const rows = db
    .prepare(
      `SELECT f.id AS fileId, s.id AS songId, s.title, s.artist, f.path, f.duration_ms AS durationMs,
         f.is_missing AS isMissing, COALESCE(fp.is_favorite, 0) AS isFavorite,
         d.id AS danceId, d.name AS danceName, d.country, d.choreographer, dsp.teacher,
         d.dance_type AS danceType, dp.difficulty,
         (SELECT COUNT(*) FROM dance_songs c WHERE c.song_id = s.id) AS danceCount,
         ${choreographerCountSql('s.id')} AS choreographerCount,
         ${playlist ? 'pi.id' : 'NULL'} AS playlistItemId,
         ${
           playlist
             ? `(SELECT COUNT(*) FROM playlist_items x JOIN files xf ON xf.id = x.file_id
                 WHERE x.playlist_id = pi.playlist_id AND x.position <= pi.position
                   AND xf.removed_at IS NULL)`
             : 'NULL'
         } AS playlistNumber
       FROM songs s
       JOIN files f ON f.id = s.file_id
       ${playlistJoin}
       LEFT JOIN file_prefs fp ON fp.file_id = f.id
       LEFT JOIN dance_songs p ON p.id = ${shownPairingSql('s.id')}
       LEFT JOIN dances d ON d.id = p.dance_id
       LEFT JOIN dance_prefs dp ON dp.dance_id = d.id
       LEFT JOIN dance_song_prefs dsp ON dsp.dance_song_id = p.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY (${sortExpr}) IS NULL OR (${sortExpr}) = '', ${sortExpr} ${direction},
         s.title COLLATE NOCASE, s.id`
    )
    .all(...params) as unknown as Row[]

  return rows.map(({ choreographerCount, isMissing, isFavorite, ...r }) => ({
    ...r,
    isMissing: isMissing === 1,
    isFavorite: isFavorite === 1,
    label: formatLabel(
      labelParts({
        songTitle: r.title,
        danceName: r.danceName,
        choreographer: r.choreographer,
        choreographerCount
      })
    )
  }))
}
