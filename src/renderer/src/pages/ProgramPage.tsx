import { Paper, Text } from '@mantine/core'
import classes from './ProgramPage.module.css'

// Layout per spec §6.2. Filled in by plan 4.
export default function ProgramPage(): React.JSX.Element {
  const panel = (label: string): React.JSX.Element => (
    <Paper withBorder p="sm">
      <Text fw={600}>{label}</Text>
    </Paper>
  )
  return (
    <div className={classes.root}>
      <Paper withBorder p="sm">
        <Text fw={600}>Player</Text>
      </Paper>
      <div className={classes.grid}>
        {panel('Previously played')}
        {panel('Holding')}
        {panel('Program')}
        {panel('Library')}
      </div>
    </div>
  )
}
