import type { Migration } from '../migrate'
import { initial } from './001-initial'
import { distinctDances } from './002-distinct-dances'

// Append new migrations here; versions must stay 1..n in order.
export const MIGRATIONS: readonly Migration[] = [initial, distinctDances]
