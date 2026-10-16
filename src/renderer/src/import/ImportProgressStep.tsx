import { Button, Group, Loader, Progress, Stack, Text } from '@mantine/core'
import type { ImportProgress } from '@shared/import'
import { fileName } from './file-name'

export default function ImportProgressStep(props: {
  progress: ImportProgress | null
  cancelling: boolean
  onCancel?: () => void // no Cancel button without it (the first Apple Music sync)
}): React.JSX.Element {
  const { progress } = props
  const reading = progress?.phase === 'reading' && progress.total > 0

  return (
    <Stack>
      {reading ? (
        <>
          <Progress value={(progress.done / progress.total) * 100} animated />
          <Group justify="space-between">
            <Text size="sm">{`${progress.done} of ${progress.total}`}</Text>
            {progress.currentPath && (
              <Text size="sm" c="dimmed" truncate maw={320}>
                {fileName(progress.currentPath)}
              </Text>
            )}
          </Group>
        </>
      ) : (
        <Group>
          <Loader size="sm" />
          <Text>Looking for music…</Text>
        </Group>
      )}
      {props.onCancel && (
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={props.onCancel}
            loading={props.cancelling}
            aria-label="Cancel import"
          >
            Cancel
          </Button>
        </Group>
      )}
    </Stack>
  )
}
