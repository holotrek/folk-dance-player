import { useEffect, useState } from 'react'
import { Button, Modal, ScrollArea, Stack, Text, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import type { DanceSearchResult } from '@shared/library'
import { useLibraryApi } from './LibraryProvider'

const describe = (d: DanceSearchResult): string =>
  [
    d.choreographer && `by ${d.choreographer}`,
    d.country,
    `${d.songCount} ${d.songCount === 1 ? 'song' : 'songs'}`
  ]
    .filter(Boolean)
    .join(' · ')

// Finds an existing dance (by name, choreographer or country) for "Link a dance" and "Merge into".
export default function DancePicker(props: {
  opened: boolean
  title: string
  actionLabel: string // e.g. "Link" or "Merge into"
  exclude: number[]
  onPick: (dance: DanceSearchResult) => void
  onClose: () => void
}): React.JSX.Element {
  const api = useLibraryApi()
  const [text, setText] = useState('')
  const [debounced] = useDebouncedValue(text, 150)
  const [results, setResults] = useState<DanceSearchResult[]>([])

  useEffect(() => {
    if (!props.opened) return
    let current = true
    api.invoke('library:searchDances', debounced).then((r) => current && setResults(r))
    return () => {
      current = false
    }
  }, [api, debounced, props.opened])
  useEffect(() => {
    if (props.opened) setText('')
  }, [props.opened])

  const shown = results.filter((d) => !props.exclude.includes(d.danceId))
  return (
    <Modal opened={props.opened} onClose={props.onClose} title={props.title}>
      <Stack>
        <TextInput
          label="Search dances"
          placeholder="Name, choreographer or country"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          data-autofocus
        />
        <ScrollArea.Autosize mah={320}>
          <Stack gap={4}>
            {shown.length === 0 && <Text c="dimmed">No dances found.</Text>}
            {shown.map((d) => (
              <Button
                key={d.danceId}
                variant="subtle"
                justify="space-between"
                aria-label={`${props.actionLabel} ${d.name} (${describe(d)})`}
                onClick={() => props.onPick(d)}
                rightSection={
                  <Text span size="xs" c="dimmed">
                    {describe(d)}
                  </Text>
                }
              >
                {d.name}
              </Button>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  )
}
