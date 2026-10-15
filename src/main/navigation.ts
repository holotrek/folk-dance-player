// The two WebContents methods the guards need (Electron's WebContents satisfies this).
export interface NavigableContents {
  on(
    event: 'will-navigate',
    listener: (event: { preventDefault(): void; url: string }) => void
  ): unknown
  setWindowOpenHandler(handler: () => { action: 'deny' }): void
}

// The app is a single page: it never navigates or opens windows. Without this guard, a file
// dropped outside the drop zone makes Chromium load it, replacing the app with a media viewer.
export function guardNavigation(contents: NavigableContents): void {
  contents.on('will-navigate', (event) => event.preventDefault())
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

export function isCanvaUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && (hostname === 'canva.com' || hostname.endsWith('.canva.com'))
  } catch {
    return false
  }
}

// The Canva views (live and capture) show web content: they may move around canva.com, and
// nothing else.
export function guardCanva(contents: NavigableContents): void {
  contents.on('will-navigate', (event) => {
    if (!isCanvaUrl(event.url)) event.preventDefault()
  })
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
}
