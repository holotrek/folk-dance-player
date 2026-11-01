import type { TourPart } from '@shared/tour'
import type { StepContext, TourStep } from './steps'

export interface EngineState {
  index: number
  step: TourStep
  total: number
}

export interface TourEngine {
  state(): EngineState
  // Advances over every "do" step whose condition is already true (so an early action completes at
  // once), and stops at the first step that needs the person.
  evaluate(ctx: StepContext): Promise<void>
  // Explain and intro steps only.
  next(): void
  // A choice step's button. "learn-more" goes on into Advanced; any other choice ends the tour.
  choose(choice: string): void
  subscribe(listener: () => void): () => void
}

export interface EngineOptions {
  // The Advanced steps (starting with their intro), appended when the person picks "learn-more".
  advanced: TourStep[]
  // A part was finished (its last step's choice was made).
  onFinishPart(part: TourPart): void
  // The tour is over: the app returns to the real library.
  onEnd(): void
  // The context a step's `begin` hook runs with when it arrives by Next or a choice.
  context?: () => StepContext
}

// The tour as a state machine over its steps (tour spec §4.3). It knows nothing about the screen.
export function createTourEngine(initial: TourStep[], opts: EngineOptions): TourEngine {
  const steps = [...initial]
  let index = 0
  const listeners = new Set<() => void>()
  const changed = (): void => listeners.forEach((l) => l())
  // A step has just become the current one.
  const arrived = (ctx: StepContext | undefined): void => {
    if (!ctx) return
    try {
      steps[index].begin?.(ctx)
    } catch {
      // a hook that fails must not stop the tour
    }
  }
  const go = (to: number): void => {
    index = Math.min(to, steps.length - 1)
    arrived(opts.context?.())
    changed()
  }
  arrived(opts.context?.())

  return {
    state: () => ({ index, step: steps[index], total: steps.length }),
    async evaluate(ctx) {
      let moved = false
      while (steps[index].kind === 'do' && index < steps.length - 1) {
        let done = false
        try {
          done = (await steps[index].done?.(ctx)) === true
        } catch {
          done = false
        }
        if (!done) break
        index++
        arrived(ctx)
        moved = true
      }
      if (moved) changed()
    },
    next() {
      const { kind } = steps[index]
      if ((kind === 'explain' || kind === 'intro') && index < steps.length - 1) go(index + 1)
    },
    choose(choice) {
      const step = steps[index]
      if (step.kind !== 'choice' || !step.choices?.some((c) => c.id === choice)) return
      opts.onFinishPart(step.part)
      if (choice === 'learn-more') {
        steps.push(...opts.advanced)
        go(index + 1)
      } else {
        opts.onEnd()
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
