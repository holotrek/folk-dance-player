import { useRef } from 'react'
import { CloseButton, TextInput, type TextInputProps } from '@mantine/core'
import classes from './SearchInput.module.css'

// A search box with ✕ to clear it (shown once there's something to clear), which keeps the focus
// in the box. Used for every search in the app.
export default function SearchInput({
  value,
  onValueChange,
  ...props
}: Omit<TextInputProps, 'value' | 'onChange' | 'rightSection'> & {
  value: string
  onValueChange: (value: string) => void
}): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  return (
    <TextInput
      type="search"
      role="searchbox"
      {...props}
      ref={input}
      classNames={{ input: classes.input }}
      value={value}
      onChange={(e) => onValueChange(e.currentTarget.value)}
      rightSection={
        value ? (
          <CloseButton
            size="sm"
            aria-label="Clear search"
            onClick={() => {
              onValueChange('')
              input.current?.focus()
            }}
          />
        ) : null
      }
    />
  )
}
