import { Text } from '@mantine/core'

export default function SectionHeading({ children }: { children: string }): React.JSX.Element {
  return (
    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
      {children}
    </Text>
  )
}
