import { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react'
import type { TourPart } from '@shared/tour'
import { useLibraryApi, useLibraryStore } from '../library/LibraryProvider'
import { useProgramStore } from '../program/ProgramProvider'
import { ADVANCED_STEPS } from './advanced-steps'
import { BASIC_STEPS } from './basic-steps'
import { createTourEngine, type TourEngine } from './engine'
import type { Page, StepContext, TourStep } from './steps'
import TourIntro from './TourIntro'
import TourOverlay from './TourOverlay'

const TourContext = createContext({ touring: false })

// Whether the window is on the practice library (the header shows a banner then).
export const useTour = (): { touring: boolean } => useContext(TourContext)

const defaultStepsFor = (): { steps: TourStep[]; advanced: TourStep[] } => ({
  steps: BASIC_STEPS,
  advanced: ADVANCED_STEPS
})

const EVALUATE_DELAY_MS = 60 // after an event, let the state settle before looking at it
const RECHECK_MS = 400 // and now and then regardless: a dialog fading out sends no event

// The guided tour in the control window (tour spec §4.3): asks main whether this window is touring,
// runs the engine over the part's steps, re-checks the current step after anything that could have
// completed it, and shows the launch offer and Help's intro screens. `setPage` is the app's tab.
export function TourProvider(props: {
  page: Page
  setPage(page: Page): void
  children: React.ReactNode
  stepsFor?: () => { steps: TourStep[]; advanced: TourStep[] } // for tests
}): React.JSX.Element {
  const { page, setPage, stepsFor = defaultStepsFor } = props
  const api = useLibraryApi()
  const library = useLibraryStore()
  const program = useProgramStore()
  const [engine, setEngine] = useState<TourEngine | null>(null)
  const [intro, setIntro] = useState<{ part: TourPart; mode: 'offer' | 'help' } | null>(null)
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const pageRef = useRef(page)
  pageRef.current = page
  const memo = useRef<Record<string, unknown>>({})

  // On load: are we touring? Land on Music after one? Is the offer due?
  useEffect(() => {
    let live = true
    void (async () => {
      const state = await api.invoke('tour:state')
      if (!live) return
      if (state.landOn === 'music') setPage('music')
      if (state.part) {
        const { steps, advanced } = stepsFor()
        const list = state.part === 'basic' ? steps : advanced.slice(1)
        setEngine(
          createTourEngine(list, {
            advanced,
            onFinishPart: (part) => void api.invoke('tour:finish', part),
            onEnd: () => void api.invoke('tour:leave'),
            context: () => ({
              api,
              library,
              program,
              page: pageRef.current,
              memo: memo.current
            })
          })
        )
        return
      }
      const due = await api.invoke('tour:offer')
      if (live && due) setIntro({ part: due, mode: 'offer' })
    })().catch(() => undefined) // a failed lookup must never get in the app's way
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on load
  }, [api])

  // Help → Take the … Tour: main asks for a part's intro screen.
  useEffect(() => api.on('tour:intro', (part) => setIntro({ part, mode: 'help' })), [api])

  // Follow the engine, and look at the current step after anything that could have completed it.
  useEffect(() => {
    if (!engine) return
    const context = (): StepContext => ({
      api,
      library,
      program,
      page: pageRef.current,
      memo: memo.current
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = (): void => {
      clearTimeout(timer)
      timer = setTimeout(() => void engine.evaluate(context()), EVALUATE_DELAY_MS)
    }
    const stops = [
      engine.subscribe(() => {
        redraw()
        check()
      }),
      // State the person changes without any event from main (the search box, a selection).
      library.subscribe(check),
      program.subscribe(check),
      api.on('library:changed', check),
      api.on('programs:changed', check),
      api.on('player:state', check)
    ]
    const dom = ['input', 'click', 'change', 'drop', 'dragend', 'keyup']
    dom.forEach((type) => document.addEventListener(type, check, true))
    check()
    const poll = setInterval(check, RECHECK_MS)
    return () => {
      clearTimeout(timer)
      clearInterval(poll)
      stops.forEach((stop) => stop())
      dom.forEach((type) => document.removeEventListener(type, check, true))
    }
  }, [engine, api, library, program])

  const current = engine?.state()
  const wanted = current?.step.page ?? null
  useEffect(() => {
    if (wanted && wanted !== page) setPage(wanted)
  }, [wanted, page, setPage])

  return (
    <TourContext.Provider value={{ touring: engine !== null }}>
      {props.children}
      {engine && current && (
        <TourOverlay
          step={current.step}
          index={current.index}
          total={current.total}
          placement={current.step.placement}
          onNext={() => engine.next()}
          onChoose={(choice) => engine.choose(choice)}
          onLeave={() => void api.invoke('tour:leave')}
          onGoThere={() => wanted && setPage(wanted)}
        />
      )}
      {intro && (
        <TourIntro
          part={intro.part}
          mode={intro.mode}
          onStart={() => {
            void api.invoke('tour:start', intro.part)
            setIntro(null)
          }}
          onNotNow={() => setIntro(null)}
          onHide={
            intro.mode === 'offer'
              ? () => {
                  void api.invoke('tour:hide', intro.part)
                  setIntro(null)
                }
              : undefined
          }
        />
      )}
    </TourContext.Provider>
  )
}
