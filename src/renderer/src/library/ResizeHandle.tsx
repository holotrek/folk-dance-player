import { useRef } from 'react'
import { percentFromPixels } from './column-widths'
import classes from './LibraryTable.module.css'

// The edge on the right of a movable column's header: drag to resize it (1.0.0 spec §3.9). The live
// width goes to `onChange` while dragging and the final one to `onCommit` once, at release.
export default function ResizeHandle({
  columnKey,
  label,
  onChange,
  onCommit,
  onCancel
}: {
  columnKey: string
  label: string
  onChange(percent: number): void
  onCommit(percent: number): void
  onCancel(): void
}): React.JSX.Element {
  const start = useRef<{ x: number; width: number; table: number } | null>(null)

  const percentAt = (clientX: number): number => {
    const s = start.current!
    return percentFromPixels(s.width + clientX - s.x, s.table, columnKey)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label}`}
      className={classes.handle}
      draggable={false}
      // A press must not begin the header's own drag-to-reorder, nor a sort click.
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const cell = e.currentTarget.parentElement!
        const table = cell.closest('[role=table]')!
        start.current = {
          x: e.clientX,
          width: cell.getBoundingClientRect().width,
          table: table.getBoundingClientRect().width
        }
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (start.current) onChange(percentAt(e.clientX))
      }}
      onPointerUp={(e) => {
        if (!start.current) return
        const percent = percentAt(e.clientX)
        start.current = null
        onCommit(percent)
      }}
      onPointerCancel={() => {
        start.current = null
        onCancel()
      }}
    />
  )
}
