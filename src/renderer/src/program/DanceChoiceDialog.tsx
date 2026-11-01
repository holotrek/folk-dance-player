import { useEffect, useState } from 'react'
import { Button, Group, Modal, Radio, Stack } from '@mantine/core'
import type { SongDance } from '@shared/library'

export interface DanceChoice {
  // The row (a program item or a held song) just added, as its song's default dance.
  item: { id: number; title: string; danceId: number | null }
  dances: SongDance[]
}

// Songs just added to the program or Holding that have several dances: which one each is danced as. Each
// starts at the song's default (what was added); closing the dialog keeps those.
export default function DanceChoiceDialog(props: {
  choices: DanceChoice[]
  onDone: (changes: { itemId: number; danceId: number }[]) => void
  onClose: () => void
}): React.JSX.Element {
  const [picked, setPicked] = useState<Record<number, string>>({})
  useEffect(() => {
    setPicked(
      Object.fromEntries(props.choices.map((c) => [c.item.id, String(c.item.danceId ?? '')]))
    )
  }, [props.choices])

  const done = (): void => {
    const changes = props.choices.flatMap((c) => {
      const danceId = Number(picked[c.item.id])
      return danceId && danceId !== c.item.danceId ? [{ itemId: c.item.id, danceId }] : []
    })
    props.onDone(changes)
  }

  return (
    <Modal opened={props.choices.length > 0} onClose={props.onClose} title="Which dance?">
      <Stack data-tour="program.dance-dialog">
        {props.choices.map((c) => (
          <Radio.Group
            key={c.item.id}
            label={c.item.title}
            value={picked[c.item.id] ?? ''}
            onChange={(v) => setPicked((p) => ({ ...p, [c.item.id]: v }))}
          >
            <Stack gap={6} mt={6}>
              {c.dances.map((d) => (
                <Radio key={d.danceId} value={String(d.danceId)} label={d.label} />
              ))}
            </Stack>
          </Radio.Group>
        ))}
        <Group justify="flex-end">
          <Button onClick={done}>Done</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
