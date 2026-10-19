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

  test('appearance follows the system by default, and can be light or dark', () => {
    expect(store.get('appearance')).toBe('system')
    store.set('appearance', 'dark')
    expect(store.get('appearance')).toBe('dark')
    expect(() => store.set('appearance', 'blue')).toThrow(InvalidSettingError)
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

  test('the column orders default to empty (the default order)', () => {
    expect(store.get('library.columns.music')).toEqual([])
    expect(store.get('library.columns.program')).toEqual([])
  })

  test('saves and reads back a column order', () => {
    store.set('library.columns.music', ['artist', 'country'])
    expect(new SettingsStore(db).get('library.columns.music')).toEqual(['artist', 'country'])
  })

  test('rejects a column order that is not a list of short strings', () => {
    expect(() => store.set('library.columns.music', [1] as never)).toThrow(InvalidSettingError)
    expect(() =>
      store.set(
        'library.columns.program',
        Array.from({ length: 41 }, (_, i) => `c${i}`)
      )
    ).toThrow(InvalidSettingError)
  })

  test('a corrupt stored column order falls back to the default', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('library.columns.music', '\"x\"')").run()
    expect(store.get('library.columns.music')).toEqual([])
  })

  test('Apple Music sync settings are validated', () => {
    expect(store.get('appleSync.enabled')).toBe(false)
    store.set('appleSync.libraryId', '0123456789ABCDEF')
    expect(store.get('appleSync.libraryId')).toBe('0123456789ABCDEF')
    expect(() => store.set('appleSync.libraryId', 'not-an-id')).toThrow(InvalidSettingError)
    expect(() => store.set('appleSync.lastResult', { finishedAt: 'x' })).toThrow(
      InvalidSettingError
    )
    expect(() => store.set('playlistFolders.open', ['abc'])).toThrow(InvalidSettingError)
  })
})
