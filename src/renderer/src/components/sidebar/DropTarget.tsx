import { useState } from 'react'
import { carriesFiles, getDraggedFiles } from '../../library/drag'
import classes from '../Sidebar.module.css'

// A sidebar entry that songs can be dropped onto.
export default function DropTarget(props: {
  onFiles: (fileIds: number[]) => void
  children: React.ReactNode
}): React.JSX.Element {
  const [over, setOver] = useState(false)
  return (
    <div
      className={over ? classes.dropActive : undefined}
      onDragOver={(e) => {
        if (!carriesFiles(e.dataTransfer)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const fileIds = getDraggedFiles(e.dataTransfer)
        if (fileIds.length === 0) return
        e.preventDefault()
        props.onFiles(fileIds)
      }}
    >
      {props.children}
    </div>
  )
}
