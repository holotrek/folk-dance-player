import { useLibraryApi } from '../../library/LibraryProvider'
import DropTarget from './DropTarget'
import FilterEntry from './FilterEntry'
import SectionHeading from './SectionHeading'

// Spec §6.1 LIBRARY: All Music and Favorites (songs dropped on Favorites become favorites).
export default function LibrarySection(): React.JSX.Element {
  const api = useLibraryApi()
  return (
    <>
      <SectionHeading>Library</SectionHeading>
      <FilterEntry label="♪ All Music" filter={{ kind: 'all' }} />
      <DropTarget onFiles={(ids) => void api.invoke('library:setFavorite', ids, true)}>
        <FilterEntry label="★ Favorites" filter={{ kind: 'favorites' }} />
      </DropTarget>
    </>
  )
}
