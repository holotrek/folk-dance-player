import { useState } from 'react'
import { Paper, Text } from '@mantine/core'
import classes from './DropZone.module.css'

// Drop target for music files and folders (spec §5.1).
export default function DropZone({
  onFiles
}: {
  onFiles: (files: File[]) => void
}): React.JSX.Element {
  const [active, setActive] = useState(false)
  return (
    <Paper
      withBorder
      p="xl"
      className={`${classes.zone} ${active ? classes.active : ''}`}
      onDragOver={(e: React.DragEvent) => {
        e.preventDefault()
        setActive(true)
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e: React.DragEvent) => {
        e.preventDefault()
        setActive(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) onFiles(files)
      }}
    >
      <Text c="dimmed">Drop music files or folders here</Text>
    </Paper>
  )
}
