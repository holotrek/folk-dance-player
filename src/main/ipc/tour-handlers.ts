import type { InvokeHandlers } from '@shared/contract'
import { tourOffer } from '@shared/tour'
import type { HandlerDeps } from './handlers'

type TourChannel = Extract<keyof InvokeHandlers, `tour:${string}`>

// The guided tour's calls (tour spec §4.6). The flags are real settings; entering and leaving the
// practice library belongs to the tour mode, which the app provides.
export function tourHandlers(deps: HandlerDeps): Pick<InvokeHandlers, TourChannel> {
  const { settings, tour } = deps
  return {
    'tour:offer': () =>
      tourOffer({ basic: settings.get('tour.basic'), advanced: settings.get('tour.advanced') }),
    'tour:state': () => tour?.state() ?? { part: null, landOn: null },
    'tour:start': (part) => tour?.start(part),
    'tour:finish': (part) => settings.set(`tour.${part}`, 'done'),
    'tour:hide': (part) => settings.set(`tour.${part}`, 'hidden'),
    'tour:leave': () => tour?.leave()
  }
}
