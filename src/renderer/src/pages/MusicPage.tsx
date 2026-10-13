import { Stack, Text, Title } from '@mantine/core'

// Spec §6.3. Filled in by plans 2 and 3.
export default function MusicPage(): React.JSX.Element {
  return (
    <Stack p="md">
      <Title order={2}>Music</Title>
      <Text c="dimmed">Your library is empty.</Text>
    </Stack>
  )
}
