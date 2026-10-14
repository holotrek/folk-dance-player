import { useState } from 'react'
import { Button, Group, Paper, Radio, Stack, Text } from '@mantine/core'
import type { ApplePlaylistConflict, PlaylistDecision } from '@shared/import'

// Spec §5.3: Apple playlists edited here since their last import are never overwritten silently.
export default function PlaylistConflictsStep(props: {
  conflicts: ApplePlaylistConflict[]
  onImport: (decisions: Record<string, PlaylistDecision>) => void
  onCancel: () => void
}): React.JSX.Element {
  const [decisions, setDecisions] = useState<Record<string, PlaylistDecision>>(() =>
    Object.fromEntries(props.conflicts.map((c) => [c.persistentId, 'keep' as const]))
  )

  return (
    <Stack>
      <Text>
        These playlists have changed since you last imported them from Apple Music. What should
        happen to each one?
      </Text>
      {props.conflicts.map((c) => (
        <Paper key={c.persistentId} withBorder p="sm">
          <Radio.Group
            label={c.name}
            value={decisions[c.persistentId]}
            onChange={(v) =>
              setDecisions((d) => ({ ...d, [c.persistentId]: v as PlaylistDecision }))
            }
          >
            <Stack gap={6} mt={4}>
              <Radio
                value="keep"
                label="Keep mine"
                description="Skip the Apple Music version this time"
              />
              <Radio
                value="replace"
                label="Replace"
                description="Use the Apple Music version; my changes are lost"
              />
              <Radio
                value="both"
                label="Keep both"
                description={`Import it as "${c.name} (Apple Music)"`}
              />
            </Stack>
          </Radio.Group>
        </Paper>
      ))}
      <Group justify="flex-end">
        <Button variant="default" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button onClick={() => props.onImport(decisions)}>Import</Button>
      </Group>
    </Stack>
  )
}
