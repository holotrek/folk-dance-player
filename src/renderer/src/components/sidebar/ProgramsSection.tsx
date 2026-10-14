import { ScrollArea, Text, TextInput } from '@mantine/core'
import classes from '../Sidebar.module.css'
import SectionHeading from './SectionHeading'

// Spec §6.1 PROGRAMS. Filled in by the next task.
export default function ProgramsSection(): React.JSX.Element {
  return (
    <>
      <SectionHeading>Programs</SectionHeading>
      <TextInput size="xs" placeholder="Search programs…" aria-label="Search programs" my="xs" />
      <ScrollArea className={classes.programs}>
        <Text size="sm" c="dimmed">
          No programs yet
        </Text>
      </ScrollArea>
    </>
  )
}
