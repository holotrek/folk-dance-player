import { useEffect, useState } from 'react'

// The current time (ms since the epoch), refreshed every `intervalMs` (a minute by default): enough
// for a clock shown to the minute.
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
