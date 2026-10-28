import { DatabaseSync } from 'node:sqlite'
import { migrate } from './migrations'

export type Db = DatabaseSync

/** Open (or create) the database file and bring the schema up to date. */
export function openDatabase(filePath: string): Db {
  const db = new DatabaseSync(filePath)
  configure(db)
  migrate(db)
  return db
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
