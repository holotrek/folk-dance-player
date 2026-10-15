// Canva links (spec §8.3). Any share link of a deck is normalized to its plain public view link;
// a page link from Canva's share menu (canva.link → …/edit?ui=…) names one slide's page ID.

export interface DeckLink {
  viewUrl: string // https://www.canva.com/design/<designId>/<token>/view
  designId: string
}

const DESIGN_PATH = /^\/design\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/(view|watch|edit)\/?$/

function parse(input: string): URL | null {
  try {
    const url = new URL(input.trim())
    return url.protocol === 'https:' && /^(www\.)?canva\.com$/.test(url.hostname) ? url : null
  } catch {
    return null
  }
}

// A deck's public view link, without ?embed, other query parameters or a #slide fragment.
// Editor links need a Canva login, so they aren't accepted as decks.
export function normalizeDeckUrl(input: string): DeckLink | null {
  const url = parse(input)
  const match = url && DESIGN_PATH.exec(url.pathname)
  if (!match || match[3] === 'edit') return null
  return {
    viewUrl: `https://www.canva.com/design/${match[1]}/${match[2]}/view`,
    designId: match[1]
  }
}

export const isShortLink = (input: string): boolean => {
  try {
    return new URL(input.trim()).hostname === 'canva.link'
  } catch {
    return false
  }
}

// The design and page a Canva page link points to: …/edit?ui=<base64 of {"D":{"T":{"A":"<pageId>"}}}>
// (where a canva.link short link redirects).
export function pageFromEditLink(input: string): { designId: string; pageId: string } | null {
  const url = parse(input)
  const match = url && DESIGN_PATH.exec(url.pathname)
  const ui = url?.searchParams.get('ui')
  if (!match || !ui) return null
  try {
    const data = JSON.parse(Buffer.from(ui, 'base64').toString('utf8')) as {
      D?: { T?: { A?: unknown } }
    }
    const pageId = data.D?.T?.A
    return typeof pageId === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(pageId)
      ? { designId: match[1], pageId }
      : null
  } catch {
    return null
  }
}

// The view link opened at a slide position (1-based).
export const viewAt = (viewUrl: string, position: number): string => `${viewUrl}#${position}`

// Whether a page that loaded (after any redirects) is the deck's own view page, not a Wi-Fi login
// page or Canva's sign-in page for a deck that is no longer public.
export function isDeckView(viewUrl: string, url: string): boolean {
  try {
    const want = new URL(viewUrl)
    const got = new URL(url)
    return got.protocol === 'https:' && got.host === want.host && got.pathname === want.pathname
  } catch {
    return false
  }
}
