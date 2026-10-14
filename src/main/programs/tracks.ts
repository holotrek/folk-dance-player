import type { DatabaseSync } from 'node:sqlite'
import { formatLabel, labelParts } from '@shared/labels'
import type { Track } from '@shared/program'
import { choreographerCountSql, shownPairingSql } from '../library/list'

// The columns of a Track, for a song `s` joined to its file `f`, the dance shown `d`, and that
// pairing's teacher `dsp`. Every query that returns tracks selects these.
export const TRACK_COLUMNS = `f.id AS fileId, s.id AS songId, d.id AS danceId, s.title,
  d.name AS danceName, d.choreographer, d.country, dsp.teacher, f.duration_ms AS durationMs,
  f.is_missing AS isMissing,
  (SELECT COUNT(*) FROM dance_songs c WHERE c.song_id = s.id) AS danceCount,
  ${choreographerCountSql('s.id')} AS choreographerCount`

// Joins the pairing for dance `danceExpr` (falling back to the song's shown dance when it is
// null) and that pairing's teacher, for a query that already has `songs s` and `files f`.
export const trackJoins = (danceExpr: string): string => `
  LEFT JOIN dance_songs p ON p.id = COALESCE(
    (SELECT x.id FROM dance_songs x WHERE x.song_id = s.id AND x.dance_id = ${danceExpr}),
    CASE WHEN ${danceExpr} IS NULL THEN ${shownPairingSql('s.id')} END)
  LEFT JOIN dances d ON d.id = COALESCE(p.dance_id, ${danceExpr})
  LEFT JOIN dance_song_prefs dsp ON dsp.dance_song_id = p.id`

export interface TrackRow {
  fileId: number
  songId: number
  danceId: number | null
  title: string
  danceName: string | null
  choreographer: string | null
  country: string | null
  teacher: string | null
  durationMs: number | null
  isMissing: number
  danceCount: number
  choreographerCount: number
}

export function toTrack(row: TrackRow): Track {
  const parts = labelParts({
    songTitle: row.title,
    danceName: row.danceName,
    choreographer: row.choreographer,
    choreographerCount: row.choreographerCount
  })
  return {
    fileId: row.fileId,
    songId: row.songId,
    danceId: row.danceId,
    title: row.title,
    label: formatLabel(parts),
    parts,
    country: row.country,
    teacher: row.teacher,
    durationMs: row.durationMs,
    isMissing: row.isMissing === 1,
    danceCount: row.danceCount
  }
}

// One file's song with dance `danceId` (or its shown dance when null); null for an unknown file.
export function getTrack(db: DatabaseSync, fileId: number, danceId: number | null): Track | null {
  const row = db
    .prepare(
      `SELECT ${TRACK_COLUMNS} FROM files f JOIN songs s ON s.file_id = f.id
       ${trackJoins('?')} WHERE f.id = ?`
    )
    .get(danceId, danceId, danceId, fileId) as TrackRow | undefined
  return row ? toTrack(row) : null
}

export function trackPath(db: DatabaseSync, fileId: number): string | null {
  const row = db.prepare('SELECT path FROM files WHERE id = ?').get(fileId) as
    { path: string } | undefined
  return row?.path ?? null
}
