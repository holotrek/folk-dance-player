import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'
import { formatLabel, labelParts, sameName } from '@shared/labels'
import type {
  DancePatch,
  DanceSearchResult,
  SameNameSuggestion,
  SongDance,
  SongDetail,
  SongPatch
} from '@shared/library'
import { getDanceSlide } from '../canva/decks'
import { foldSearchText } from '../db/fts'
import { inTransaction } from '../db/transaction'
import { shownPairingSql } from './list'

export class LibraryEditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LibraryEditError'
  }
}

// Optional text: trimmed, with blank meaning "none".
const optional = (value: string | null | undefined): string | null => value?.trim() || null

function required(value: string, what: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new LibraryEditError(`${what} can't be empty.`)
  return trimmed
}

function update(
  db: DatabaseSync,
  table: string,
  key: string,
  id: number,
  values: Record<string, unknown>
): void {
  const cols = Object.keys(values)
  if (cols.length === 0) return
  db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE ${key} = ?`).run(
    ...(cols.map((c) => values[c]) as (string | number | null)[]),
    id
  )
}

// ---- Reading ----------------------------------------------------------------------------------

interface DanceRow {
  danceId: number
  pairingId: number
  name: string
  country: string | null
  choreographer: string | null
  danceType: string | null
  difficulty: number | null
  notes: string | null
  teacher: string | null
  songCount: number
  isDefault: number
}

export function getSongDetail(
  db: DatabaseSync,
  songId: number,
  attachments?: { pdfInfo(danceId: number): { name: string; missing: boolean } | null }
): SongDetail | null {
  const song = db
    .prepare(
      `SELECT s.id AS songId, f.id AS fileId, s.title, s.artist, f.path, f.duration_ms AS durationMs,
         f.is_missing AS isMissing, COALESCE(fp.is_favorite, 0) AS isFavorite,
         ${shownPairingSql('s.id')} AS shownPairingId
       FROM songs s JOIN files f ON f.id = s.file_id LEFT JOIN file_prefs fp ON fp.file_id = f.id
       WHERE s.id = ?`
    )
    .get(songId) as
    | (Omit<SongDetail, 'dances' | 'suggestions' | 'isMissing' | 'isFavorite'> & {
        isMissing: number
        isFavorite: number
        shownPairingId: number | null
      })
    | undefined
  if (!song) return null

  const rows = db
    .prepare(
      `SELECT d.id AS danceId, ds.id AS pairingId, d.name, d.country, d.choreographer,
         d.dance_type AS danceType, dp.difficulty, dp.notes, dsp.teacher,
         (SELECT COUNT(*) FROM dance_songs c WHERE c.dance_id = d.id) AS songCount,
         ds.id = ? AS isDefault
       FROM dance_songs ds JOIN dances d ON d.id = ds.dance_id
       LEFT JOIN dance_prefs dp ON dp.dance_id = d.id
       LEFT JOIN dance_song_prefs dsp ON dsp.dance_song_id = ds.id
       WHERE ds.song_id = ?
       ORDER BY isDefault DESC, ds.id`
    )
    .all(song.shownPairingId, songId) as unknown as DanceRow[]

  const choreographerCount = new Set(
    rows.map((r) => r.choreographer?.trim()).filter((c): c is string => !!c)
  ).size
  const dances: SongDance[] = rows.map((r) => ({
    ...r,
    isDefault: r.isDefault === 1,
    sameAsSong: r.isDefault === 1 && r.songCount === 1 && sameName(r.name, song.title),
    notesPdf: attachments?.pdfInfo(r.danceId) ?? null,
    slide: getDanceSlide(db, r.danceId),
    label: formatLabel(
      labelParts({
        songTitle: song.title,
        danceName: r.name,
        choreographer: r.choreographer,
        choreographerCount
      })
    )
  }))

  const { shownPairingId: _, isMissing, isFavorite, ...rest } = song
  return {
    ...rest,
    isMissing: isMissing === 1,
    isFavorite: isFavorite === 1,
    dances,
    suggestions: sameNameSuggestions(db, songId, dances)
  }
}

// Other dances with the same name (ignoring case and surrounding spaces) that aren't linked to
// this song, are used by at least one song, and weren't marked "different" (spec §6.3).
function sameNameSuggestions(
  db: DatabaseSync,
  songId: number,
  dances: SongDance[]
): SameNameSuggestion[] {
  const candidates = db.prepare(
    `SELECT c.id AS danceId, c.name, c.choreographer, c.country FROM dances c
     WHERE lower(trim(c.name)) = lower(trim(?)) AND c.id <> ?
       AND c.id NOT IN (SELECT dance_id FROM dance_songs WHERE song_id = ?)
       AND EXISTS (SELECT 1 FROM dance_songs u JOIN songs us ON us.id = u.song_id
         JOIN files uf ON uf.id = us.file_id WHERE u.dance_id = c.id AND uf.removed_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM distinct_dances x
         WHERE x.dance_a = min(c.id, ?) AND x.dance_b = max(c.id, ?))
     ORDER BY c.id`
  )
  const titles = db.prepare(
    `SELECT s.title FROM dance_songs ds JOIN songs s ON s.id = ds.song_id
     JOIN files f ON f.id = s.file_id
     WHERE ds.dance_id = ? AND f.removed_at IS NULL ORDER BY s.title COLLATE NOCASE`
  )
  return dances.flatMap((d) =>
    (
      candidates.all(
        d.name,
        d.danceId,
        songId,
        d.danceId,
        d.danceId
      ) as unknown as SameNameSuggestion['candidate'][]
    ).map((c) => ({
      forDanceId: d.danceId,
      candidate: { ...c, songTitles: titles.all(c.danceId).map((t) => t.title as string) }
    }))
  )
}

// Folds case, accents and letters like ı/ł/ø so "pasa" matches "Paşa".
const normalize = (text: string): string =>
  (foldSearchText(text) ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

export function searchDances(db: DatabaseSync, text: string, limit = 50): DanceSearchResult[] {
  const words = normalize(text).split(/\s+/).filter(Boolean)
  const rows = db
    .prepare(
      `SELECT d.id AS danceId, d.name, d.choreographer, d.country,
         (SELECT COUNT(*) FROM dance_songs c JOIN songs cs ON cs.id = c.song_id
            JOIN files cf ON cf.id = cs.file_id
          WHERE c.dance_id = d.id AND cf.removed_at IS NULL) AS songCount
       FROM dances d ORDER BY d.name COLLATE NOCASE, d.id`
    )
    .all() as unknown as DanceSearchResult[]
  return rows
    .filter((d) => {
      const haystack = normalize([d.name, d.choreographer, d.country].filter(Boolean).join(' '))
      return words.every((w) => haystack.includes(w))
    })
    .slice(0, limit)
}

// ---- Editing ----------------------------------------------------------------------------------

export function updateSong(db: DatabaseSync, songId: number, patch: SongPatch): void {
  const values: Record<string, unknown> = {}
  if (patch.title !== undefined) values.title = required(patch.title, 'A song title')
  if (patch.artist !== undefined) values.artist = optional(patch.artist)
  inTransaction(db, () => {
    const before = db.prepare('SELECT title FROM songs WHERE id = ?').get(songId) as
      { title: string } | undefined
    // The song's default dance follows its name when it is the same as the old one and no other
    // song uses the dance (0.3.0 spec §3.5).
    const follower =
      before && typeof values.title === 'string' && !patch.keepDanceName
        ? (db
            .prepare(
              `SELECT d.id AS danceId, d.name FROM dance_songs ds JOIN dances d ON d.id = ds.dance_id
               WHERE ds.id = ${shownPairingSql(':songId')}
                 AND (SELECT COUNT(*) FROM dance_songs c WHERE c.dance_id = d.id) = 1`
            )
            .get({ songId }) as { danceId: number; name: string } | undefined)
        : undefined
    update(db, 'songs', 'id', songId, values)
    if (follower && before && sameName(follower.name, before.title)) {
      update(db, 'dances', 'id', follower.danceId, { name: values.title })
    }
  })
}

// The title of the one song that uses a dance; a dance shared by several songs can't be "the same as
// its song".
function titleOfOnlySong(db: DatabaseSync, danceId: number): string {
  const songs = db
    .prepare(
      `SELECT s.title FROM dance_songs ds JOIN songs s ON s.id = ds.song_id WHERE ds.dance_id = ?`
    )
    .all(danceId) as { title: string }[]
  if (songs.length !== 1) {
    throw new LibraryEditError('Only a dance used by one song can be the same as its song.')
  }
  return songs[0].title
}

export function updateDance(db: DatabaseSync, danceId: number, patch: DancePatch): void {
  const facts: Record<string, unknown> = {}
  if (patch.name !== undefined) facts.name = required(patch.name, 'A dance name')
  if (patch.sameAsSong) facts.name = titleOfOnlySong(db, danceId)
  if (patch.country !== undefined) facts.country = optional(patch.country)
  if (patch.choreographer !== undefined) facts.choreographer = optional(patch.choreographer)
  if (patch.danceType !== undefined) facts.dance_type = optional(patch.danceType)
  const prefs: Record<string, unknown> = {}
  if (patch.difficulty !== undefined) {
    if (
      patch.difficulty !== null &&
      !(Number.isInteger(patch.difficulty) && patch.difficulty >= 1 && patch.difficulty <= 5)
    ) {
      throw new LibraryEditError('Difficulty must be from 1 to 5.')
    }
    prefs.difficulty = patch.difficulty
  }
  if (patch.notes !== undefined) prefs.notes = optional(patch.notes)
  inTransaction(db, () => {
    update(db, 'dances', 'id', danceId, facts)
    if (Object.keys(prefs).length) {
      db.prepare('INSERT OR IGNORE INTO dance_prefs (dance_id) VALUES (?)').run(danceId)
      update(db, 'dance_prefs', 'dance_id', danceId, prefs)
    }
  })
}

export function setTeacher(db: DatabaseSync, pairingId: number, teacher: string | null): void {
  inTransaction(db, () => {
    db.prepare('INSERT OR IGNORE INTO dance_song_prefs (dance_song_id) VALUES (?)').run(pairingId)
    update(db, 'dance_song_prefs', 'dance_song_id', pairingId, { teacher: optional(teacher) })
  })
}

const isLinked = (db: DatabaseSync, songId: number, danceId: number): boolean =>
  !!db.prepare('SELECT 1 FROM dance_songs WHERE song_id = ? AND dance_id = ?').get(songId, danceId)

export function setDefaultDance(db: DatabaseSync, songId: number, danceId: number | null): void {
  if (danceId !== null && !isLinked(db, songId, danceId)) {
    throw new LibraryEditError('That dance is not linked to this song.')
  }
  db.prepare(
    `INSERT INTO song_prefs (song_id, default_dance_id) VALUES (?, ?)
     ON CONFLICT (song_id) DO UPDATE SET default_dance_id = excluded.default_dance_id`
  ).run(songId, danceId)
}

// The song's first dance becomes its default.
function linkAndMaybeDefault(db: DatabaseSync, songId: number, danceId: number): void {
  const hadDances = !!db.prepare('SELECT 1 FROM dance_songs WHERE song_id = ?').get(songId)
  db.prepare('INSERT OR IGNORE INTO dance_songs (dance_id, song_id) VALUES (?, ?)').run(
    danceId,
    songId
  )
  if (!hadDances) setDefaultDance(db, songId, danceId)
}

export function linkDance(db: DatabaseSync, songId: number, danceId: number): void {
  inTransaction(db, () => linkAndMaybeDefault(db, songId, danceId))
}

export function createDance(db: DatabaseSync, songId: number, name: string): number {
  const danceName = required(name, 'A dance name')
  return inTransaction(db, () => {
    const danceId = Number(
      db.prepare('INSERT INTO dances (uuid, name) VALUES (?, ?)').run(randomUUID(), danceName)
        .lastInsertRowid
    )
    linkAndMaybeDefault(db, songId, danceId)
    return danceId
  })
}

// Removes the link only; the dance itself is kept (spec §4: a dance with no songs is kept).
export function unlinkDance(db: DatabaseSync, songId: number, danceId: number): void {
  inTransaction(db, () => {
    db.prepare('DELETE FROM dance_songs WHERE song_id = ? AND dance_id = ?').run(songId, danceId)
    const current = db
      .prepare('SELECT default_dance_id AS id FROM song_prefs WHERE song_id = ?')
      .get(songId) as { id: number | null } | undefined
    if (current?.id === danceId) {
      const next = db
        .prepare('SELECT dance_id AS id FROM dance_songs WHERE song_id = ? ORDER BY id LIMIT 1')
        .get(songId) as { id: number } | undefined
      setDefaultDance(db, songId, next?.id ?? null)
    }
  })
}

// Combines `removeId` into `keepId`: its songs (with their teachers), song defaults, program items
// and history move to the kept dance; the kept dance's empty fields are filled from it. Returns the
// stored attachment files the merge left unreferenced (paths relative to the app data folder), for
// the caller to delete once the merge is done.
export function mergeDances(db: DatabaseSync, keepId: number, removeId: number): string[] {
  if (keepId === removeId) throw new LibraryEditError("A dance can't be merged into itself.")
  return inTransaction(db, () => {
    const links = db
      .prepare(
        `SELECT ds.id, ds.song_id AS songId, p.teacher FROM dance_songs ds
         LEFT JOIN dance_song_prefs p ON p.dance_song_id = ds.id WHERE ds.dance_id = ? ORDER BY ds.id`
      )
      .all(removeId) as unknown as { id: number; songId: number; teacher: string | null }[]
    for (const l of links) {
      db.prepare('DELETE FROM dance_songs WHERE id = ?').run(l.id)
      db.prepare('INSERT OR IGNORE INTO dance_songs (dance_id, song_id) VALUES (?, ?)').run(
        keepId,
        l.songId
      )
      if (l.teacher) {
        const kept = db
          .prepare('SELECT id FROM dance_songs WHERE dance_id = ? AND song_id = ?')
          .get(keepId, l.songId) as { id: number }
        const existing = db
          .prepare('SELECT teacher FROM dance_song_prefs WHERE dance_song_id = ?')
          .get(kept.id) as { teacher: string | null } | undefined
        if (!existing?.teacher) setTeacher(db, kept.id, l.teacher)
      }
    }
    for (const table of ['song_prefs', 'program_items', 'play_log']) {
      const col = table === 'song_prefs' ? 'default_dance_id' : 'dance_id'
      db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`).run(keepId, removeId)
    }
    fillEmptyFrom(db, 'dances', 'id', keepId, removeId, ['country', 'choreographer', 'dance_type'])
    db.prepare('INSERT OR IGNORE INTO dance_prefs (dance_id) VALUES (?)').run(keepId)
    // Notes are never dropped: when both dances have them, the removed dance's are appended.
    const notesOf = (id: number): string =>
      (
        (
          db.prepare('SELECT notes FROM dance_prefs WHERE dance_id = ?').get(id) as
            { notes: string | null } | undefined
        )?.notes ?? ''
      ).trim()
    const [keptNotes, removedNotes] = [notesOf(keepId), notesOf(removeId)]
    if (keptNotes && removedNotes && keptNotes !== removedNotes) {
      update(db, 'dance_prefs', 'dance_id', keepId, { notes: `${keptNotes}\n\n${removedNotes}` })
    }
    fillEmptyFrom(db, 'dance_prefs', 'dance_id', keepId, removeId, [
      'difficulty',
      'notes',
      'canva_deck_id',
      'canva_page_id',
      'canva_page_index'
    ])
    // "Different dance" answers about the removed dance now apply to the kept one.
    db.prepare(
      `INSERT OR IGNORE INTO distinct_dances (dance_a, dance_b)
       SELECT min(?, other), max(?, other) FROM (
         SELECT dance_b AS other FROM distinct_dances WHERE dance_a = ?
         UNION SELECT dance_a FROM distinct_dances WHERE dance_b = ?)
       WHERE other <> ?`
    ).run(keepId, keepId, removeId, removeId, keepId)
    const orphans = mergeAttachments(db, keepId, removeId)
    db.prepare('DELETE FROM dances WHERE id = ?').run(removeId)
    return orphans
  })
}

