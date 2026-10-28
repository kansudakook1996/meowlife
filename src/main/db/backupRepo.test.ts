import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TransactionInput } from '@shared/schemas'
import { BackupError, createBackup, ensureDailyBackup, inspectBackup, restoreFromBackup } from './backupRepo'
import { openMemoryDatabase, type Db } from './connection'
import { DEFAULT_CATEGORIES } from './defaults'
import { LATEST_SCHEMA_VERSION, migrate } from './migrations'
import { countDirty } from './syncRepo'
import { createTransaction, listMonth } from './transactionRepo'

const FOOD = DEFAULT_CATEGORIES[0]!.id
const TODAY = '2026-10-28'
let dir: string
let db: Db

function tx(title: string, amount = 5000): TransactionInput {
  return {
    kind: 'expense',
    title,
    amountSatang: amount,
    categoryId: FOOD,
    paymentMethodId: null,
    txnDate: '2026-10-10',
    dueDate: null,
    isPaid: true,
    note: ''
  }
}
const titles = (d: Db): string[] => listMonth(d, '2026-10', TODAY).map((t) => t.title).sort()

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "meowlife-backup-'test-"))
  db = openMemoryDatabase()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('backup file', () => {
  it('is a complete, inspectable copy', () => {
    createTransaction(db, tx('ก'), TODAY)
    createTransaction(db, tx('ข'), TODAY)
    const file = join(dir, 'a.meowbackup')
    createBackup(db, file)
    expect(inspectBackup(file)).toMatchObject({ schemaVersion: LATEST_SCHEMA_VERSION, transactions: 2, categories: 12 })
    createBackup(db, file) // overwriting an existing target works
  })

  it('rejects files that are not backups, damaged, or from a newer app', () => {
    const text = join(dir, 'notes.meowbackup')
    writeFileSync(text, 'hello, I am not a database at all')
    expect(() => inspectBackup(text)).toThrow(BackupError)
    expect(() => inspectBackup(join(dir, 'missing.meowbackup'))).toThrow(/เปิดไฟล์นี้ไม่ได้/)

    const other = join(dir, 'other.db')
    const o = new DatabaseSync(other)
    o.exec('CREATE TABLE something (x)')
    o.exec('PRAGMA user_version = 1')
    o.close()
    expect(() => inspectBackup(other)).toThrow(/ข้อมูลไม่ครบ/)

    const newer = join(dir, 'newer.meowbackup')
    createBackup(db, newer)
    const n = new DatabaseSync(newer)
    n.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 1}`)
    n.close()
    expect(() => inspectBackup(newer)).toThrow(/เวอร์ชันใหม่กว่า/)
  })
})

describe('restore', () => {
  it('makes data match the backup, keeps a safety copy, and marks everything for sync', () => {
    createTransaction(db, tx('อยู่ในไฟล์สำรอง 1'), TODAY)
    createTransaction(db, tx('อยู่ในไฟล์สำรอง 2'), TODAY)
    const file = join(dir, 'b.meowbackup')
    createBackup(db, file)

    createTransaction(db, tx('เพิ่มทีหลัง'), TODAY)
    expect(titles(db)).toContain('เพิ่มทีหลัง')

    const result = restoreFromBackup(db, file, join(dir, 'backups'))
    expect(titles(db)).toEqual(['อยู่ในไฟล์สำรอง 1', 'อยู่ในไฟล์สำรอง 2'])
    expect(result.softDeleted).toBe(1)
    expect(countDirty(db)).toBeGreaterThanOrEqual(3)

    // The safety copy still has the item added after the backup, so the restore can itself be undone.
    expect(existsSync(result.safetyCopy)).toBe(true)
    expect(inspectBackup(result.safetyCopy).transactions).toBe(3)
    expect(readdirSync(join(dir, 'backups')).filter((f) => f.startsWith('restore-temp'))).toHaveLength(0)
  })

  it('can restore an old v1 backup (taken before sync existed) into the current schema', () => {
    const old = join(dir, 'v1.meowbackup')
    const o = new DatabaseSync(old)
    migrate(o, 1)
    o.prepare(
      `INSERT INTO transactions (id, kind, title, amount_satang, txn_date, created_at, updated_at, dirty)
       VALUES ('9a2f4a8e-3f55-4f0a-9d0e-1d2c3b4a5f60', 'expense', 'ข้อมูลเก่า v1', 12345, '2026-10-05', 'x', 'x', 0)`
    ).run()
    o.exec("VACUUM INTO '" + join(dir, 'v1-clean.meowbackup').replace(/'/g, "''") + "'")
    o.close()

    createTransaction(db, tx('ข้อมูลปัจจุบัน'), TODAY)
    const result = restoreFromBackup(db, join(dir, 'v1-clean.meowbackup'), join(dir, 'backups'))
    expect(result.summary.schemaVersion).toBe(1)
    expect(titles(db)).toEqual(['ข้อมูลเก่า v1'])
    expect(listMonth(db, '2026-10', TODAY)[0]?.amountSatang).toBe(12345)
  })

  it('refuses a bad file before touching any data', () => {
    createTransaction(db, tx('ต้องไม่หาย'), TODAY)
    const bad = join(dir, 'bad.meowbackup')
    writeFileSync(bad, 'not a database')
    expect(() => restoreFromBackup(db, bad, join(dir, 'backups'))).toThrow(BackupError)
    expect(titles(db)).toEqual(['ต้องไม่หาย'])
    expect(existsSync(join(dir, 'backups'))).toBe(false)
  })
})

describe('daily automatic backup', () => {
  it('creates one per day and keeps only the newest 7', () => {
    const backups = join(dir, 'backups')
    expect(ensureDailyBackup(db, backups, new Date('2026-10-01T10:00:00Z'))).toContain('auto-2026-10-01.db')
    expect(ensureDailyBackup(db, backups, new Date('2026-10-01T18:00:00Z'))).toBeNull()
    for (let d = 2; d <= 10; d++) ensureDailyBackup(db, backups, new Date(`2026-10-${String(d).padStart(2, '0')}T10:00:00Z`))
    const files = readdirSync(backups).sort()
    expect(files).toHaveLength(7)
    expect(files[0]).toBe('auto-2026-10-04.db')
    expect(files[6]).toBe('auto-2026-10-10.db')
  })
})
