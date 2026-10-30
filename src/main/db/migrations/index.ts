import type { Migration } from '../migrate'
import { initial } from './001-initial'
import { distinctDances } from './002-distinct-dances'
import { holdingOrder } from './003-holding-order'
import { appleSync } from './004-apple-sync'
import { importMapping } from './005-import-mapping'
import { danceAttachments } from './006-dance-attachments'
import { holdingItems } from './007-holding-items'

// Append new migrations here; versions must stay 1..n in order.
export const MIGRATIONS: readonly Migration[] = [
  initial,
  distinctDances,
  holdingOrder,
  appleSync,
  importMapping,
  danceAttachments,
  holdingItems
]
