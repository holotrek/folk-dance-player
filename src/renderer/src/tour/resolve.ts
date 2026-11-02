import type { Capabilities } from '@shared/platform'
import type { TourStep, TourStepDef } from './steps'

// The steps of a tour part on this platform: steps that don't apply are dropped and text that
// depends on the platform is written out.
export function resolveSteps(defs: TourStepDef[], caps: Capabilities): TourStep[] {
  return defs
    .filter((d) => d.when?.(caps) ?? true)
    .map(({ when: _when, body, ...rest }) => ({
      ...rest,
      body: typeof body === 'function' ? body(caps) : body
    }))
}
