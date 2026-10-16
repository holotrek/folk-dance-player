import { Accordion, List, ScrollArea, Stack, Text } from '@mantine/core'
import type { SyncSummary } from '@shared/apple-sync'
import { fileName } from '../import/file-name'

type FileCategory = Exclude<
  keyof SyncSummary,
  'finishedAt' | 'skipped' | 'playlists' | 'missingChanged'
>

const CATEGORIES: { key: FileCategory; label: string }[] = [
  { key: 'added', label: 'Added' },
  { key: 'updated', label: 'Updated' },
  { key: 'relinked', label: 'Found after moving' },
  { key: 'adopted', label: 'Already in your library, now synced' },
  { key: 'restored', label: 'Restored' },
  { key: 'gone', label: 'Removed from Apple Music (to review)' },
  { key: 'missing', label: 'Not found on disk' },
  { key: 'unsupported', label: 'Unsupported format' },
  { key: 'unreadable', label: "Couldn't be read" }
]

// A sync's summary (sync spec §7.1), in the import summary's layout: each category lists its songs.
export default function SyncSummaryView({ summary }: { summary: SyncSummary }): React.JSX.Element {
  const categories = CATEGORIES.filter((c) => summary[c.key].length > 0)
  const p = summary.playlists
  const playlists = (
    [
      [p.created.length, 'created'],
      [p.updated.length, 'updated'],
      [p.deleted.length, 'deleted']
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${label}: ${n}`)
  return (
    <Stack>
      {categories.length === 0 && <Text>No songs changed.</Text>}
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
                      {item.detail && <Text span size="xs" c="dimmed">{` — ${item.detail}`}</Text>}
                    </List.Item>
                  ))}
                </List>
              </ScrollArea.Autosize>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
      {summary.skipped.map((s) => (
        <Text key={s.reason} size="sm" c="dimmed">{`Skipped — ${s.reason}: ${s.count}`}</Text>
      ))}
      {playlists.length > 0 && <Text size="sm">{`Playlists — ${playlists.join(', ')}`}</Text>}
    </Stack>
  )
}
