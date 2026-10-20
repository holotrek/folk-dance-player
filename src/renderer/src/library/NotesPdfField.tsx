import { useState } from 'react'
import { Button, Group, Stack, Text } from '@mantine/core'
import type { SongDance } from '@shared/library'
import { errorMessage } from '../ipc-error'
import { useLibraryApi } from './LibraryProvider'

// 0.3.0 spec §3.6: a dance's PDF (its written notes). Main copies the chosen file into the app's
// data folder and opens it in the system's PDF viewer; this only names the dance.
export default function NotesPdfField(props: {
  danceId: number
  pdf: SongDance['notesPdf']
}): React.JSX.Element {
  const api = useLibraryApi()
  const [error, setError] = useState<string | null>(null)
  const { danceId, pdf } = props
  // Runs a channel; the library change that follows reloads the editor.
  const run = (
    channel: 'library:attachNotesPdf' | 'library:openNotesPdf' | 'library:removeNotesPdf'
  ) =>
    void api
      .invoke(channel, danceId)
      .then(() => setError(null))
      .catch((err) => setError(errorMessage(err)))

  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="nowrap">
        <Text size="sm">PDF</Text>
        {pdf && !pdf.missing && (
          <>
            <Text size="sm" truncate title={pdf.name}>
              {pdf.name}
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              aria-label="Open PDF"
              onClick={() => run('library:openNotesPdf')}
            >
              Open
            </Button>
          </>
        )}
        {pdf?.missing && (
          <Text size="sm" c="red">
            The PDF is missing ({pdf.name}).
          </Text>
        )}
        {(!pdf || pdf.missing) && (
          <Button size="compact-xs" variant="light" onClick={() => run('library:attachNotesPdf')}>
            Attach PDF…
          </Button>
        )}
        {pdf && (
          <Button
            size="compact-xs"
            variant="subtle"
            aria-label="Remove PDF"
            onClick={() => run('library:removeNotesPdf')}
          >
            Remove
          </Button>
        )}
      </Group>
      {error && (
        <Text size="sm" c="red" role="alert">
          {error}
        </Text>
      )}
    </Stack>
  )
}
