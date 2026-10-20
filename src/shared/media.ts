// Audio reaches the control window's <audio> element through this scheme, by file id, and saved
// Canva slides reach the projector by deck and page, so a renderer never names a path (spec §9).
export const MEDIA_SCHEME = 'fdp-media'

export const mediaUrl = (fileId: number): string => `${MEDIA_SCHEME}://file/${fileId}`

export function parseMediaUrl(url: string): number | null {
  const match = /^fdp-media:\/\/file\/(\d+)\/?$/.exec(url)
  return match ? Number(match[1]) : null
}

// A dance's own slide image (0.3.0 spec §3.7), by dance ID; `version` (its stored file name, which
// changes whenever the image is replaced) makes a replaced image load fresh.
export const danceImageUrl = (danceId: number, version: string): string =>
  `${MEDIA_SCHEME}://dance-image/${danceId}?v=${encodeURIComponent(version)}`

export function parseDanceImageUrl(url: string): number | null {
  const match = /^fdp-media:\/\/dance-image\/(\d+)\/?(?:\?.*)?$/.exec(url)
  return match ? Number(match[1]) : null
}

// `version` (when the image was captured) makes a re-captured slide load fresh.
export const slideUrl = (deckId: number, pageId: string, version: string): string =>
  `${MEDIA_SCHEME}://slide/${deckId}/${pageId}?v=${encodeURIComponent(version)}`

export function parseSlideUrl(url: string): { deckId: number; pageId: string } | null {
  const match = /^fdp-media:\/\/slide\/(\d+)\/([A-Za-z0-9_-]+)\/?(?:\?.*)?$/.exec(url)
  return match ? { deckId: Number(match[1]), pageId: match[2] } : null
}
