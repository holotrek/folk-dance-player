import { useEffect, useState } from 'react'
import { Alert, Button, Group, Modal, Stack, TextInput } from '@mantine/core'
import { errorMessage } from '../ipc-error'

// A small dialog asking for a name (new playlist, rename…). `onSubmit` may throw; its message is shown.
export default function NamePrompt(props: {
  opened: boolean
  title: string
  initialValue?: string
  submitLabel: string
  onSubmit: (name: string) => Promise<unknown> | unknown
  onClose: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(props.initialValue ?? '')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (props.opened) {
      setValue(props.initialValue ?? '')
      setError(null)
    }
  }, [props.opened, props.initialValue])

  const submit = async (): Promise<void> => {
    try {
      await props.onSubmit(value)
      props.onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal opened={props.opened} onClose={props.onClose} title={props.title}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Stack>
          <TextInput
            label="Name"
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            data-autofocus
          />
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!value.trim()}>
              {props.submitLabel}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
