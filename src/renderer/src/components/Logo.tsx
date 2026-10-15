import logoUrl from '../assets/logo.svg'
import classes from './Logo.module.css'

// The app's logo. The SVG is all black, so it's drawn as a mask filled with the current text color:
// it follows the theme (and the projector's gray) without an edited copy. With a `label` it's an
// image of that name; without one it's decoration beside text that already says it.
export default function Logo({
  size,
  label,
  color
}: {
  size: number | string
  label?: string
  color?: string // any CSS color; the text color by default
}): React.JSX.Element {
  return (
    <span
      className={classes.logo}
      data-testid="logo"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={
        { width: size, height: size, color, '--logo': `url("${logoUrl}")` } as React.CSSProperties
      }
    />
  )
}
