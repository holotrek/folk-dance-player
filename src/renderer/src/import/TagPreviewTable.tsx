import { ScrollArea, Table } from '@mantine/core'
import type { TagSample } from '@shared/import'

// Songs' raw tags, shown beside the mapping choices so the organizer can see where each tag's
// values should go (spec §5.2, §6.3).
export default function TagPreviewTable({
  rows
}: {
  rows: (TagSample & { key: string | number })[]
}): React.JSX.Element {
  return (
    <ScrollArea.Autosize mah={240}>
      <Table aria-label="File tags" striped withTableBorder stickyHeader fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Song</Table.Th>
            <Table.Th>Artist tag</Table.Th>
            <Table.Th>Album Artist tag</Table.Th>
            <Table.Th>Genre tag</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((t) => (
            <Table.Tr key={t.key}>
              <Table.Td>{t.title ?? '—'}</Table.Td>
              <Table.Td>{t.artist ?? '—'}</Table.Td>
              <Table.Td>{t.albumArtist ?? '—'}</Table.Td>
              <Table.Td>{t.genre ?? '—'}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea.Autosize>
  )
}
