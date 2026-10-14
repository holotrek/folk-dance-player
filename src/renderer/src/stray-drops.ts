// Stops the browser's default handling of files dragged over or dropped anywhere in the window
// (it would open them in place of the app). The drop zone still receives its own drop events.
// Returns a function that removes the listeners.
export function preventStrayDrops(target: Window = window): () => void {
  const prevent = (event: Event): void => event.preventDefault()
  target.addEventListener('dragover', prevent)
  target.addEventListener('drop', prevent)
  return () => {
    target.removeEventListener('dragover', prevent)
    target.removeEventListener('drop', prevent)
  }
}
