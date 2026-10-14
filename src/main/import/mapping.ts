import { basename, extname } from 'path'
import type { ImportMapping } from '@shared/import'

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
  const routed: Record<'artist' | 'teacher' | 'choreographer', string | null> = {
    artist: null,
    teacher: null,
    choreographer: null
  }
  // The artist tag is applied first, so it wins when both tags target the same field.
  for (const [value, target] of [
    [clean(tags.artist), mapping.artistTagTarget],
    [clean(tags.albumArtist), mapping.albumArtistTagTarget]
  ] as const) {
    if (value && target !== 'ignore' && routed[target] === null) routed[target] = value
  }
  return {
    song: { title, artist: routed.artist },
    dance: {
      name: title,
      country: mapping.genreIsCountry ? clean(tags.genre) : null,
      choreographer: routed.choreographer
    },
    teacher: routed.teacher
  }
}
