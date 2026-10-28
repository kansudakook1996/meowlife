import type { DatabaseSync } from 'node:sqlite'
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS } from './defaults'

/**
 * Numbered schema migrations tracked by PRAGMA user_version.
 * Never edit a migration that has shipped in a release — append a new one.
 */
interface Migration {
  version: number
  up(db: DatabaseSync): void
}

const SYNC_COLUMNS = `
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  dirty INTEGER NOT NULL DEFAULT 1 CHECK (dirty IN (0, 1))`

const migrations: Migration[] = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE categories (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
          name TEXT NOT NULL,
          icon TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          ${SYNC_COLUMNS}
        );

        CREATE TABLE payment_methods (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          ${SYNC_COLUMNS}
        );

        CREATE TABLE recurring_rules (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
          title TEXT NOT NULL,
          amount_satang INTEGER NOT NULL CHECK (amount_satang > 0),
          category_id TEXT REFERENCES categories(id),
          payment_method_id TEXT REFERENCES payment_methods(id),
          day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
          start_month TEXT NOT NULL,
          end_month TEXT,
          note TEXT NOT NULL DEFAULT '',
          is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
          ${SYNC_COLUMNS}
        );

        CREATE TABLE transactions (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
          title TEXT NOT NULL,
          amount_satang INTEGER NOT NULL CHECK (amount_satang > 0),
          category_id TEXT REFERENCES categories(id),
          payment_method_id TEXT REFERENCES payment_methods(id),
          txn_date TEXT NOT NULL,
          due_date TEXT,
          is_paid INTEGER NOT NULL DEFAULT 0 CHECK (is_paid IN (0, 1)),
          paid_date TEXT,
          note TEXT NOT NULL DEFAULT '',
          recurring_rule_id TEXT REFERENCES recurring_rules(id),
          recurring_period TEXT,
          ${SYNC_COLUMNS}
        );

        CREATE INDEX idx_transactions_date ON transactions (txn_date) WHERE deleted_at IS NULL;
        CREATE UNIQUE INDEX idx_transactions_recurring
          ON transactions (recurring_rule_id, recurring_period)
          WHERE recurring_rule_id IS NOT NULL;
      `)

      const now = new Date().toISOString()
      const insertCategory = db.prepare(
        `INSERT INTO categories (id, kind, name, icon, sort_order, created_at, updated_at, dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
      )
      DEFAULT_CATEGORIES.forEach((c, i) => insertCategory.run(c.id, c.kind, c.name, c.icon, i, now, now))

      const insertMethod = db.prepare(
        `INSERT INTO payment_methods (id, name, sort_order, created_at, updated_at, dirty)
         VALUES (?, ?, ?, ?, ?, 0)`
      )
      DEFAULT_PAYMENT_METHODS.forEach((p, i) => insertMethod.run(p.id, p.name, i, now, now))
    }
  },
  {
    version: 2,
    up(db) {
      // base_updated_at = the version of the row last known to be identical on the server.
      // It lets sync tell "someone else changed this" apart from "this is my own earlier push".
      for (const table of ['categories', 'payment_methods', 'recurring_rules', 'transactions']) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN base_updated_at TEXT`)
        db.exec(`UPDATE ${table} SET base_updated_at = updated_at WHERE dirty = 0`)
      }
      db.exec(`
        CREATE TABLE sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE sync_conflicts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL,
          row_id TEXT NOT NULL,
          local_json TEXT NOT NULL,
          remote_json TEXT NOT NULL,
          winner TEXT NOT NULL CHECK (winner IN ('local', 'remote')),
          created_at TEXT NOT NULL,
          resolved_at TEXT
        );
      `)
    }
  },
  {
    version: 3,
    up(db) {
      // Personal Portal: tasks, journal, goals, habits, notes (all synced) + local settings (not synced).
      db.exec(`
        CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          due_date TEXT,
          repeat TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'daily', 'weekly', 'monthly')),
          is_done INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),
          done_date TEXT,
          ${SYNC_COLUMNS},
          base_updated_at TEXT
        );
        CREATE INDEX idx_tasks_due ON tasks (due_date) WHERE deleted_at IS NULL;

        CREATE TABLE journal_entries (
          id TEXT PRIMARY KEY,
          entry_date TEXT NOT NULL,
          mood INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
          body TEXT NOT NULL DEFAULT '',
          ${SYNC_COLUMNS},
          base_updated_at TEXT
        );
        CREATE INDEX idx_journal_date ON journal_entries (entry_date) WHERE deleted_at IS NULL;

        CREATE TABLE goals (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('life', 'saving')),
          target_satang INTEGER CHECK (target_satang IS NULL OR target_satang > 0),
          saved_satang INTEGER NOT NULL DEFAULT 0 CHECK (saved_satang >= 0),
          progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
          target_date TEXT,
          note TEXT NOT NULL DEFAULT '',
          is_done INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),
          done_date TEXT,
          ${SYNC_COLUMNS},
          base_updated_at TEXT
        );

        CREATE TABLE habits (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          icon TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          ${SYNC_COLUMNS},
          base_updated_at TEXT
        );

        CREATE TABLE habit_checks (
          id TEXT PRIMARY KEY,
          habit_id TEXT NOT NULL REFERENCES habits(id),
          check_date TEXT NOT NULL,
          ${SYNC_COLUMNS},
          base_updated_at TEXT
        );
        CREATE INDEX idx_habit_checks ON habit_checks (habit_id, check_date) WHERE deleted_at IS NULL;

        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
          ${SYNC_COLUMNS},
          base_updated_at TEXT
        );

        CREATE TABLE app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `)
    }
  }
]

export const LATEST_SCHEMA_VERSION = migrations[migrations.length - 1]?.version ?? 0

export function getSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
  return row?.user_version ?? 0
}

/** Bring the schema up to `target` (default: latest). Older targets exist for upgrade tests. */
export function migrate(db: DatabaseSync, target: number = LATEST_SCHEMA_VERSION): void {
  const current = getSchemaVersion(db)
  if (current > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Database schema v${current} is newer than this app supports (v${LATEST_SCHEMA_VERSION}). Please update MeowLife.`
    )
  }
  for (const migration of migrations) {
    if (migration.version <= current || migration.version > target) continue
    db.exec('BEGIN IMMEDIATE')
    try {
      migration.up(db)
      db.exec(`PRAGMA user_version = ${migration.version}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}
