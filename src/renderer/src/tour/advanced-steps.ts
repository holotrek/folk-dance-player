import { INTRO } from './text'
import type { TourStep } from './steps'

// The Advanced tour (tour spec §3, steps 16b–25). Its first step is the intro card, shown inside
// the tour after "Learn more"; entered directly, the tour starts after it.
export const ADVANCED_STEPS: TourStep[] = [
  {
    id: 'advanced.intro',
    part: 'advanced',
    page: null,
    kind: 'intro',
    title: INTRO.advanced.title,
    body: INTRO.advanced.paragraphs.join('\n\n')
  },
  {
    id: 'advanced.end',
    part: 'advanced',
    page: null,
    kind: 'choice',
    title: 'That is everything',
    body: 'You have seen all the features. Your real library is next.',
    choices: [{ id: 'done', label: 'Done' }]
  }
]
