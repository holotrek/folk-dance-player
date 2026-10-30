import NamePrompt from '../components/NamePrompt'
import { useLibraryApi } from '../library/LibraryProvider'
import { defaultProgramName } from './program-name'
import { useProgram } from './ProgramProvider'

// The "New program" dialog (spec §6.1), shared by the sidebar's + and the Program page's Start New
// Program: asks for a name (today's date by default), creates the program and loads it.
export default function NewProgramPrompt(props: {
  opened: boolean
  onClose: () => void
}): React.JSX.Element {
  const api = useLibraryApi()
  const load = useProgram((s) => s.load)
  return (
    <NamePrompt
      opened={props.opened}
      title="New program"
      initialValue={defaultProgramName()}
      submitLabel="Create"
      onSubmit={async (name) => load(await api.invoke('programs:create', name))}
      onClose={props.onClose}
    />
  )
}
