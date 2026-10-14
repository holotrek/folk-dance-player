import type { DatabaseSync } from 'node:sqlite'
import type { PlayedEntry, PlayKind } from '@shared/program'
import { TRACK_COLUMNS, toTrack, trackJoins, type TrackRow } from './tracks'

export interface PlayLogEntry {
  fileId: number
  danceId: number | null
  programId: number | null
  kind: PlayKind
}

// Every play is logged (spec §7.1): program items, previews and replays. Returns the log id.
export function logPlay(db: DatabaseSync, entry: PlayLogEntry): number {
  return Number(
    db
      .prepare('INSERT INTO play_log (file_id, dance_id, program_id, kind) VALUES (?, ?, ?, ?)')
      .run(entry.fileId, entry.danceId, entry.programId, entry.kind).lastInsertRowid
  )
}

type PlayedRow = { logId: number; kind: PlayKind; playedAt: string } & Partial<TrackRow>

// "Previously played" for a program (spec §6.2): its play log, newest first, each with the
// dance it was played as.
export function listPlayed(db: DatabaseSync, programId: number): PlayedEntry[] {
  const rows = db
    .prepare(
      `SELECT l.id AS logId, l.kind, l.played_at AS playedAt, ${TRACK_COLUMNS}
       FROM play_log l
       LEFT JOIN files f ON f.id = l.file_id
       LEFT JOIN songs s ON s.file_id = f.id
       ${trackJoins('l.dance_id')}
       WHERE l.program_id = ?
       ORDER BY l.played_at DESC, l.id DESC`
    )
    .all(programId) as unknown as PlayedRow[]
  return rows.map(({ logId, kind, playedAt, ...track }) => ({
    logId,
    kind,
    playedAt,
    track: track.songId ? toTrack(track as TrackRow) : null
  }))
}

// What a logged play was, for a replay (spec §7.1: it uses the dance it was logged with).
export function getLoggedPlay(
  db: DatabaseSync,
  logId: number
): { fileId: number; danceId: number | null } | null {
  const row = db
    .prepare('SELECT file_id AS fileId, dance_id AS danceId FROM play_log WHERE id = ?')
    .get(logId) as { fileId: number | null; danceId: number | null } | undefined
  return row?.fileId ? { fileId: row.fileId, danceId: row.danceId } : null
}