// A dance's PDF stays with the kept dance; a kept dance without one takes the removed dance's
// (its shown name and stored file together). The removed dance's file is reported when not taken.
function mergeAttachments(db: DatabaseSync, keepId: number, removeId: number): string[] {
  const read = db.prepare(
    'SELECT notes_pdf_name AS name, notes_pdf_path AS path FROM dance_prefs WHERE dance_id = ?'
  )
  const kept = read.get(keepId) as { name: string | null; path: string | null } | undefined
  const gone = read.get(removeId) as { name: string | null; path: string | null } | undefined
  if (!gone?.path) return []
  if (kept?.path) return [`dance-notes/${gone.path}`]
  update(db, 'dance_prefs', 'dance_id', keepId, {
    notes_pdf_name: gone.name,
    notes_pdf_path: gone.path
  })
  return []
}

function fillEmptyFrom(
  db: DatabaseSync,
  table: string,
  key: string,
  keepId: number,
  fromId: number,
  cols: string[]
): void {
  const read = db.prepare(`SELECT ${cols.join(', ')} FROM ${table} WHERE ${key} = ?`)
  const keep = read.get(keepId) as Record<string, unknown> | undefined
  const from = read.get(fromId) as Record<string, unknown> | undefined
  if (!keep || !from) return
  const fill = Object.fromEntries(
    cols.filter((c) => (keep[c] ?? '') === '' && (from[c] ?? '') !== '').map((c) => [c, from[c]])
  )
  update(db, table, key, keepId, fill)
}

// "Same dance" on a suggestion (spec §6.3): the song is linked to `otherId` and it becomes the
// default. The song's own dance is merged into it when no other song uses it.
export function sameDance(
  db: DatabaseSync,
  songId: number,
  ownId: number,
  otherId: number
): string[] {
  return inTransaction(db, () => {
    const ownSongs = (
      db.prepare('SELECT COUNT(*) AS n FROM dance_songs WHERE dance_id = ?').get(ownId) as {
        n: number
      }
    ).n
    let orphans: string[] = []
    if (ownSongs <= 1) {
      orphans = mergeDances(db, otherId, ownId)
    } else {
      linkAndMaybeDefault(db, songId, otherId)
    }
    setDefaultDance(db, songId, otherId)
    return orphans
  })
}

// "Different dance": remember the pair so the suggestion isn't shown again.
export function markDifferentDances(db: DatabaseSync, a: number, b: number): void {
  db.prepare('INSERT OR IGNORE INTO distinct_dances (dance_a, dance_b) VALUES (?, ?)').run(
    Math.min(a, b),
    Math.max(a, b)
  )
}
