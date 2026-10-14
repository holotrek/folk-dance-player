// "3:05" for a duration or position in milliseconds; '' when unknown.
export function formatTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return ''
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
