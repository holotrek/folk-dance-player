import { ActionIcon } from '@mantine/core'
import { StarIcon } from '../components/icons'
import { useLibraryApi } from './LibraryProvider'
import classes from './FavoriteToggle.module.css'

// The star at the left of a song's row (library, holding, program): adds it to favorites or removes
// it. Clicks stay here, so they never select the row or start a preview.
export default function FavoriteToggle(props: {
  fileId: number
  label: string
  isFavorite: boolean
}): React.JSX.Element {
  const api = useLibraryApi()
  const { isFavorite } = props
  return (
    <ActionIcon
      variant="subtle"
      size="sm"
      color={isFavorite ? 'yellow' : 'gray'}
      className={isFavorite ? undefined : classes.unstarred}
      aria-label={
        isFavorite ? `Remove ${props.label} from favorites` : `Add ${props.label} to favorites`
      }
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      onClick={(e) => {
        e.stopPropagation()
        void api.invoke('library:setFavorite', [props.fileId], !isFavorite)
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <StarIcon filled={isFavorite} size={15} />
    </ActionIcon>
  )
}
