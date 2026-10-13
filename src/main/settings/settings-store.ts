import type { DatabaseSync } from 'node:sqlite'
import {
  DEFAULT_SETTINGS,
  isSettingKey,
  isValidSetting,
  SETTING_KEYS,
  type SettingKey,
  type Settings
} from '@shared/settings'

export class InvalidSettingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSettingError'
  }
}

export class SettingsStore {
  constructor(private readonly db: DatabaseSync) {}

  get<K extends SettingKey>(key: K): Settings[K] {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined
    if (row) {
      try {
        const value: unknown = JSON.parse(row.value)
        if (isValidSetting(key, value)) return value
      } catch {
        // Corrupt JSON: fall through to the default.
      }
    }
    return structuredClone(DEFAULT_SETTINGS[key])
  }

  getAll(): Settings {
    return Object.fromEntries(
      SETTING_KEYS.map((key) => [key, this.get(key)])
    ) as unknown as Settings
  }

  set(key: unknown, value: unknown): void {
    if (!isSettingKey(key)) throw new InvalidSettingError(`Unknown setting: ${String(key)}`)
    if (!isValidSetting(key, value)) {
      throw new InvalidSettingError(`Invalid value for ${key}: ${JSON.stringify(value)}`)
    }
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'
      )
      .run(key, JSON.stringify(value))
  }
}
