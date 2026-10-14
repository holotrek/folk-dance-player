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

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

export function labelParts(input: LabelInput): LabelParts {
  const songTitle = input.songTitle.trim()
  const dance = input.danceName?.trim()
  if (!dance) return { song: null, dance: songTitle, choreographer: null }
  return {
    song: same(songTitle, dance) ? null : songTitle,
    dance,
    choreographer:
      input.choreographerCount > 1 && input.choreographer?.trim()
        ? input.choreographer.trim()
        : null
  }
}

// The one-line form used in the control window: "Song | Dance (Choreographer)".
export function formatLabel(parts: LabelParts): string {
  const main = parts.song ? `${parts.song} | ${parts.dance}` : parts.dance
  return parts.choreographer ? `${main} (${parts.choreographer})` : main
}
