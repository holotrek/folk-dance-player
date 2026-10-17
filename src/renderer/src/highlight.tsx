import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import classes from './highlight.module.css'

// How long a highlighted control pulses: three pulses of 0.8 s (highlight.module.css).
export const HIGHLIGHT_MS = 2400

interface HighlightState {
  active: string | null
  show(id: string): void
}

const HighlightContext = createContext<HighlightState>({ active: null, show: () => undefined })

// Lets an app menu item point at a control on the page it opens (`app:showPage`'s `highlight`):
// the control's <HighlightTarget> pulses a border around it for a moment.
export function HighlightProvider(props: {
  children: React.ReactNode
  expose?: (show: (id: string) => void) => void // for tests
}): React.JSX.Element {
  const [active, setActive] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((id: string) => {
    if (timer.current) clearTimeout(timer.current)
    setActive(id)
    timer.current = setTimeout(() => setActive(null), HIGHLIGHT_MS)
  }, [])
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  useEffect(() => props.expose?.(show), [props, show])
  return (
    <HighlightContext.Provider value={{ active, show }}>{props.children}</HighlightContext.Provider>
  )
}

export function useHighlight(): (id: string) => void {
  return useContext(HighlightContext).show
}

// Wraps a control that a menu item can highlight.
export default function HighlightTarget(props: {
  id: string
  children: React.ReactNode
}): React.JSX.Element {
  const highlighted = useContext(HighlightContext).active === props.id
  return (
    <span
      className={classes.target}
      data-highlight={props.id}
      data-highlighted={highlighted ? 'true' : undefined}
    >
      {props.children}
    </span>
  )
}
