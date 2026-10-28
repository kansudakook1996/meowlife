import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { getSchemaVersion, LATEST_SCHEMA_VERSION, migrate } from './migrations'

export type Db = DatabaseSync

/**
 * Open (or create) the database file and bring the schema up to date.
 * Before upgrading an existing database (e.g. after an app update) a full copy is saved
 * to `backups/` next to it, so a failed or unwanted migration can always be undone.
 */
export function openDatabase(filePath: string): Db {
  const db = new DatabaseSync(filePath)
  configure(db)
  const version = getSchemaVersion(db)
  if (version > 0 && version < LATEST_SCHEMA_VERSION) {
    backupBeforeMigration(db, filePath, version)
  }
  migrate(db)
  return db
}

/** Returns the path of the copy. */
export function backupBeforeMigration(db: Db, filePath: string, fromVersion: number, now = new Date()): string {
  const dir = join(dirname(filePath), 'backups')
  mkdirSync(dir, { recursive: true })
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  const target = join(dir, `pre-migration-v${fromVersion}-${stamp}.db`)
  // VACUUM INTO writes a consistent single-file copy (includes WAL contents).
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  return target
}

/** In-memory database for tests. */
export function openMemoryDatabase(): Db {
  const db = new DatabaseSync(':memory:')
  configure(db)
  migrate(db)
  return db
}

function configure(db: Db): void {
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
}

/** Run `fn` inside a transaction; roll back everything if it throws. */
export function inTransaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function nowIso(): string {
  return new Date().toISOString()
}
