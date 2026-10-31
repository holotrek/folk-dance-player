import type { TourStep } from './steps'

// The Basic tour (tour spec §3, steps 1–16). The welcome screen (step 0) is not a step: it is shown
// before the tour is entered.
export const BASIC_STEPS: TourStep[] = [
  {
    id: 'basic.end',
    part: 'basic',
    page: null,
    kind: 'choice',
    title: 'That is the basics',
    body: 'Would you like to learn about some more app features or start building your music library now?',
    choices: [
      { id: 'learn-more', label: 'Learn more' },
      { id: 'start-now', label: 'Start now!' }
    ]
  }
]
