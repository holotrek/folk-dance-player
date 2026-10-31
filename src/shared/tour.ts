// The guided tour (tour spec): two parts, each with a saved flag.
export type TourPart = 'basic' | 'advanced'

// 'unseen': not finished and not turned off; 'done': finished; 'hidden': "Don't show this again".
export type TourFlag = 'unseen' | 'done' | 'hidden'

export const isTourFlag = (v: unknown): v is TourFlag =>
  v === 'unseen' || v === 'done' || v === 'hidden'

// Which part to offer at launch (spec §2.2): Basic until it is done or hidden; then Advanced until it
// is done or hidden. Hiding Basic offers nothing, not even Advanced.
export function tourOffer(flags: Record<TourPart, TourFlag>): TourPart | null {
  if (flags.basic === 'unseen') return 'basic'
  if (flags.basic === 'done' && flags.advanced === 'unseen') return 'advanced'
  return null
}
