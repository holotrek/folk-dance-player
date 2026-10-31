import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { syncPlaylists } from '../apple-sync/sync-playlists'
import type { Snapshot } from '../apple-sync/snapshot'
import { openDatabase } from '../db/connection'
import { migrate } from '../db/migrate'
import { MIGRATIONS } from '../db/migrations'
import type { ImportMapping } from '../import/mapping'
import { saveImportedFile } from '../import/save-file'
import { createDance, mergeDances, updateDance } from '../library/edit'
import { addToPlaylist, createPlaylist, setFavorite } from '../library/playlists'
import { addTracks, createProgram } from '../programs/programs'

// The guided tour's practice library (tour spec §5): realistic songs and dances, built with the
// app's own import and edit functions so it can't drift from the schema. Every song's file is a
// copy of the one practice tune, so Play really plays and a song can reach its end.

const SAMPLE_RATE = 16_000
const WAV_HEADER = 44

// The practice tune's length, read from its WAV file (mono, 16-bit).
export function tuneDurationMs(tunePath: string): number {
  return Math.round(((statSync(tunePath).size - WAV_HEADER) / 2 / SAMPLE_RATE) * 1000)
}

interface DemoSong {
  title: string
  country: string
  teacher: string // the Album Artist tag, which the mapping sends to the teacher
  dance: string // the dance made for the song on import (the same name merges into one dance)
}

// The mapping a tour library is built with: the Album Artist tag is the teacher, the Genre tag the
// country.
const MAPPING: ImportMapping = {
  artistFrom: 'artistTag',
  teacherFrom: 'albumArtistTag',
  choreographerFrom: 'ignore',
  genreIsCountry: true
}

const SONGS: DemoSong[] = [
  { title: 'Hava Nagila', country: 'Israel', teacher: 'Ruth Adler', dance: 'Hava Nagila' },
  { title: 'Misirlou', country: 'Greece', teacher: 'Nikos Pappas', dance: 'Misirlou' },
  { title: 'Makedonsko Devojče', country: 'Macedonia', teacher: 'Anna Kovacs', dance: 'Lesnoto' },
  { title: 'Pusti Me Mamo', country: 'Macedonia', teacher: 'Peter Lund', dance: 'Lesnoto' },
  {
    title: 'Pravo Rhodopsko Oro',
    country: 'Bulgaria',
    teacher: 'Elena Petrova',
    dance: 'Pravo Rhodopsko'
  },
  { title: 'Ali Pasa', country: 'Turkey', teacher: 'Mehmet Yilmaz', dance: 'Ali Pasa' },
  { title: 'Zemer Atik', country: 'Israel', teacher: 'Ruth Adler', dance: 'Zemer Atik' },
  { title: 'Hora Mare', country: 'Romania', teacher: 'Ion Popescu', dance: 'Hora Mare' }
]

export interface DemoLibrary {
  db: DatabaseSync
  dbPath: string
  tuneMs: number
}

// Builds `dir/library.sqlite` (migrated) and `dir/music/` with a copy of the tune per song.
export function buildDemoLibrary(dir: string, tunePath: string): DemoLibrary {
  const music = join(dir, 'music')
  mkdirSync(music, { recursive: true })
  const dbPath = join(dir, 'library.sqlite')
  const db = openDatabase(dbPath)
  migrate(db, MIGRATIONS)
  const tuneMs = tuneDurationMs(tunePath)

  const saved = SONGS.map((song, i) => {
    const path = join(music, `${String(i + 1).padStart(2, '0')} ${song.title}.wav`)
    copyFileSync(tunePath, path)
    const { fileId } = saveImportedFile(
      db,
      {
        path,
        fileSize: statSync(path).size,
        mtimeMs: Date.now(),
        durationMs: tuneMs,
        contentHash: `practice-${i + 1}`, // distinct, so no copy is taken for a moved file
        tags: {
          title: song.title,
          artist: 'The Practice Band',
          albumArtist: song.teacher,
          genre: song.country
        }
      },
      { source: 'files', applePersistentId: null, mapping: MAPPING }
    )
    const row = db
      .prepare(
        `SELECT s.id AS songId, sp.default_dance_id AS danceId FROM songs s
         LEFT JOIN song_prefs sp ON sp.song_id = s.id WHERE s.file_id = ?`
      )
      .get(fileId) as { songId: number; danceId: number }
    return { ...song, fileId, ...row }
  })
  const bySong = (title: string) => saved.find((s) => s.title === title)!

  // Import names each song's dance after the song; these are the real dances.
  for (const song of saved) {
    if (song.dance !== song.title) updateDance(db, song.danceId, { name: song.dance })
  }

  // One dance used by two tunes: Lesnoto, each tune keeping its own teacher.
  const lesnoto = bySong('Makedonsko Devojče')
  mergeDances(db, lesnoto.danceId, bySong('Pusti Me Mamo').danceId)

  // One tune with two dances: Misirlou, as a line dance and as a mixer.
  const misirlou = bySong('Misirlou')
  const mixer = createDance(db, misirlou.songId, 'Misirlou Mixer')
  updateDance(db, mixer, { country: 'Greece', danceType: 'Mixer' })
  updateDance(db, misirlou.danceId, { danceType: 'Line' })

  setFavorite(db, [bySong('Hava Nagila').fileId], true)

  const easy = createPlaylist(db, 'Easy circle dances')
  addToPlaylist(
    db,
    easy,
    ['Hava Nagila', 'Hora Mare', 'Zemer Atik'].map((t) => bySong(t).fileId)
  )

  // A playlist as Apple Music sync makes it: a read-only mirror inside a folder.
  const pid = (i: number): string => `A${String(i).padStart(15, '0')}` // 16 hex characters
  const pids = new Map(saved.map((s, i) => [pid(i), s.fileId]))
  const ids = [...pids.keys()]
  const snapshot: Snapshot = {
    version: 1,
    libraryId: 'B000000000000000',
    tracks: [],
    folders: [{ persistentId: 'C000000000000001', name: 'Festival 2026', parentId: null }],
    playlists: [
      {
        persistentId: 'D000000000000001',
        name: 'Balkan night',
        parentId: 'C000000000000001',
        itemIds: [ids[2], ids[3], ids[4], ids[7]]
      }
    ]
  }
  syncPlaylists(db, snapshot, pids, {}, new Date().toISOString())

  const program = createProgram(db, 'Friday warm-up')
  addTracks(
    db,
    program,
    ['Hava Nagila', 'Hora Mare', 'Pravo Rhodopsko Oro'].map((t) => bySong(t).fileId)
  )

  return { db, dbPath, tuneMs }
}
