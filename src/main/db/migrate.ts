import type { DatabaseSync } from 'node:sqlite'

export interface Migration {
  version: number
  name: string
  sql: string
}

export class SchemaTooNewError extends Error {
  constructor(
    readonly dbVersion: number,
    readonly appVersion: number
  ) {
    super(`Database schema ${dbVersion} is newer than this app supports (${appVersion})`)
    this.name = 'SchemaTooNewError'
  }
}

export class MigrationError extends Error {
  constructor(
    readonly migration: Migration,
    cause: unknown
  ) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    super(`Migration ${migration.version} (${migration.name}) failed: ${detail}`, { cause })
    this.name = 'MigrationError'
  }
}

export function getSchemaVersion(db: DatabaseSync): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
}

export function migrate(
  db: DatabaseSync,
  migrations: readonly Migration[]
): { from: number; to: number } {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error('Migrations must be numbered 1..n in order')
  })
  const from = getSchemaVersion(db)
  const latest = migrations.length
  if (from > latest) throw new SchemaTooNewError(from, latest)

  for (const m of migrations.slice(from)) {
    db.exec('BEGIN')
    try {
      db.exec(m.sql)
      db.exec(`PRAGMA user_version = ${m.version}`)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw new MigrationError(m, err)
    }
  }
  return { from, to: Math.max(from, latest) }
}
