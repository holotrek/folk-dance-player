// The projector view's colors in one place, so a test can hold them to a minimum contrast
// (text 7:1, the red bar 3:1) while the exact grays stay free to tune on a real projector.
// ProjectorView sets each as a `--fdp-<name>` variable on its root; the CSS module reads them.
export const PROJECTOR_COLORS = {
  page: '#000000',
  text: '#f2f2f2',
  playedText: '#d0d0d0',
  subText: '#c0c0c0',
  heading: '#b0b0b0',
  // The line between rows: heavier and brighter than the old 1px 12% white.
  rule: '#6a6a6a',
  // The lighter panel behind Now playing / Up next.
  panel: '#3a3a3a',
  panelText: '#ffffff',
  panelSubText: '#e4e4e4',
  panelHeading: '#d0d0d0',
  paused: '#ffc83d',
  track: '#121212',
  bar: '#e03131'
} as const

function luminance(hex: string): number {
  let h = hex.replace('#', '')
  if (h.length === 3) h = [...h].map((ch) => ch + ch).join('')
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// WCAG contrast ratio, 1 to 21.
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export function projectorCssVars(): Record<string, string> {
  return Object.fromEntries(Object.entries(PROJECTOR_COLORS).map(([k, v]) => [`--fdp-${k}`, v]))
}
