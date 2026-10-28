import type { ApplyResult, SyncDoc, SyncTable } from './syncModel'
import { SYNC_TABLES } from './syncModel'

/** Local side of the sync (SQLite in the main process, reached through IPC in the app). */
export interface SyncLocal {
  /** Bind this device's database to a Firebase uid. `mismatch` = it already belongs to another account. */
  bind(uid: string): Promise<{ mismatch: boolean }>
  getCursor(table: SyncTable): Promise<string>
  setCursor(table: SyncTable, value: string): Promise<void>
  /** Dirty rows (up to limit), skipping tables listed in exclude (tables that failed earlier in this run). */
  getDirty(limit: number, exclude?: SyncTable[]): Promise<Array<{ table: SyncTable; doc: SyncDoc }>>
  markClean(items: Array<{ table: SyncTable; id: string; updatedAt: string }>): Promise<void>
  applyRemote(table: SyncTable, docs: SyncDoc[]): Promise<ApplyResult>
}

/** Cloud side (Firestore users/{uid}/{table}). Both methods throw on network/permission errors. */
export interface SyncRemote {
  /** Documents with updatedAt >= sinceIso ordered by updatedAt, at most `limit`. */
  pull(table: SyncTable, sinceIso: string, limit: number): Promise<SyncDoc[]>
  push(table: SyncTable, docs: SyncDoc[]): Promise<void>
}

export interface SyncResult {
  status: 'ok' | 'owner-mismatch'
  pulled: number
  pushed: number
  /** Local rows that changed because of remote data (UI should reload when > 0). */
  changed: number
  conflicts: number
  skipped: number
}

export interface SyncOptions {
  pageSize?: number
  /** Re-read this much before the cursor to tolerate clock differences between devices. */
  overlapMs?: number
}

const EMPTY: SyncResult = { status: 'ok', pulled: 0, pushed: 0, changed: 0, conflicts: 0, skipped: 0 }

/** Pull first (so conflicts are detected before we overwrite), then push everything that is dirty. */
export async function runSync(
  local: SyncLocal,
  remote: SyncRemote,
  uid: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const pageSize = options.pageSize ?? 300
  const overlapMs = options.overlapMs ?? 5 * 60_000

  const { mismatch } = await local.bind(uid)
  if (mismatch) return { ...EMPTY, status: 'owner-mismatch' }

  const result: SyncResult = { ...EMPTY }

  // One broken table (e.g. Security Rules not yet updated for a new feature) must not stop the others:
  // every table is tried, and the first error is thrown at the end so the UI shows it and retries.
  const failedTables: SyncTable[] = []
  let firstError: unknown = null
  const fail = (table: SyncTable, error: unknown): void => {
    // No connection: every other table would fail too (after a long wait each), so stop right away.
    if (isNetworkError(error)) throw error
    if (!failedTables.includes(table)) failedTables.push(table)
    firstError ??= error
  }

  for (const table of SYNC_TABLES) {
    try {
      const cursor = await local.getCursor(table)
      let since = cursor ? new Date(Date.parse(cursor) - overlapMs).toISOString() : ''
      let maxSeen = cursor
      let skipped = 0
      for (let page = 0; page < 200; page++) {
        const docs = await remote.pull(table, since, pageSize)
        if (docs.length === 0) break
        const applied = await local.applyRemote(table, docs)
        result.pulled += docs.length
        result.changed += applied.inserted + applied.updated
        result.conflicts += applied.conflicts
        skipped += applied.skipped
        const last = String(docs[docs.length - 1]?.['updatedAt'] ?? '')
        if (last > maxSeen) maxSeen = last
        if (docs.length < pageSize || last === since) break
        since = last
      }
      result.skipped += skipped
      // Do not move the cursor past documents we could not apply; they are retried next time.
      if (skipped === 0 && maxSeen > cursor) await local.setCursor(table, maxSeen)
    } catch (error) {
      fail(table, error)
    }
  }

  for (let round = 0; round < 50; round++) {
    const dirty = await local.getDirty(pageSize, failedTables)
    if (dirty.length === 0) break
    for (const table of SYNC_TABLES) {
      const docs = dirty.filter((d) => d.table === table).map((d) => d.doc)
      if (docs.length === 0) continue
      try {
        await remote.push(table, docs)
        await local.markClean(docs.map((d) => ({ table, id: String(d['id']), updatedAt: String(d['updatedAt']) })))
        result.pushed += docs.length
      } catch (error) {
        fail(table, error)
      }
    }
  }
  if (firstError !== null) throw firstError
  return result
}

const NETWORK_CODES = new Set(['unavailable', 'deadline-exceeded', 'cancelled', 'network-request-failed', 'auth/network-request-failed'])

/** Errors that mean "cannot reach the server at all" (as opposed to one table being refused). */
export function isNetworkError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : ''
  return NETWORK_CODES.has(code.replace(/^firestore\//, ''))
}

/** Automatic retry schedule after a failed sync: 5s, 15s, 1min, then every 5min. */
export const RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 300_000] as const

export function retryDelayMs(failures: number): number {
  const i = Math.min(Math.max(failures - 1, 0), RETRY_DELAYS_MS.length - 1)
  return RETRY_DELAYS_MS[i] as number
}
