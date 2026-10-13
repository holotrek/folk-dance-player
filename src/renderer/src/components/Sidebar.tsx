import { NavLink, ScrollArea, Text, TextInput } from '@mantine/core'
import classes from './Sidebar.module.css'

// Layout per spec §6.1. Library/playlist/program data arrives in plans 3 and 4.
export default function Sidebar(): React.JSX.Element {
  return (
    <nav className={classes.root} aria-label="Library">
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>
        Library
      </Text>
      <NavLink label="♪ All Music" active />
      <NavLink label="★ Favorites" />

      <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="md" mb={4}>
        Playlists
      </Text>
      <Text size="sm" c="dimmed">
        No playlists yet
      </Text>

      <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="md" mb={4}>
        Programs
      </Text>
      <TextInput size="xs" placeholder="Search programs…" aria-label="Search programs" mb="xs" />
      <ScrollArea className={classes.programs}>
        <Text size="sm" c="dimmed">
          No programs yet
        </Text>
      </ScrollArea>
    </nav>
  )
}
