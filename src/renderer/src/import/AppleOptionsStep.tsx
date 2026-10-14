import { useState } from 'react'
import { Button, Checkbox, Group, Radio, ScrollArea, Stack, Text } from '@mantine/core'
import type { AppleSelection, ApplePreview, ImportMapping } from '@shared/import'
import ImportMappingFields from './ImportMappingFields'

const songs = (n: number): string => `${n} ${n === 1 ? 'song' : 'songs'}`

export default function AppleOptionsStep(props: {
  preview: ApplePreview
  mapping: ImportMapping
  onMappingChange: (mapping: ImportMapping) => void
  onContinue: (selection: AppleSelection) => void
  onCancel: () => void
}): React.JSX.Element {
  const [mode, setMode] = useState<'all' | 'playlists'>('all')
  const [chosen, setChosen] = useState<string[]>([])
  const { preview } = props

  return (
    <Stack>
      <Text>{songs(preview.trackCount)} with files on this Mac</Text>
      <Radio.Group label="What to import" value={mode} onChange={(v) => setMode(v as typeof mode)}>
        <Stack gap="xs" mt={4}>
          <Radio
            value="all"
            label="Whole library (all songs and playlists)"
            aria-label="Whole library"
          />
          <Radio value="playlists" label="Choose playlists" />
        </Stack>
      </Radio.Group>
      {mode === 'playlists' && (
        <ScrollArea.Autosize mah={240}>
          <Checkbox.Group value={chosen} onChange={setChosen}>
            <Stack gap={6}>
              {preview.playlists.map((p) => (
                <Checkbox
                  key={p.persistentId}
                  value={p.persistentId}
                  label={`${p.name} (${songs(p.trackCount)})`}
                />
              ))}
            </Stack>
          </Checkbox.Group>
        </ScrollArea.Autosize>
      )}
      <ImportMappingFields value={props.mapping} onChange={props.onMappingChange} />
      <Group justify="flex-end">
        <Button variant="default" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          disabled={mode === 'playlists' && chosen.length === 0}
          onClick={() =>
            props.onContinue(mode === 'all' ? { mode } : { mode, persistentIds: chosen })
          }
        >
          Continue
        </Button>
      </Group>
    </Stack>
  )
}
