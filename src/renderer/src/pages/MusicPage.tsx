import { useCallback, useEffect, useState } from 'react'
import { Button, Group, Stack, Text, Title } from '@mantine/core'
import type { RendererApi } from '@shared/contract'
import DropZone from '../import/DropZone'
import ImportDialog from '../import/ImportDialog'
import { useImportFlow } from '../import/useImportFlow'

const songCount = (n: number): string =>
  n === 0 ? 'Your library is empty.' : `${n} ${n === 1 ? 'song' : 'songs'} in your library`

// Spec §6.3. The editable song table arrives in plan 3.
export default function MusicPage({ api }: { api: RendererApi }): React.JSX.Element {
  const [fileCount, setFileCount] = useState<number | null>(null)
  const refresh = useCallback(() => {
    api.invoke('library:stats').then((s) => setFileCount(s.fileCount))
  }, [api])
  useEffect(refresh, [refresh])
  const flow = useImportFlow(api, refresh)

  return (
    <Stack p="md">
      <Title order={2}>Music</Title>
      {fileCount !== null && <Text c="dimmed">{songCount(fileCount)}</Text>}
      <Group>
        <Button onClick={flow.addMusic}>Add Music…</Button>
        <Button variant="default" onClick={flow.importFromApple}>
          Import from Apple Music…
        </Button>
      </Group>
      <DropZone onFiles={flow.dropFiles} />
      <ImportDialog flow={flow} />
    </Stack>
  )
}
