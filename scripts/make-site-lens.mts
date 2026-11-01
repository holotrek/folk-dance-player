// Draws the magnified insets on the landing page (site/index.html): a screenshot with a ring on the
// part being shown, a dark layer over the rest, a beam from the ring out to a round magnified copy,
// like a telescope. Each inset is one inline SVG, so everything scales together. Run with Node 24:
//   node scripts/make-site-lens.mts
// It rewrites what is between the `<!-- lens:NAME -->` markers in site/index.html. To change an inset
// (a new screenshot, another spot to show), edit its spec in LENSES below and run it again.
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export interface LensSpec {
  name: string // the marker's name in the page
  src: string // the screenshot, relative to site/
  alt: string
  imageWidth: number
  imageHeight: number
  focus: { x: number; y: number } // the spot shown, as fractions of the image
  zoom: number
  // The lens: its center and diameter, as fractions of the image's width (y too, so a lens that
  // hangs below the image is simply a y beyond the image's height).
  lens: { x: number; y: number; size: number }
}

interface Point {
  x: number
  y: number
}

// The drawing is 1000 units wide; the height follows the image.
const WIDTH = 1000
// Room under a lens that hangs below the image, for its border and shadow.
const PAD = 14

export function lensGeometry(spec: LensSpec) {
  const imageHeight = (WIDTH * spec.imageHeight) / spec.imageWidth
  const lens = { cx: spec.lens.x * WIDTH, cy: spec.lens.y * WIDTH, r: (spec.lens.size * WIDTH) / 2 }
  const ring = { cx: spec.focus.x * WIDTH, cy: spec.focus.y * imageHeight, r: lens.r / spec.zoom }

  // The two outer tangents of the circles: a unit vector n with n·(B − A) = r − R gives the points
  // A + r·n and B + R·n, on the same side of both.
  const d = Math.hypot(lens.cx - ring.cx, lens.cy - ring.cy)
  if (d <= lens.r - ring.r) throw new Error(`Lens "${spec.name}" covers its own ring`)
  const u = { x: (lens.cx - ring.cx) / d, y: (lens.cy - ring.cy) / d }
  const alpha = Math.acos((ring.r - lens.r) / d)
  const tangents = [1, -1].map((side) => {
    const n = {
      x: u.x * Math.cos(alpha) - side * u.y * Math.sin(alpha),
      y: u.y * Math.cos(alpha) + side * u.x * Math.sin(alpha)
    }
    return {
      from: { x: ring.cx + ring.r * n.x, y: ring.cy + ring.r * n.y },
      to: { x: lens.cx + lens.r * n.x, y: lens.cy + lens.r * n.y }
    }
  })

  return {
    imageHeight,
    height: Math.max(imageHeight, lens.cy + lens.r + PAD),
    ring,
    lens,
    tangents,
    // The image drawn at `zoom` with the focus on the lens's center.
    magnify: { scale: spec.zoom, focus: { x: ring.cx, y: ring.cy } }
  }
}

const n = (value: number): string => String(Math.round(value * 100) / 100)
const point = (p: Point): string => `${n(p.x)} ${n(p.y)}`
const escapeAttr = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;')

