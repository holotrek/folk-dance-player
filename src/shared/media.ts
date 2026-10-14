// Audio reaches the control window's <audio> element through this scheme, by file id, so the
// renderer never names a path (spec §9).
export const MEDIA_SCHEME = 'fdp-media'

export const mediaUrl = (fileId: number): string => `${MEDIA_SCHEME}://file/${fileId}`

export function parseMediaUrl(url: string): number | null {
  const match = /^fdp-media:\/\/file\/(\d+)\/?$/.exec(url)
  return match ? Number(match[1]) : null
}
