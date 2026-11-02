import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string): string => readFileSync(`site/${file}`, 'utf8')
const html = read('index.html')

// Runs the page's blocking script against a fake page, as a browser with this user agent would.
function systemOf(userAgent: string): string | undefined {
  const root = { dataset: {} as Record<string, string> }
  new Function('document', 'navigator', read('system.js'))({ documentElement: root }, { userAgent })
  return root.dataset['system']
}

describe('the visitor’s system', () => {
  it('is marked on the page for Windows, which gets no download button', () => {
    expect(
      systemOf(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'
      )
    ).toBe('windows')
  })

  it('is not marked for a Mac or a phone', () => {
    expect(
      systemOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15')
    ).toBeUndefined()
    expect(systemOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBeUndefined()
  })

  it('loads before the page is drawn (a blocking script in the head), so the button never flashes', () => {
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toMatch(/<script src="system\.js"><\/script>/)
  })

  it('hides every download call to action on Windows and shows the coming-soon note', () => {
    const css = read('style.css')
    expect(css).toMatch(/\[data-system='windows'\] \.cta\s*\{\s*display: none/)
    expect(css).toMatch(/\[data-system='windows'\] \.windows-note\s*\{\s*display: block/)
    expect(html.match(/data-windows-note/g)).toHaveLength(2)
    expect(read('main.js')).not.toMatch(/navigator|data-windows-note/)
  })
})

describe('what search engines read', () => {
  it('has a title and a description that say what the app is', () => {
    expect(html).toMatch(/<title>[^<]*music player for folk dance organizers/i)
    expect(html).toMatch(/name="description"\s+content="[^"]*music player[^"]*folk dance/i)
  })

  it('names its one address', () => {
    expect(html).toContain('<link rel="canonical" href="https://folkdanceplayer.com/" />')
    expect(html).toContain('property="og:url" content="https://folkdanceplayer.com/"')
    expect(html).toContain('property="og:type" content="website"')
  })

  it('describes the app as structured data that parses', () => {
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(match).not.toBeNull()
    const data = JSON.parse(match![1])
    expect(data).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'Folk Dance Player',
      url: 'https://folkdanceplayer.com/',
      license: 'https://opensource.org/license/mit',
      offers: { price: '0' }
    })
    expect(data.sameAs).toContain('https://github.com/holotrek/folk-dance-player')
  })

  it('has a robots.txt that points to the sitemap, and a sitemap that lists the page', () => {
    expect(read('robots.txt')).toMatch(/Sitemap: https:\/\/folkdanceplayer\.com\/sitemap\.xml/)
    expect(read('sitemap.xml')).toContain('<loc>https://folkdanceplayer.com/</loc>')
  })
})
