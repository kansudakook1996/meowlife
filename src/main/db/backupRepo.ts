import { copyFileSync, existsSync, mkdirSync, openSync, readSync, closeSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { BackupSummary, RestoreResult } from '@shared/dataTools'
import { SYNC_TABLES, TABLE_COLUMNS, type SyncTable } from '@shared/syncModel'
import { inTransaction, nowIso, type Db } from './connection'
import { LATEST_SCHEMA_VERSION, migrate } from './migrations'

/** Thrown with a Thai message that is safe to show to the user. */
export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

const SQLITE_MAGIC = 'SQLite format 3\u0000'
const REQUIRED_TABLES = ['categories', 'payment_methods', 'recurring_rules', 'transactions']
export const BACKUP_EXTENSION = 'meowbackup'

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** A consistent single-file copy of the live database (includes everything in the WAL). */
export function createBackup(db: Db, targetPath: string): void {
  mkdirSync(dirname(targetPath), { recursive: true })
  if (existsSync(targetPath)) rmSync(targetPath)
  db.exec(`VACUUM INTO ${sqlString(targetPath)}`)
}

/** Check that a file is a usable MeowLife backup WITHOUT touching current data. */
export function inspectBackup(filePath: string): BackupSummary {
  let header: string
  try {
    const fd = openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(16)
      readSync(fd, buf, 0, 16, 0)
      header = buf.toString('latin1')
    } finally {
      closeSync(fd)
    }
  } catch {
    throw new BackupError('เปิดไฟล์นี้ไม่ได้ ตรวจว่าไฟล์ยังอยู่และไม่ได้ถูกเปิดค้างไว้')
  }
  if (header !== SQLITE_MAGIC) throw new BackupError('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ MeowLife')

  let backup: DatabaseSync | null = null
  try {
    backup = new DatabaseSync(filePath, { readOnly: true })
    const version = (backup.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    if (version < 1) throw new BackupError('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ MeowLife')
    if (version > LATEST_SCHEMA_VERSION) {
      throw new BackupError('ไฟล์สำรองนี้สร้างจาก MeowLife เวอร์ชันใหม่กว่า กรุณาอัปเดตแอปก่อน')
    }
    const tables = (backup.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
      (t) => t.name
    )
    if (!REQUIRED_TABLES.every((t) => tables.includes(t))) throw new BackupError('ไฟล์สำรองนี้ข้อมูลไม่ครบ (ขาดตารางหลัก)')
    const check = backup.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
    if (check.integrity_check !== 'ok') throw new BackupError('ไฟล์สำรองนี้เสียหาย (ตรวจความสมบูรณ์ไม่ผ่าน)')
    const count = (table: string): number =>
      (backup!.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE deleted_at IS NULL`).get() as { n: number }).n
    return {
      schemaVersion: version,
      transactions: count('transactions'),
      recurringRules: count('recurring_rules'),
      categories: count('categories'),
      paymentMethods: count('payment_methods')
    }
  } catch (error) {
    if (error instanceof BackupError) throw error
    throw new BackupError('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ MeowLife หรือเสียหาย')
  } finally {
    backup?.close()
  }
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-')
}

/**
 * Restore = "make the app look like the backup", done as ordinary edits:
 * rows missing from the backup are soft-deleted, backup rows are written back, all marked dirty,
 * so the result also wins when syncing with Firebase. A full copy of the current data is saved first.
 */
export function restoreFromBackup(db: Db, backupPath: string, backupsDir: string, now = new Date()): RestoreResult {
  const summary = inspectBackup(backupPath)
  mkdirSync(backupsDir, { recursive: true })

  const safetyCopy = join(backupsDir, `pre-restore-${stamp(now)}.db`)
  createBackup(db, safetyCopy)

  // Work on a private copy upgraded to the current schema (old backups lack newer columns).
  const temp = join(backupsDir, `restore-temp-${stamp(now)}.db`)
  copyFileSync(backupPath, temp)
  const rowsByTable = new Map<SyncTable, Array<Record<string, unknown>>>()
  const source = new DatabaseSync(temp)
  try {
    migrate(source)
    for (const table of SYNC_TABLES) {
      rowsByTable.set(table, source.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>)
    }
  } finally {
    source.close()
    for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(temp + suffix, { force: true })
  }

  const stampNow = nowIso()
  let softDeleted = 0
  let skipped = 0
  inTransaction(db, () => {
    for (const table of SYNC_TABLES) {
      const rows = rowsByTable.get(table) ?? []
      const keep = new Set(rows.map((r) => String(r['id'])))
      const current = db.prepare(`SELECT id FROM ${table} WHERE deleted_at IS NULL`).all() as Array<{ id: string }>
      const remove = db.prepare(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?`)
      for (const { id } of current) {
        if (!keep.has(id)) {
          remove.run(stampNow, stampNow, id)
          softDeleted++
        }
      }
      const cols = TABLE_COLUMNS[table]
      const upsert = db.prepare(
        `INSERT INTO ${table} (${cols.join(', ')}, dirty) VALUES (${cols.map(() => '?').join(', ')}, 1)
         ON CONFLICT(id) DO UPDATE SET ${cols
           .filter((c) => c !== 'id')
           .map((c) => `${c} = excluded.${c}`)
           .join(', ')}, dirty = 1`
      )
      for (const row of rows) {
        const values = cols.map((c) => (c === 'updated_at' ? stampNow : ((row[c] as string | number | null | undefined) ?? null)))
        try {
          upsert.run(...values)
        } catch {
          skipped++
        }
      }
    }
  })
  return { summary, safetyCopy, softDeleted, skipped }
}

/** One automatic backup per day, keeping the newest `keep` files. Returns the new file or null. */
export function ensureDailyBackup(db: Db, backupsDir: string, now = new Date(), keep = 7): string | null {
  const day = now.toISOString().slice(0, 10)
  const target = join(backupsDir, `auto-${day}.db`)
  let created: string | null = null
  if (!existsSync(target)) {
    createBackup(db, target)
    created = target
  }
  const autos = readdirSync(backupsDir)
    .filter((f) => /^auto-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
  for (const old of autos.slice(0, Math.max(0, autos.length - keep))) rmSync(join(backupsDir, old), { force: true })
  return created
}
