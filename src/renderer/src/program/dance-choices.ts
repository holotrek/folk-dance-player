import type { RendererApi } from '@shared/contract'
import type { DanceChoice } from './DanceChoiceDialog'

// Rows just added (to the program or Holding) as their songs' default dance: the ones whose song
// has several dances, with those dances, for the "Which dance?" dialog.
export async function chooseDances(
  api: RendererApi,
  rows: { id: number; songId: number; title: string; danceId: number | null; danceCount: number }[]
): Promise<DanceChoice[]> {
  const found = await Promise.all(
    rows
      .filter((r) => r.danceCount > 1)
      .map(async (item) => ({
        item,
        dances: (await api.invoke('library:song', item.songId))?.dances ?? []
      }))
  )
  return found.filter((c) => c.dances.length > 1)
}
