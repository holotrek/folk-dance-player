import LibrarySection from './sidebar/LibrarySection'
import PlaylistsSection from './sidebar/PlaylistsSection'
import ProgramsSection from './sidebar/ProgramsSection'
import classes from './Sidebar.module.css'

// Spec §6.1: one component per section.
export default function Sidebar(): React.JSX.Element {
  return (
    <nav className={classes.root} aria-label="Library">
      <LibrarySection />
      <PlaylistsSection />
      <ProgramsSection />
    </nav>
  )
}
