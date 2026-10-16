import { useState } from 'react'
import { Button, Group, Radio, Stack, Text } from '@mantine/core'
import type { MirrorDecision } from '@shared/apple-sync'
import type { ApplePlaylistConflict } from '@shared/import'

// Sync spec §5.8 step 4: playlists edited here since a Library.xml import. Music's version always
// appears as a read-only playlist; the choice is what happens to the edits.
export default function MirrorDecisionsStep(props: {
  conflicts: ApplePlaylistConflict[]
  onStart: (decisions: Record<string, MirrorDecision>) => void
  onCancel: () => void
}): React.JSX.Element {
  const [decisions, setDecisions] = useState<Record<string, MirrorDecision>>(() =>
    Object.fromEntries(props.conflicts.map((c) => [c.persistentId, 'copy' as const]))
  )
  return (
    <Stack>
      <Text size="sm">
        You changed these playlists here since they came from Apple Music. Music&apos;s version will
        appear as a read-only playlist. What should happen to your edits?
      </Text>
      {props.conflicts.map((c) => (
        <Radio.Group
          key={c.persistentId}
          label={c.name}
          aria-label={c.name}
          value={decisions[c.persistentId]}
          onChange={(v) => setDecisions((d) => ({ ...d, [c.persistentId]: v as MirrorDecision }))}
        >
          <Group mt={4}>
            <Radio value="copy" label="Keep my edits as a copy" />
            <Radio value="replace" label="Replace with Apple version" />
          </Group>
        </Radio.Group>
      ))}
      <Group justify="flex-end">
        <Button variant="default" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button onClick={() => props.onStart(decisions)}>Start sync</Button>
      </Group>
    </Stack>
  )
}
