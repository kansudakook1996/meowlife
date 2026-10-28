import {
  DOC_SCHEMAS,
  GENERATED_UPDATED_AT,
  SYNC_TABLES,
  TABLE_COLUMNS,
  docToRow,
  rowToDoc,
  type ApplyResult,
  type SyncConflictView,
  type SyncDoc,
  type SyncTable
} from '@shared/syncModel'
import { NotFoundError } from './catalogRepo'
import { inTransaction, nowIso, type Db } from './connection'

/* ---------- key/value state (owner uid, per-table cursors) ---------- */

export function getState(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setState(db: Db, key: string, value: string): void {
  db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value
  )
}

/**
 * A database belongs to the first Firebase account that syncs it. Signing in as someone else on the
 * same device must not upload this device's data into that other account.
 */
export function bindOwner(db: Db, uid: string): { mismatch: boolean } {
  const owner = getState(db, 'owner_uid')
  if (owner === null) {
    setState(db, 'owner_uid', uid)
    return { mismatch: false }
  }
  return { mismatch: owner !== uid }
}

/* ---------- outgoing changes ---------- */

export function countDirty(db: Db): number {
  let total = 0
  for (const table of SYNC_TABLES) {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE dirty = 1`).get() as { n: number }
    total += row.n
  }
  return total
}

export function getDirty(db: Db, limit: number): Array<{ table: SyncTable; doc: SyncDoc }> {
  const out: Array<{ table: SyncTable; doc: SyncDoc }> = []
  for (const table of SYNC_TABLES) {
    if (out.length >= limit) break
    const rows = db
      .prepare(`SELECT * FROM ${table} WHERE dirty = 1 ORDER BY updated_at LIMIT ?`)
      .all(limit - out.length) as Array<Record<string, unknown>>
    for (const row of rows) out.push({ table, doc: rowToDoc(table, row) })
  }
  return out
}

/** The row is only "clean" if it was not edited again while the push was in flight. */
export function markClean(db: Db, items: Array<{ table: SyncTable; id: string; updatedAt: string }>): void {
  inTransaction(db, () => {
    for (const { table, id, updatedAt } of items) {
      db.prepare(
        `UPDATE ${table}
         SET base_updated_at = ?, dirty = CASE WHEN updated_at = ? THEN 0 ELSE dirty END
         WHERE id = ?`
      ).run(updatedAt, updatedAt, id)
    }
  })
}

/* ---------- incoming changes ---------- */

type Row = Record<string, unknown> & { id: string; updated_at: string; dirty: number; base_updated_at: string | null }

function upsertFromDoc(db: Db, table: SyncTable, doc: SyncDoc): void {
  const cols = TABLE_COLUMNS[table]
  const row = docToRow(table, doc)
  const names = [...cols, 'dirty', 'base_updated_at']
  const values = [...cols.map((c) => row[c] ?? null), 0, String(doc['updatedAt'])]
  const updates = [...cols.filter((c) => c !== 'id'), 'dirty', 'base_updated_at'].map((c) => `${c} = excluded.${c}`)
  db.prepare(
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})
     ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}`
  ).run(...values)
}

