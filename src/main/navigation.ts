// The two WebContents methods guardNavigation needs (Electron's WebContents satisfies this).
export interface NavigableContents {
  on(event: 'will-navigate', listener: (event: { preventDefault(): void }) => void): unknown
  setWindowOpenHandler(handler: () => { action: 'deny' }): void
}

// The app is a single page: it never navigates or opens windows. Without this guard, a file
// dropped outside the drop zone makes Chromium load it, replacing the app with a media viewer.
export function guardNavigation(contents: NavigableContents): void {
  contents.on('will-navigate', (event) => event.preventDefault())
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
}
