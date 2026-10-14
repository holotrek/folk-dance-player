import { useEffect, useState } from 'react'
import { TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useLibrary, useLibraryStore } from './LibraryProvider'

// The library search box (spec §6.2, §6.3), shared by the Music and Program pages. It starts from
// the store's search, so the search carries over between pages.
export default function LibrarySearch(props: { style?: React.CSSProperties }): React.JSX.Element {
  const store = useLibraryStore()
  const setSearch = useLibrary((s) => s.setSearch)
  const [text, setText] = useState(() => store.getState().search)
  const [debounced] = useDebouncedValue(text, 150)
  useEffect(() => {
    if (debounced !== store.getState().search) void setSearch(debounced)
  }, [debounced, setSearch, store])
  return (
    <TextInput
      type="search"
      role="searchbox"
      aria-label="Search music"
      placeholder="Search song, dance, teacher, choreographer or country"
      value={text}
      onChange={(e) => setText(e.currentTarget.value)}
      style={props.style}
    />
  )
}
