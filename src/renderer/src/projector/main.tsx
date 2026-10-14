import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { EMPTY_SNAPSHOT, type ProjectorProgress } from '@shared/projector'
import ProjectorView from './ProjectorView'

// The projector window (spec §8): renders what main sends, nothing else.
function Projector(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)
  const [progress, setProgress] = useState<ProjectorProgress | null>(null)
  useEffect(() => {
    const api = window.projector
    void api.getSnapshot().then(setSnapshot)
    const stops = [api.onSnapshot(setSnapshot), api.onProgress(setProgress)]
    return () => stops.forEach((stop) => stop())
  }, [])
  return <ProjectorView snapshot={snapshot} progress={progress} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Projector />
  </StrictMode>
)
