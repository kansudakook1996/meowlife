import {
  collection,
  doc,
  getDocsFromServer,
  limit as limitTo,
  orderBy,
  query,
  where,
  writeBatch,
  type Firestore
} from 'firebase/firestore'
import type { SyncRemote } from '@shared/syncEngine'
import type { SyncDoc } from '@shared/syncModel'

const NETWORK_TIMEOUT_MS = 20_000
const PUSH_CHUNK = 400 // Firestore allows 500 writes per batch

/** Offline Firestore calls can wait forever; turn that into an error so sync can retry later. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject({ code: 'deadline-exceeded' }), ms)
    work.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

/**
 * Firestore side of the sync: users/{uid}/{table}/{id}. Security Rules restrict it to the owner.
 * Kept free of app state so tests can run it against the Firestore emulator.
 */
export function createRemote(db: Firestore, uid: string, timeoutMs: number = NETWORK_TIMEOUT_MS): SyncRemote {
  return {
    async pull(table, sinceIso, limit) {
      const q = query(collection(db, 'users', uid, table), where('updatedAt', '>=', sinceIso), orderBy('updatedAt'), limitTo(limit))
      const snap = await withTimeout(getDocsFromServer(q), timeoutMs)
      return snap.docs.map((d) => d.data() as SyncDoc)
    },
    async push(table, docs) {
      for (let i = 0; i < docs.length; i += PUSH_CHUNK) {
        const batch = writeBatch(db)
        for (const d of docs.slice(i, i + PUSH_CHUNK)) batch.set(doc(db, 'users', uid, table, String(d['id'])), d)
        await withTimeout(batch.commit(), timeoutMs)
      }
    }
  }
}
