import { NavLink } from '@mantine/core'
import type { LibraryFilter } from '@shared/library'
import { useLibrary } from '../../library/LibraryProvider'

export const sameFilter = (a: LibraryFilter, b: LibraryFilter): boolean =>
  a.kind === b.kind && (a.kind !== 'playlist' || a.playlistId === (b as typeof a).playlistId)

// A sidebar entry that filters the library list, marked when it's the current filter.
export default function FilterEntry(props: {
  label: string
  filter: LibraryFilter
  extra?: React.ReactNode
}): React.JSX.Element {
  const filter = useLibrary((s) => s.filter)
  const setFilter = useLibrary((s) => s.setFilter)
  const active = sameFilter(filter, props.filter)
  return (
    <NavLink
      label={props.label}
      rightSection={props.extra}
      active={active}
      aria-current={active ? 'page' : undefined}
      onClick={() => void setFilter(props.filter)}
    />
  )
}
