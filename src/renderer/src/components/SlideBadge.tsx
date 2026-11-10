import { Tooltip } from '@mantine/core'
import type { SlideKind } from '@shared/library'
import { SlideIcon } from './icons'
import classes from './SlideBadge.module.css'

const NAME: Record<SlideKind, string> = {
  canva: 'Canva slide',
  image: 'Image',
  both: 'Canva slide and image'
}
const TIP: Record<SlideKind, string> = {
  canva: 'This dance has a Canva slide',
  image: 'This dance has an image',
  both: 'This dance has a Canva slide and an image'
}

// The photo icon on a row whose dance has something to project (issue #82). Nothing for a dance
// with neither; `reserve` keeps the room so labels in a list stay aligned.
export default function SlideBadge({
  slide,
  reserve = false
}: {
  slide: SlideKind | null
  reserve?: boolean
}): React.JSX.Element | null {
  if (slide === null) {
    return reserve ? <span className={classes.badge} data-slide-spacer aria-hidden="true" /> : null
  }
  return (
    <Tooltip label={TIP[slide]} openDelay={300}>
      <span className={classes.badge} role="img" aria-label={NAME[slide]}>
        <SlideIcon size={16} />
      </span>
    </Tooltip>
  )
}
