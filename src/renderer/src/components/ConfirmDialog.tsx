import { Button, Group, Modal, Stack, Text } from '@mantine/core'

export default function ConfirmDialog(props: {
  opened: boolean
  title: string
  message: React.ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <Modal opened={props.opened} onClose={props.onClose} title={props.title}>
      <Stack>
        <Text>{props.message}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            color={props.danger ? 'red' : undefined}
            onClick={() => {
              props.onConfirm()
              props.onClose()
            }}
          >
            {props.confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
