import type { Migration } from '../migrate'
import { initial } from './001-initial'
import { distinctDances } from './002-distinct-dances'
import { holdingOrder } from './003-holding-order'

// Append new migrations here; versions must stay 1..n in order.
export const MIGRATIONS: readonly Migration[] = [initial, distinctDances, holdingOrder]
