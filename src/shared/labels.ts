// Spec §4 "Labels": how a song and the dance shown for it are named everywhere.

export interface LabelInput {
  songTitle: string
  danceName: string | null
  choreographer: string | null
  // How many different choreographers the song's linked dances have.
  choreographerCount: number
}

export interface LabelParts {
  song: string | null // omitted when it's the same as the dance name
  dance: string
  choreographer: string | null // only when needed to tell the song's dances apart
}

// Two names are the same when they differ only in case or surrounding spaces.
export const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

export function labelParts(input: LabelInput): LabelParts {
  const songTitle = input.songTitle.trim()
  const dance = input.danceName?.trim()
  if (!dance) return { song: null, dance: songTitle, choreographer: null }
  return {
    song: sameName(songTitle, dance) ? null : songTitle,
    dance,
    choreographer:
      input.choreographerCount > 1 && input.choreographer?.trim()
        ? input.choreographer.trim()
        : null
  }
}

// The one-line form used in lists: "Dance (Choreographer) ♪ Song".
export function formatLabel(parts: LabelParts): string {
  const dance = parts.choreographer ? `${parts.dance} (${parts.choreographer})` : parts.dance
  return parts.song ? `${dance} ♪ ${parts.song}` : dance
}
