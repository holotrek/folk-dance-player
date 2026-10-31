import type { RendererApi } from '@shared/contract'
import type { TourPart } from '@shared/tour'
import type { LibraryStore } from '../library/library-store'
import type { ProgramStore } from '../program/program-store'

export type Page = 'program' | 'music' | 'settings'

// 'do': the person does it, and the step ends when the real result is there. 'explain': Next.
// 'choice': buttons that end the part or go on. 'intro': a card with Next (the in-tour interstitial).
export type StepKind = 'do' | 'explain' | 'choice' | 'intro'

// What a "done when" condition can read: the real API (the practice library's, while touring) and
// the stores, so it checks the actual result rather than the clicks that led to it.
export interface StepContext {
  api: RendererApi
  library: LibraryStore
  program: ProgramStore
  page: Page
}

export interface TourChoice {
  id: string
  label: string
}

export interface TourStep {
  id: string
  part: TourPart
  page: Page | null // the page to be on (null: any)
  kind: StepKind
  // The data-tour ids to light up: one, or [from, to] for a drag. None for intro and choice steps.
  target?: string | [from: string, to: string]
  title: string
  body: string
  done?: (ctx: StepContext) => boolean | Promise<boolean> // 'do' steps
  choices?: TourChoice[] // 'choice' steps
}
