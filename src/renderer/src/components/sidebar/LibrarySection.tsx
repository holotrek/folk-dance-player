import { useEffect } from 'react'
import { useAppleSync } from '../../apple-sync/useAppleSync'
import { useLibrary, useLibraryApi } from '../../library/LibraryProvider'
import DropTarget from './DropTarget'
import FilterEntry from './FilterEntry'
import SectionHeading from './SectionHeading'

// Spec §6.1 LIBRARY: All Music and Favorites (songs dropped on Favorites become favorites), and,
// while songs wait for review, Removed from Apple Music (sync spec §6.2).
export default function LibrarySection(): React.JSX.Element {
  const api = useLibraryApi()
  const reviewCount = useAppleSync(api)?.reviewCount ?? 0
  const filter = useLibrary((s) => s.filter)
  const setFilter = useLibrary((s) => s.setFilter)
  // The count arrives with appleSync:state, sent after every sync and every Keep or Remove.
  useEffect(() => {
    if (filter.kind === 'review' && reviewCount === 0) void setFilter({ kind: 'all' })
  }, [filter.kind, reviewCount, setFilter])
  return (
    <>
      <SectionHeading>Library</SectionHeading>
      <FilterEntry label="♪ All Music" filter={{ kind: 'all' }} />
      <DropTarget onFiles={(ids) => void api.invoke('library:setFavorite', ids, true)}>
        <FilterEntry label="★ Favorites" filter={{ kind: 'favorites' }} />
      </DropTarget>
      {reviewCount > 0 && (
        <FilterEntry
          label={`Removed from Apple Music (${reviewCount})`}
          filter={{ kind: 'review' }}
        />
      )}
    </>
  )
}
