// Runs `fn` once for any number of calls made in the same tick: one action sends many change
// notices, and the window needs one.
export function coalesced(fn: () => void): () => void {
  let pending = false
  return () => {
    if (pending) return
    pending = true
    queueMicrotask(() => {
      pending = false
      fn()
    })
  }
}
