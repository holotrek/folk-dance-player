import { Text } from '@mantine/core'
import classes from './TourBanner.module.css'

// While a tour runs: a slim reminder that this is not the person's library (tour spec §2.5).
export default function TourBanner(): React.JSX.Element {
  return (
    <Text role="status" size="xs" ta="center" className={classes.banner}>
      Practice library: your real music is safe
    </Text>
  )
}
