import { isSyncSummary, type SyncSummary } from './apple-sync'
import { isTourFlag, type TourFlag } from './tour'

// Which of a song's tags fills a field on import (0.3.0 spec §3.4).
export type TagSource = 'artistTag' | 'albumArtistTag' | 'ignore'

// The control window's colors: the Mac's light/dark choice, or always light or dark.
export type Appearance = 'system' | 'light' | 'dark'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

// Spec §4 "Settings keys".
export interface Settings {
  'import.artistFrom': TagSource
  'import.teacherFrom': TagSource
  'import.choreographerFrom': TagSource
  'import.genreIsCountry': boolean
  danceTypeSuggestions: string[]
  'autoContinue.enabled': boolean
  'autoContinue.seconds': number
  'countdown.seconds': number
  'projector.enabled': boolean
  'projector.displayId': number | null
  'autoFullscreen.enabled': boolean
  'autoFullscreen.seconds': number
  'window.bounds': WindowBounds | null
  currentProgramId: number | null
  appearance: Appearance
  // Sync with Apple Music (sync spec §4).
  'appleSync.enabled': boolean
  'appleSync.libraryId': string | null
  'appleSync.lastResult': SyncSummary | null
  // Music's playlist folders that are open in the sidebar, by persistent ID.
  'playlistFolders.open': string[]
  // The movable columns of the Music page table and the Program page's library list, in order, by
  // column key. The empty list is the default order (0.3.0 spec §3.13).
  'library.columns.music': string[]
  'library.columns.program': string[]
  // The guided tour's two parts: not finished, finished, or "don't show this again" (tour spec §2.2).
  'tour.basic': TourFlag
  'tour.advanced': TourFlag
}

export type SettingKey = keyof Settings

export const DEFAULT_SETTINGS: Settings = {
  'import.artistFrom': 'artistTag',
  'import.teacherFrom': 'ignore',
  'import.choreographerFrom': 'ignore',
  'import.genreIsCountry': true,
  danceTypeSuggestions: [
    'Open Circle',
    'Closed Circle',
    'Line',
    'Separated',
    '4-Wall',
    'Couple',
    'Mixer',
    'Trio',
    'Set'
  ],
  'autoContinue.enabled': true,
  'autoContinue.seconds': 5,
  'countdown.seconds': 5,
  'projector.enabled': false,
  'projector.displayId': null,
  'autoFullscreen.enabled': true,
  'autoFullscreen.seconds': 15,
  'window.bounds': null,
  currentProgramId: null,
  appearance: 'system',
  'appleSync.enabled': false,
  'appleSync.libraryId': null,
  'appleSync.lastResult': null,
  'playlistFolders.open': [],
  'library.columns.music': [],
  'library.columns.program': [],
  'tour.basic': 'unseen',
  'tour.advanced': 'unseen'
}

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as readonly SettingKey[]

const TAG_SOURCES: readonly unknown[] = ['artistTag', 'albumArtistTag', 'ignore']

const isBool = (v: unknown): boolean => typeof v === 'boolean'
const isPersistentId = (v: unknown): boolean => typeof v === 'string' && /^[0-9A-F]{16}$/.test(v)
const isIntIn =
  (min: number, max: number) =>
  (v: unknown): boolean =>
    Number.isInteger(v) && (v as number) >= min && (v as number) <= max
const isTagSource = (v: unknown): boolean => TAG_SOURCES.includes(v)
const isIdOrNull = (v: unknown): boolean => v === null || (Number.isInteger(v) && (v as number) > 0)
const isDisplayIdOrNull = (v: unknown): boolean => v === null || Number.isInteger(v)
const isBoundsOrNull = (v: unknown): boolean => {
  if (v === null) return true
  if (typeof v !== 'object') return false
  const b = v as Record<string, unknown>
  return (
    ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(b[k])) &&
    (b.width as number) > 0 &&
    (b.height as number) > 0
  )
}
const isSuggestionList = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.length <= 100 &&
  v.every((s) => typeof s === 'string' && s.trim().length > 0)

const isColumnOrder = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.length <= 40 &&
  v.every((k) => typeof k === 'string' && k.length > 0 && k.length <= 40)

const VALIDATORS: { [K in SettingKey]: (v: unknown) => boolean } = {
  'import.artistFrom': isTagSource,
  'import.teacherFrom': isTagSource,
  'import.choreographerFrom': isTagSource,
  'import.genreIsCountry': isBool,
  danceTypeSuggestions: isSuggestionList,
  'autoContinue.enabled': isBool,
  'autoContinue.seconds': isIntIn(0, 600),
  'countdown.seconds': isIntIn(0, 60),
  'projector.enabled': isBool,
  'projector.displayId': isDisplayIdOrNull,
  'autoFullscreen.enabled': isBool,
  'autoFullscreen.seconds': isIntIn(5, 3600),
  'window.bounds': isBoundsOrNull,
  currentProgramId: isIdOrNull,
  appearance: (v) => v === 'system' || v === 'light' || v === 'dark',
  'appleSync.enabled': isBool,
  'appleSync.libraryId': (v) => v === null || isPersistentId(v),
  'appleSync.lastResult': (v) => v === null || isSyncSummary(v),
  'playlistFolders.open': (v) => Array.isArray(v) && v.length <= 1000 && v.every(isPersistentId),
  'library.columns.music': isColumnOrder,
  'library.columns.program': isColumnOrder,
  'tour.basic': isTourFlag,
  'tour.advanced': isTourFlag
}

export function isSettingKey(key: unknown): key is SettingKey {
  return typeof key === 'string' && Object.hasOwn(VALIDATORS, key)
}

export function isValidSetting<K extends SettingKey>(key: K, value: unknown): value is Settings[K] {
  return VALIDATORS[key](value)
}