export function lensSvg(spec: LensSpec): string {
  const g = lensGeometry(spec)
  const { ring, lens, tangents } = g
  const [a, b] = tangents
  const id = spec.name
  const image = (extra = ''): string =>
    `<image href="${spec.src}" width="${WIDTH}" height="${n(g.imageHeight)}"${extra} />`
  // The dark layer is the whole image with a round hole where the ring is.
  const dim =
    `M0 0H${WIDTH}V${n(g.imageHeight)}H0Z` +
    `M${n(ring.cx - ring.r)} ${n(ring.cy)}a${n(ring.r)} ${n(ring.r)} 0 1 0 ${n(2 * ring.r)} 0` +
    `a${n(ring.r)} ${n(ring.r)} 0 1 0 ${n(-2 * ring.r)} 0Z`
  return `<svg class="lens-svg" viewBox="0 0 ${WIDTH} ${n(g.height)}" role="img" aria-label="${escapeAttr(spec.alt)}">
  <defs>
    <clipPath id="lens-${id}"><circle cx="${n(lens.cx)}" cy="${n(lens.cy)}" r="${n(lens.r)}" /></clipPath>
    <clipPath id="frame-${id}"><rect width="${WIDTH}" height="${n(g.imageHeight)}" rx="10" /></clipPath>
  </defs>
  <g clip-path="url(#frame-${id})">
    ${image()}
    <path class="lens-dim" fill-rule="evenodd" d="${dim}" />
  </g>
  <rect class="lens-frame" width="${WIDTH}" height="${n(g.imageHeight)}" rx="10" />
  <polygon class="lens-beam" points="${point(a.from)} ${point(a.to)} ${point(b.to)} ${point(b.from)}" />
  <line class="lens-line" x1="${n(a.from.x)}" y1="${n(a.from.y)}" x2="${n(a.to.x)}" y2="${n(a.to.y)}" />
  <line class="lens-line" x1="${n(b.from.x)}" y1="${n(b.from.y)}" x2="${n(b.to.x)}" y2="${n(b.to.y)}" />
  <circle class="lens-ring" cx="${n(ring.cx)}" cy="${n(ring.cy)}" r="${n(ring.r)}" />
  <circle class="lens-shadow" cx="${n(lens.cx)}" cy="${n(lens.cy)}" r="${n(lens.r)}" />
  <g clip-path="url(#lens-${id})">
    <rect class="lens-bg" x="${n(lens.cx - lens.r)}" y="${n(lens.cy - lens.r)}" width="${n(2 * lens.r)}" height="${n(2 * lens.r)}" />
    ${image(` transform="translate(${point({ x: lens.cx, y: lens.cy })}) scale(${n(g.magnify.scale)}) translate(${n(-g.magnify.focus.x)} ${n(-g.magnify.focus.y)})"`)}
  </g>
  <circle class="lens-edge" cx="${n(lens.cx)}" cy="${n(lens.cy)}" r="${n(lens.r)}" />
</svg>`
}

// Puts `svg` between the `<!-- lens:NAME -->` markers, indented as the opening marker is. Prettier
// leaves the drawing as it is (prettier-ignore), so running this again changes nothing.
export function replaceLens(html: string, name: string, svg: string): string {
  const pattern = new RegExp(`([ \\t]*)<!-- lens:${name} -->[\\s\\S]*?<!-- /lens:${name} -->`)
  if (!pattern.test(html)) throw new Error(`site/index.html has no <!-- lens:${name} --> markers`)
  return html.replace(
    pattern,
    (_, indent: string) =>
      `${indent}<!-- lens:${name} -->\n${indent}<!-- prettier-ignore -->\n${indent}${svg}\n` +
      `${indent}<!-- /lens:${name} -->`
  )
}

// 2880×1736 screenshots (a 1440×900 window at 2×). Magnified 2×: a circle half the picture's width.
const SCREEN = { imageWidth: 2880, imageHeight: 1736 }
export const LENSES: LensSpec[] = [
  {
    name: 'program',
    src: 'images/program-full.png',
    alt: 'The Program page in dark mode, with a magnified view of the running order: a song, a STOP / TEACHING marker, then the next dances',
    ...SCREEN,
    focus: { x: 0.235, y: 0.62 }, // the running order, with its header
    zoom: 2,
    lens: { x: 0.73, y: 0.41, size: 0.5 }
  },
  {
    name: 'song',
    src: 'images/music-full.png',
    alt: 'The Music page with a song open in the editor, with a magnified view of its two dances: the default dance folded up, and a second dance, shared with another song, open beneath it',
    imageWidth: 2880,
    imageHeight: 2342, // a taller window, so both dance cards fit
    focus: { x: 0.855, y: 0.627 }, // the song editor's dances: one folded, one open
    zoom: 2,
    lens: { x: 0.27, y: 0.56, size: 0.5 }
  }
]

function main(): void {
  const path = 'site/index.html'
  let html = readFileSync(path, 'utf8')
  for (const spec of LENSES) html = replaceLens(html, spec.name, lensSvg(spec))
  writeFileSync(path, html)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
