import type { CanvaPage } from '@shared/canva'

// Canva's public view page embeds the design as minified data. Each slide is an object that
// starts {"A?":"i","Z":{…},"a":"<pageId>" and, when the slide is named, continues ,"B":"<title>".
// The format is undocumented, so the caller self-checks the result (spec §8.3).
const SLIDE = /\{"A\?":"i","Z":\{[^{}]*\},"a":"([A-Za-z0-9_-]{8,40})"(?:,"B":"((?:[^"\\]|\\.)*)")?/g

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? whole
    const n =
      code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
    return Number.isFinite(n) ? String.fromCodePoint(n) : whole
  })
}

function decodeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string
  } catch {
    return raw
  }
}

export interface ParsedDeck {
  title: string | null
  pages: CanvaPage[] // in order; empty means the format wasn't recognized
}

// The presentation's title (from og:title, else <title>) and its ordered slides.
export function parseDeckPage(html: string): ParsedDeck {
  const og = /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i.exec(html)
  const titleTag = /<title>([^<]*)<\/title>/i.exec(html)
  const rawTitle = og?.[1] ?? titleTag?.[1] ?? null
  const title = rawTitle === null ? null : decodeEntities(rawTitle).trim() || null
  const pages: CanvaPage[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(SLIDE)) {
    if (seen.has(match[1])) continue
    seen.add(match[1])
    const name = match[2] === undefined ? '' : decodeJsonString(match[2]).trim()
    pages.push({ id: match[1], title: name || null })
  }
  return { title, pages }
}
