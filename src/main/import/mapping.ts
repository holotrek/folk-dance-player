import { basename, extname } from 'path'
import type { ImportMapping } from '@shared/import'
import type { TagSource } from '@shared/settings'

export type { ImportMapping }

export interface RawTags {
  title: string | null
  artist: string | null
  albumArtist: string | null
  genre: string | null
}

// Where an import puts a file's tags (spec §4, §5.2): the song, the automatic same-named dance
// created for it, and the pairing between them.
export interface MappedTags {
  song: { title: string; artist: string | null }
  dance: { name: string; country: string | null; choreographer: string | null }
  teacher: string | null
}

const clean = (value: string | null): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

// Spec §5.2: applied once when a song and its dance are created (and by "Re-apply mapping").
export function mapTags(tags: RawTags, path: string, mapping: ImportMapping): MappedTags {
  const title = clean(tags.title) ?? basename(path, extname(path))
  const from = (source: TagSource): string | null =>
    source === 'artistTag'
      ? clean(tags.artist)
      : source === 'albumArtistTag'
        ? clean(tags.albumArtist)
        : null
  return {
    song: { title, artist: from(mapping.artistFrom) },
    dance: {
      name: title,
      country: mapping.genreIsCountry ? clean(tags.genre) : null,
      choreographer: from(mapping.choreographerFrom)
    },
    teacher: from(mapping.teacherFrom)
  }
}
