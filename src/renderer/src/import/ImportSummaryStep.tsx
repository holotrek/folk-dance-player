import { Accordion, Alert, Button, Group, List, ScrollArea, Stack, Text } from '@mantine/core'
import type { ImportSummary } from '@shared/import'
import { fileName } from './file-name'

type FileCategory = Exclude<keyof ImportSummary, 'playlists' | 'cancelled'>

const CATEGORIES: { key: FileCategory; label: string }[] = [
  { key: 'added', label: 'Added' },
  { key: 'updated', label: 'Updated' },
  { key: 'relinked', label: 'Found after moving' },
  { key: 'restored', label: 'Restored' },
  { key: 'alreadyPresent', label: 'Already in your library' },
  { key: 'appleSynced', label: 'Already in library (Apple Music)' },
  { key: 'notFound', label: 'Not found on disk' },
  { key: 'unsupported', label: 'Unsupported format' },
  { key: 'unreadable', label: "Couldn't be read" }
]

function playlistLine(p: ImportSummary['playlists']): string | null {
  const parts = [
    [p.created.length, 'created'],
    [p.replaced.length, 'replaced'],
    [p.kept.length, 'kept yours'],
    [p.duplicated.length, 'imported as a copy']
  ]
    .filter(([n]) => n)
    .map(([n, label]) => `${label}: ${n}`)
  return parts.length ? `Playlists — ${parts.join(', ')}` : null
}

// Spec §5.4: every category expands to list its files.
export default function ImportSummaryStep(props: {
  summary: ImportSummary
  onDone: () => void
}): React.JSX.Element {
  const { summary } = props
  const categories = CATEGORIES.filter((c) => summary[c.key].length > 0)
  const playlists = playlistLine(summary.playlists)

  return (
    <Stack>
      {summary.cancelled && (
        <Alert color="yellow">
          Import cancelled — the songs imported before you stopped it were kept.
        </Alert>
      )}
      {categories.length === 0 && <Text>No music files were found.</Text>}
      <Accordion multiple variant="separated">
        {categories.map((c) => (
          <Accordion.Item key={c.key} value={c.key}>
            <Accordion.Control>{`${c.label} (${summary[c.key].length})`}</Accordion.Control>
            <Accordion.Panel>
              <ScrollArea.Autosize mah={200}>
                <List size="sm">
                  {summary[c.key].map((item) => (
                    <List.Item key={item.path}>
                      {fileName(item.path)}
                      {item.detail && (
                        <Text span size="xs" c="dimmed">
                          {` — ${item.detail}`}
                        </Text>
                      )}
                    </List.Item>
                  ))}
                </List>
              </ScrollArea.Autosize>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
      {playlists && <Text size="sm">{playlists}</Text>}
      <Group justify="flex-end">
        <Button onClick={props.onDone}>Done</Button>
      </Group>
    </Stack>
  )
}