function insertConflict(db: Db, table: SyncTable, rowId: string, local: SyncDoc, remote: SyncDoc, winner: 'local' | 'remote'): void {
  db.prepare(
    `INSERT INTO sync_conflicts (table_name, row_id, local_json, remote_json, winner, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(table, rowId, JSON.stringify(local), JSON.stringify(remote), winner, nowIso())
}

const sameDoc = (a: SyncDoc, b: SyncDoc): boolean => JSON.stringify(a) === JSON.stringify(b)

function applyOne(db: Db, table: SyncTable, doc: SyncDoc, result: ApplyResult): void {
  const id = String(doc['id'])
  const updatedAt = String(doc['updatedAt'])
  const local = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Row | undefined

  if (!local) {
    if (table === 'transactions' && doc['recurringRuleId'] && doc['recurringPeriod']) {
      // Same monthly bill generated under another id (only possible for data created before ids were deterministic).
      const dup = db
        .prepare('SELECT 1 FROM transactions WHERE recurring_rule_id = ? AND recurring_period = ?')
        .get(doc['recurringRuleId'], doc['recurringPeriod'])
      if (dup) {
        result.ignored++
        return
      }
    }
    upsertFromDoc(db, table, doc)
    result.inserted++
    return
  }

  if (local.updated_at === updatedAt) {
    // Same version on both sides (e.g. our own push whose confirmation was lost).
    if (local.dirty === 1 && sameDoc(rowToDoc(table, local), doc)) {
      db.prepare(`UPDATE ${table} SET dirty = 0, base_updated_at = ? WHERE id = ?`).run(updatedAt, id)
    }
    result.ignored++
    return
  }

  if (local.dirty === 0) {
    if (updatedAt > local.updated_at) {
      upsertFromDoc(db, table, doc)
      result.updated++
    } else {
      result.ignored++
    }
    return
  }

  // Local has unsent edits.
  if (updatedAt <= (local.base_updated_at ?? '')) {
    result.ignored++ // the server version is one we already know; our newer edit simply wins
    return
  }
  if (local.updated_at === GENERATED_UPDATED_AT) {
    upsertFromDoc(db, table, doc) // untouched auto-generated item: a real edit elsewhere wins silently
    result.updated++
    return
  }

  // Both sides changed the same row since the last sync: keep the newer one, and keep the other in sync_conflicts.
  const localDoc = rowToDoc(table, local)
  const remoteWins = updatedAt > local.updated_at
  insertConflict(db, table, id, localDoc, doc, remoteWins ? 'remote' : 'local')
  result.conflicts++
  if (remoteWins) {
    upsertFromDoc(db, table, doc)
    result.updated++
  } else {
    db.prepare(`UPDATE ${table} SET base_updated_at = ? WHERE id = ?`).run(updatedAt, id)
  }
}

/** Apply documents pulled from Firestore. Every document is validated first (it is untrusted input). */
export function applyRemote(db: Db, table: SyncTable, rawDocs: unknown[]): ApplyResult {
  const result: ApplyResult = { inserted: 0, updated: 0, ignored: 0, conflicts: 0, skipped: 0 }
  const schema = DOC_SCHEMAS[table]
  inTransaction(db, () => {
    for (const raw of rawDocs) {
      const parsed = schema.safeParse(raw)
      if (!parsed.success) {
        result.skipped++
        continue
      }
      try {
        applyOne(db, table, parsed.data, result)
      } catch {
        result.skipped++ // e.g. a row that points at a category we do not have yet; retried on the next sync
      }
    }
  })
  return result
}

/* ---------- conflicts ---------- */

interface ConflictRow {
  id: number
  table_name: SyncTable
  row_id: string
  local_json: string
  remote_json: string
  winner: 'local' | 'remote'
  created_at: string
}

function titleOf(doc: SyncDoc): string {
  return String(doc['title'] ?? doc['name'] ?? '')
}

export function listConflicts(db: Db): SyncConflictView[] {
  const rows = db
    .prepare('SELECT * FROM sync_conflicts WHERE resolved_at IS NULL ORDER BY id DESC LIMIT 100')
    .all() as unknown as ConflictRow[]
  return rows.map((r) => ({
    id: r.id,
    table: r.table_name,
    rowId: r.row_id,
    title: titleOf(JSON.parse(r.local_json) as SyncDoc) || titleOf(JSON.parse(r.remote_json) as SyncDoc),
    winner: r.winner,
    createdAt: r.created_at
  }))
}

export function countConflicts(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM sync_conflicts WHERE resolved_at IS NULL').get() as { n: number }).n
}

/**
 * 'ack'      – the user accepts the kept version.
 * 'useOther' – the version that lost becomes a brand-new edit (and syncs as the newest one).
 */
export function resolveConflict(db: Db, id: number, action: 'ack' | 'useOther'): void {
  const row = db.prepare('SELECT * FROM sync_conflicts WHERE id = ? AND resolved_at IS NULL').get(id) as
    | ConflictRow
    | undefined
  if (!row) throw new NotFoundError('ไม่พบรายการขัดแย้งนี้ อาจจัดการไปแล้ว')
  inTransaction(db, () => {
    if (action === 'useOther') {
      const loser = JSON.parse(row.winner === 'local' ? row.remote_json : row.local_json) as SyncDoc
      const parsed = DOC_SCHEMAS[row.table_name].safeParse(loser)
      if (!parsed.success) throw new NotFoundError('ข้อมูลเวอร์ชันเดิมใช้ไม่ได้')
      const doc = { ...parsed.data, updatedAt: nowIso(), deletedAt: null }
      const dbRow = docToRow(row.table_name, doc)
      const cols = TABLE_COLUMNS[row.table_name].filter((c) => c !== 'id' && c !== 'created_at')
      const result = db
        .prepare(`UPDATE ${row.table_name} SET ${cols.map((c) => `${c} = ?`).join(', ')}, dirty = 1 WHERE id = ?`)
        .run(...cols.map((c) => dbRow[c] ?? null), row.row_id)
      if (result.changes === 0) throw new NotFoundError('ไม่พบรายการเดิมในเครื่อง')
    }
    db.prepare('UPDATE sync_conflicts SET resolved_at = ? WHERE id = ?').run(nowIso(), id)
  })
}
