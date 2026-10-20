import { useEffect, useRef, useState } from 'react'
import { Autocomplete, Textarea, TextInput } from '@mantine/core'

// Inputs that keep their own value while you type and save once you leave the field, only if
// the value changed. They follow the saved value when it changes underneath them.

interface FieldProps {
  label: string
  value: string | null
  onSave: (value: string) => void
  readOnly?: boolean
}

// The field's text while editing, and a blur handler that saves it once if it changed. A value
// already saved isn't saved again while the reloaded value is on its way.
function useDraft(value: string | null, onSave: (v: string) => void) {
  const [draft, setDraft] = useState(value ?? '')
  const saved = useRef(value ?? '')
  useEffect(() => {
    setDraft(value ?? '')
    saved.current = value ?? ''
  }, [value])
  const onBlur = (): void => {
    if (draft === saved.current) return
    saved.current = draft
    onSave(draft)
  }
  return { draft, setDraft, onBlur }
}

export function TextField(props: FieldProps): React.JSX.Element {
  const { draft, setDraft, onBlur } = useDraft(props.value, props.onSave)
  return (
    <TextInput
      label={props.label}
      value={draft}
      readOnly={props.readOnly}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={onBlur}
    />
  )
}

export function SuggestField(props: FieldProps & { suggestions: string[] }): React.JSX.Element {
  const { draft, setDraft, onBlur } = useDraft(props.value, props.onSave)
  return (
    <Autocomplete
      label={props.label}
      data={props.suggestions}
      value={draft}
      onChange={setDraft}
      onBlur={onBlur}
      limit={8}
    />
  )
}

export function NotesField(props: FieldProps): React.JSX.Element {
  const { draft, setDraft, onBlur } = useDraft(props.value, props.onSave)
  return (
    <Textarea
      label={props.label}
      autosize
      minRows={2}
      value={draft}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={onBlur}
    />
  )
}
