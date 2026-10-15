import LibraryFilterNote from '../library/LibraryFilterNote'
import LibrarySearch from '../library/LibrarySearch'
import LibraryTable from '../library/LibraryTable'
import HoldingPanel from '../program/HoldingPanel'
import PlayedList from '../program/PlayedList'
import ProgramList from '../program/ProgramList'
import classes from './ProgramPage.module.css'

// Spec §6.2: previously played above the program on the left; holding above the library list on
// the right. The player bar is above the tabs (App), on every page.
export default function ProgramPage(): React.JSX.Element {
  return (
    <div className={classes.root}>
      <div className={classes.grid}>
        <PlayedList />
        <HoldingPanel />
        <ProgramList />
        <section className={classes.library} aria-label="Library">
          <LibrarySearch />
          <LibraryFilterNote />
          <LibraryTable compact />
        </section>
      </div>
    </div>
  )
}
