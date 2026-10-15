export type TagTarget = 'artist' | 'teacher' | 'choreographer' | 'ignore'

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
  'import.artistTagTarget': TagTarget
  'import.albumArtistTagTarget': TagTarget
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
}

export type SettingKey = keyof Settings

export const DEFAULT_SETTINGS: Settings = {
  'import.artistTagTarget': 'artist',
  'import.albumArtistTagTarget': 'ignore',
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
  appearance: 'system'
}

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as readonly SettingKey[]

const TAG_TARGETS: readonly unknown[] = ['artist', 'teacher', 'choreographer', 'ignore']

const isBool = (v: unknown): boolean => typeof v === 'boolean'
const isIntIn =
  (min: number, max: number) =>
  (v: unknown): boolean =>
    Number.isInteger(v) && (v as number) >= min && (v as number) <= max
const isTagTarget = (v: unknown): boolean => TAG_TARGETS.includes(v)
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

const VALIDATORS: { [K in SettingKey]: (v: unknown) => boolean } = {
  'import.artistTagTarget': isTagTarget,
  'import.albumArtistTagTarget': isTagTarget,
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
  appearance: (v) => v === 'system' || v === 'light' || v === 'dark'
}

export function isSettingKey(key: unknown): key is SettingKey {
  return typeof key === 'string' && Object.hasOwn(VALIDATORS, key)
}

export function isValidSetting<K extends SettingKey>(key: K, value: unknown): value is Settings[K] {
  return VALIDATORS[key](value)
}
