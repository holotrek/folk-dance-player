// Moves `moving` (kept in their current relative order) to just before `before`, or to the end.
// Dropping onto one of the moving items leaves the order unchanged.
export function moveBefore(order: number[], moving: number[], before: number | null): number[] {
  if (before !== null && moving.includes(before)) return order
  const set = new Set(moving)
  const moved = order.filter((id) => set.has(id))
  const rest = order.filter((id) => !set.has(id))
  const at = before === null ? rest.length : rest.indexOf(before)
  return [...rest.slice(0, at), ...moved, ...rest.slice(at)]
}
