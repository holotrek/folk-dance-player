import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import type { TourPart } from '@shared/tour'
import { INTRO } from './text'

// A part's intro screen in the real window (tour spec §2.1.1): the launch offer, or Help. Declining
// costs nothing (no reload). The launch offer also lets the person turn the offer off for good.
export default function TourIntro(props: {
  part: TourPart
  mode: 'offer' | 'help'
  onStart(): void
  onNotNow(): void
  onHide?(): void
}): React.JSX.Element {
  const text = INTRO[props.part]
  return (
    <Modal
      opened
      onClose={props.onNotNow}
      title={text.title}
      centered
      size="lg"
      closeOnClickOutside={false}
    >
      <Stack gap="sm">
        {text.paragraphs.map((p, i) => (
          <Text key={i}>{p}</Text>
        ))}
        <Group justify="space-between" mt="sm">
          {props.mode === 'offer' && props.onHide ? (
            <Button variant="subtle" color="gray" onClick={props.onHide}>
              Don’t show this again
            </Button>
          ) : (
            <span />
          )}
          <Group gap="xs">
            <Button variant="default" onClick={props.onNotNow}>
              Not now
            </Button>
            <Button onClick={props.onStart}>Start the tour</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
