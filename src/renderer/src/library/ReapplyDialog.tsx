import { useEffect, useState } from 'react'
import { Button, Group, Modal, ScrollArea, Stack, Table, Text } from '@mantine/core'
import type { ImportMapping } from '@shared/import'
import type { SongTags } from '@shared/library'
import ImportMappingFields from '../import/ImportMappingFields'
import { useLibraryApi } from './LibraryProvider'

// Enough rows to see the pattern in the tags; the rest are counted.
const SHOWN_TAGS = 50

// "Re-apply mapping…" (spec §6.3): choose the mapping for this run, starting from the saved
// import mapping, while seeing the selected songs' tags. The choice isn't saved as the default.
export default function ReapplyDialog(props: {
  opened: boolean
  songIds: number[]
  onConfirm: (mapping: ImportMapping) => void
  onClose: () => void
}): React.JSX.Element {
  const api = useLibraryApi()
  const { opened, songIds } = props
  const [mapping, setMapping] = useState<ImportMapping | null>(null)
  const [tags, setTags] = useState<SongTags[]>([])

  useEffect(() => {
    if (!opened) return
    let current = true
    setMapping(null)
    setTags([])
    void api.invoke('settings:getAll').then((settings) => {
      if (!current) return
      setMapping({
        artistTagTarget: settings['import.artistTagTarget'],
        albumArtistTagTarget: settings['import.albumArtistTagTarget'],
        genreIsCountry: settings['import.genreIsCountry']
      })
    })
    void api.invoke('library:songTags', songIds.slice(0, SHOWN_TAGS)).then((t) => {
      if (current) setTags(t)
    })
    return () => {
      current = false
    }
  }, [api, opened, songIds])

  const n = songIds.length
  const more = n - tags.length
  return (
    <Modal opened={opened} onClose={props.onClose} title="Re-apply mapping?" size="xl">
      <Stack>
        <Text>
          {`The artist, teacher, choreographer and country of ${n} ${n === 1 ? 'song' : 'songs'} are replaced from their files' tags, using the mapping below. A dance used by other songs is left unchanged.`}
        </Text>
        <ScrollArea.Autosize mah={260}>
          <Table aria-label="File tags" striped withTableBorder fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Song</Table.Th>
                <Table.Th>Artist tag</Table.Th>
                <Table.Th>Album Artist tag</Table.Th>
                <Table.Th>Genre tag</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tags.map((t) => (
                <Table.Tr key={t.songId}>
                  <Table.Td>{t.title}</Table.Td>
                  <Table.Td>{t.artist ?? '—'}</Table.Td>
                  <Table.Td>{t.albumArtist ?? '—'}</Table.Td>
                  <Table.Td>{t.genre ?? '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
        {tags.length > 0 && more > 0 && <Text size="sm" c="dimmed">{`…and ${more} more`}</Text>}
        {mapping && <ImportMappingFields value={mapping} onChange={setMapping} />}
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            disabled={!mapping}
            onClick={() => {
              if (!mapping) return
              props.onConfirm(mapping)
              props.onClose()
            }}
          >
            Re-apply
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
