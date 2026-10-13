import type { Migration } from '../migrate'
import { initial } from './001-initial'

// Append new migrations here; versions must stay 1..n in order.
export const MIGRATIONS: readonly Migration[] = [initial]
