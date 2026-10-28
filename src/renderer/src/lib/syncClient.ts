import type { SyncLocal } from '@shared/syncEngine'
import { meow, unwrap } from './api'

/** The local half of the sync engine, backed by the main process (SQLite) over IPC. */
export const syncLocal: SyncLocal = {
  bind: (uid) => unwrap(meow().sync.bind(uid)),
  getCursor: (table) => unwrap(meow().sync.getCursor(table)),
  setCursor: (table, value) => unwrap(meow().sync.setCursor(table, value)),
  getDirty: (limit) => unwrap(meow().sync.getDirty(limit)),
  markClean: (items) => unwrap(meow().sync.markClean(items)),
  applyRemote: (table, docs) => unwrap(meow().sync.applyRemote(table, docs))
}
