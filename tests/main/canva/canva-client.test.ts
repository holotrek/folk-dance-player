import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { fetchDeck, resolvePageLink, type Fetcher } from '../../../src/main/canva/canva-client'

const fixture = readFileSync(join(__dirname, '../../fixtures/canva-view.html'), 'utf8')
const VIEW = 'https://www.canva.com/design/DAHXoz6s10M/T9RGM0V3Sdllshv8NtdBrw/view'
const ui = Buffer.from(JSON.stringify({ D: { T: { A: 'PBrWDbC9tVSzgzvW' } } })).toString('base64')
const EDIT = `https://www.canva.com/design/DAHXoz6s10M/TLVQZ1x1so6_UjT7FH64DQ/edit?ui=${ui}`

function fake(
  routes: Record<string, { status: number; body?: string; location?: string; url?: string }>
) {
  const calls: { url: string; redirect: string; agent?: string }[] = []
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, redirect: init.redirect, agent: init.headers['User-Agent'] })
    const r = routes[url]
    if (!r) throw new Error('offline')
    return {
      status: r.status,
      url: r.url ?? url,
      text: async () => r.body ?? '',
      headers: { get: (name: string) => (name === 'location' ? (r.location ?? null) : null) }
    }
  }
  return { fetcher, calls }
}

describe('fetching from Canva', () => {
  test('reads a deck from its view page, asking like a browser', async () => {
    const { fetcher, calls } = fake({ [VIEW]: { status: 200, body: fixture } })
    const deck = await fetchDeck(fetcher, VIEW)
    expect(deck.title).toBe("Dance n' Jam Tunes")
    expect(deck.pages).toHaveLength(4)
    expect(calls[0].agent).toMatch(/Mozilla/)
  })

  test('a page redirected off the deck (a Wi-Fi login page, a deck made private) is unreachable, not a format change', async () => {
    const { fetcher } = fake({
      [VIEW]: { status: 200, body: '<html>Sign in</html>', url: 'http://captive.portal/login' }
    })
    await expect(fetchDeck(fetcher, VIEW)).rejects.toThrow("Couldn't reach Canva")
  })

  test('says why a deck could not be read', async () => {
    await expect(fetchDeck(fake({ [VIEW]: { status: 404 } }).fetcher, VIEW)).rejects.toThrow(
      'HTTP 404'
    )
    await expect(fetchDeck(fake({}).fetcher, VIEW)).rejects.toThrow("Couldn't reach Canva")
  })

  test('a short page link is followed to the slide it names', async () => {
    const { fetcher, calls } = fake({
      'https://canva.link/0qj719kdbysu7vx': { status: 301, location: EDIT }
    })
    expect(await resolvePageLink(fetcher, ' https://canva.link/0qj719kdbysu7vx ')).toEqual({
      designId: 'DAHXoz6s10M',
      pageId: 'PBrWDbC9tVSzgzvW'
    })
    expect(calls[0].redirect).toBe('manual')
  })

  test('an editor page link is read directly; other links are refused', async () => {
    const { fetcher, calls } = fake({})
    expect(await resolvePageLink(fetcher, EDIT)).toMatchObject({ pageId: 'PBrWDbC9tVSzgzvW' })
    expect(calls).toEqual([])
    await expect(resolvePageLink(fetcher, VIEW)).rejects.toThrow("isn't a link to one slide")
  })
})
