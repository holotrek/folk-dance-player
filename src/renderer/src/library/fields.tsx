import { useEffect, useRef, useState } from 'react'
import { Autocomplete, Textarea, TextInput } from '@mantine/core'

// Inputs that keep their own value while you type and save once you leave the field, only if
// the value changed. They follow the saved value when it changes underneath them.

interface FieldProps {
  label: string
  value: string | null
  onSave: (value: string) => void
  disabled?: boolean
  tour?: string // the guided tour's target id
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
  // Saves `value` unless it is what was saved.
  const save = (value: string): void => {
    if (value === saved.current) return
    saved.current = value
    onSave(value)
  }
  return { draft, setDraft, onBlur: () => save(draft), save }
}

export function TextField(props: FieldProps): React.JSX.Element {
  const { draft, setDraft, onBlur } = useDraft(props.value, props.onSave)
  return (
    <TextInput
      label={props.label}
      wrapperProps={props.tour ? { 'data-tour': props.tour } : undefined}
      value={draft}
      disabled={props.disabled}
      flex={1}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={onBlur}
    />
  )
}

export function SuggestField(props: FieldProps & { suggestions: string[] }): React.JSX.Element {
  const { draft, setDraft, onBlur, save } = useDraft(props.value, props.onSave)
  return (
    <Autocomplete
      label={props.label}
      wrapperProps={props.tour ? { 'data-tour': props.tour } : undefined}
      data={props.suggestions}
      value={draft}
      onChange={setDraft}
      // Picking a suggestion is a decision: save it now, not when the field is left.
      onOptionSubmit={save}
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
