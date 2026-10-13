import { beforeEach, describe, expect, test } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { InvalidSettingError, SettingsStore } from '../../../src/main/settings/settings-store'
import { createTestDb } from '../helpers/test-db'

let db: ReturnType<typeof createTestDb>
let store: SettingsStore

beforeEach(() => {
  db = createTestDb()
  store = new SettingsStore(db)
})

describe('SettingsStore', () => {
  test('returns defaults when nothing is stored', () => {
    expect(store.getAll()).toEqual(DEFAULT_SETTINGS)
    expect(store.get('autoContinue.enabled')).toBe(true)
    expect(store.get('autoContinue.seconds')).toBe(5)
  })

  test('persists a value and reads it back', () => {
    store.set('autoContinue.seconds', 12)
    expect(new SettingsStore(db).get('autoContinue.seconds')).toBe(12)
  })

  test('overwrites an existing value', () => {
    store.set('import.genreIsCountry', false)
    store.set('import.genreIsCountry', true)
    expect(store.get('import.genreIsCountry')).toBe(true)
  })

  test('stores structured values', () => {
    store.set('window.bounds', { x: 10, y: 20, width: 1200, height: 800 })
    store.set('danceTypeSuggestions', ['Line', 'Couple'])
    expect(store.get('window.bounds')).toEqual({ x: 10, y: 20, width: 1200, height: 800 })
    expect(store.get('danceTypeSuggestions')).toEqual(['Line', 'Couple'])
  })

  test('returned defaults are copies, not shared objects', () => {
    store.get('danceTypeSuggestions').push('Mutated')
    expect(store.get('danceTypeSuggestions')).toEqual(DEFAULT_SETTINGS.danceTypeSuggestions)
  })

  test('rejects unknown keys', () => {
    expect(() => store.set('nope', 1)).toThrow(InvalidSettingError)
  })

  test.each([
    ['autoContinue.seconds', -1],
    ['autoContinue.seconds', 2.5],
    ['autoContinue.seconds', '5'],
    ['import.artistTagTarget', 'composer'],
    ['import.genreIsCountry', 'yes'],
    ['danceTypeSuggestions', ['Line', '']],
    ['window.bounds', { x: 0, y: 0, width: 0, height: 10 }],
    ['currentProgramId', 0]
  ])('rejects invalid value for %s: %j', (key, value) => {
    expect(() => store.set(key, value)).toThrow(InvalidSettingError)
  })

  // Review Focus 3: wrong-type or corrupt stored values fall back to the default.
  test('falls back to the default for a wrong-type stored value', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('autoContinue.seconds', '\"ten\"')").run()
    expect(store.get('autoContinue.seconds')).toBe(5)
  })

  test('falls back to the default for corrupt JSON', () => {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('autoContinue.enabled', '{not json')"
    ).run()
    expect(store.get('autoContinue.enabled')).toBe(true)
    expect(() => store.getAll()).not.toThrow()
  })
})
