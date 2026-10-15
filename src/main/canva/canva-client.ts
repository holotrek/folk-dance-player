import { CanvaError } from './decks'
import { isShortLink, pageFromEditLink } from './canva-url'
import { parseDeckPage, type ParsedDeck } from './deck-parser'

// The subset of fetch the client uses (Electron's net.fetch, or a fake in tests).
export type Fetcher = (
  url: string,
  init: { redirect: 'follow' | 'manual'; headers: Record<string, string> }
) => Promise<{
  status: number
  text(): Promise<string>
  headers: { get(name: string): string | null }
}>

// Canva serves the public view page to browsers; ask like one.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'text/html'
}

async function get(fetcher: Fetcher, url: string, redirect: 'follow' | 'manual') {
  try {
    return await fetcher(url, { redirect, headers: HEADERS })
  } catch {
    throw new CanvaError("Couldn't reach Canva. Check the internet connection.")
  }
}

// Fetches and reads a deck's public view page (no Canva login).
export async function fetchDeck(fetcher: Fetcher, viewUrl: string): Promise<ParsedDeck> {
  const response = await get(fetcher, viewUrl, 'follow')
  if (response.status !== 200) {
    throw new CanvaError(
      `Canva didn't return the deck (HTTP ${response.status}). Is its link public?`
    )
  }
  return parseDeckPage(await response.text())
}

// The design and page a page link from Canva's share menu names: a canva.link short link (which
// redirects to the editor link), or the editor link itself.
export async function resolvePageLink(
  fetcher: Fetcher,
  input: string
): Promise<{ designId: string; pageId: string }> {
  let link = input.trim()
  if (isShortLink(link)) {
    const response = await get(fetcher, link, 'manual')
    const location = response.headers.get('location')
    if (!location) throw new CanvaError("That short link didn't lead to a Canva page.")
    link = location
  }
  const page = pageFromEditLink(link)
  if (!page)
    throw new CanvaError("That isn't a link to one slide. Copy it from Canva's Share menu.")
  return page
}
