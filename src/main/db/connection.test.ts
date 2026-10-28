import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { backupBeforeMigration, openDatabase } from './connection'
import { getSchemaVersion, LATEST_SCHEMA_VERSION } from './migrations'

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "meowlife-test-'quote-"))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('openDatabase', () => {
  it('creates a new file at the latest schema and keeps data across reopen', () => {
    const file = join(tempDir(), 'meowlife.db')
    const db = openDatabase(file)
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION)
    db.prepare(
      `INSERT INTO transactions (id, kind, title, amount_satang, txn_date, created_at, updated_at)
       VALUES ('t1', 'expense', 'ทดสอบ', 100, '2026-10-28', 'x', 'x')`
    ).run()
    db.close()

    const again = openDatabase(file)
    expect(again.prepare('SELECT title FROM transactions').get()).toEqual({ title: 'ทดสอบ' })
    again.close()
  })

  it('backup copy is a complete, readable database (path with a quote)', () => {
    const dir = tempDir()
    const file = join(dir, 'meowlife.db')
    const db = openDatabase(file)
    db.prepare(
      `INSERT INTO transactions (id, kind, title, amount_satang, txn_date, created_at, updated_at)
       VALUES ('t1', 'income', 'เงินเดือน', 2500000, '2026-10-28', 'x', 'x')`
    ).run()
    const copy = backupBeforeMigration(db, file, 1, new Date('2026-10-28T12:00:00Z'))
    db.close()

    expect(existsSync(copy)).toBe(true)
    expect(copy).toContain(join(dir, 'backups'))
    const restored = new DatabaseSync(copy)
    expect(restored.prepare('SELECT amount_satang FROM transactions').get()).toEqual({ amount_satang: 2500000 })
    restored.close()
  })
})
