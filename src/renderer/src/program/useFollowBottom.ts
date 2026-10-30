import { useLayoutEffect, useRef } from 'react'

// A scrolling list "follows" new entries while the organizer is at its bottom, or within two rows
// of it (0.3.0 spec §3.10); scrolling up to look at an earlier entry is not undone.
const NEAR_BOTTOM_PX = 64

// The returned ref goes on the scrolling element. It scrolls to the end when it mounts, when
// `resetKey` changes (another program), and when `count` grows while the organizer is near the
// bottom. Where the organizer is comes from the last scroll, not from the new entry's height.
export function useFollowBottom(
  count: number,
  resetKey: unknown
): React.MutableRefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null)
  const nearBottom = useRef(true)
  const seen = useRef<{ count: number; resetKey: unknown } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const onScroll = (): void => {
      nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    const el = ref.current
    const before = seen.current
    seen.current = { count, resetKey }
    if (!el) return
    if (!before || before.resetKey !== resetKey) nearBottom.current = true
    if (nearBottom.current) el.scrollTop = el.scrollHeight
  }, [count, resetKey])

  return ref
}
