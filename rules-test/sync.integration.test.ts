import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, getDocs } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { openMemoryDatabase, type Db } from '../src/main/db/connection'
import { DEFAULT_CATEGORIES } from '../src/main/db/defaults'
import { createRecurring, ensureRecurringForMonth } from '../src/main/db/recurringRepo'
import { applyRemote, bindOwner, countConflicts, countDirty, getDirty, getState, markClean, setState } from '../src/main/db/syncRepo'
import { createTransaction, listMonth, removeTransaction, setPaid, updateTransaction } from '../src/main/db/transactionRepo'
import { createRemote } from '../src/renderer/src/lib/firestoreRemote'
import type { TransactionInput } from '../src/shared/schemas'
import { runSync, type SyncLocal } from '../src/shared/syncEngine'

/**
 * The real sync path end to end, minus the network and sign-in: two SQLite "devices" + the real
 * Firestore queries/batches (createRemote) + the real firestore.rules, all on the Firestore emulator.
 */
let env: RulesTestEnvironment
let a: Db
let b: Db

const UID = 'alice-uid'
const TODAY = '2026-10-28'
const FOOD = DEFAULT_CATEGORIES[0]!.id

const localFor = (db: Db): SyncLocal => ({
  bind: async (uid) => bindOwner(db, uid),
  getCursor: async (t) => getState(db, `cursor:${t}`) ?? '',
  setCursor: async (t, v) => setState(db, `cursor:${t}`, v),
  getDirty: async (l) => getDirty(db, l),
  markClean: async (items) => markClean(db, items),
  applyRemote: async (t, docs) => applyRemote(db, t, docs)
})

const remote = (uid = UID) => createRemote(env.authenticatedContext(uid).firestore() as never, uid, 10_000)
const sync = (db: Db, uid = UID) => runSync(localFor(db), remote(uid), uid)

const tx = (over: Partial<TransactionInput> = {}): TransactionInput => ({
  kind: 'expense',
  title: 'ข้าวมันไก่',
  amountSatang: 5000,
  categoryId: FOOD,
  paymentMethodId: null,
  txnDate: '2026-10-10',
  dueDate: null,
  isPaid: true,
  note: '',
  ...over
})
const at = (iso: string): void => {
  vi.setSystemTime(new Date(iso))
}
const titles = (d: Db): string[] => listMonth(d, '2026-10', TODAY).map((t) => t.title).sort()

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'meowlife-sync-test',
    firestore: { rules: readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 }
  })
})
afterAll(async () => {
  vi.useRealTimers()
  await env.cleanup()
})
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at('2026-10-28T08:00:00.000Z')
  await env.clearFirestore()
  a = openMemoryDatabase()
  b = openMemoryDatabase()
})

describe('through Firestore (emulator) with the real rules', () => {
  it('A → cloud → B, edits and deletes included', async () => {
    const t = createTransaction(a, tx({ title: 'ค่าไฟ', amountSatang: 123456 }), TODAY)
    const first = await sync(a)
    expect(first).toMatchObject({ status: 'ok', pushed: 1 })
    expect(countDirty(a)).toBe(0)

    await sync(b)
    expect(titles(b)).toEqual(['ค่าไฟ'])

    at('2026-10-28T09:00:00.000Z')
    updateTransaction(b, t.id, tx({ title: 'ค่าไฟ (แก้)', amountSatang: 130000 }), TODAY)
    await sync(b)
    await sync(a)
    expect(listMonth(a, '2026-10', TODAY)[0]).toMatchObject({ title: 'ค่าไฟ (แก้)', amountSatang: 130000 })

    at('2026-10-28T10:00:00.000Z')
    removeTransaction(a, t.id)
    await sync(a)
    await sync(b)
    expect(titles(b)).toEqual([])
  })

  it('first sync uploads everything the device already had (categories, rules, items)', async () => {
    createTransaction(a, tx(), TODAY)
    createRecurring(a, { kind: 'expense', title: 'ค่าเช่า', amountSatang: 450000, categoryId: null, paymentMethodId: null, dayOfMonth: 5, startMonth: '2026-10', endMonth: null, note: '', isActive: true })
    ensureRecurringForMonth(a, '2026-10')
    a.exec('UPDATE categories SET dirty = 1; UPDATE payment_methods SET dirty = 1')
    await sync(a)

    const db = env.authenticatedContext(UID).firestore() as never
    for (const [table, min] of [['transactions', 2], ['recurring_rules', 1], ['categories', 12], ['payment_methods', 5]] as const) {
      const snap = await getDocs(collection(db, 'users', UID, table))
      expect(snap.size, table).toBeGreaterThanOrEqual(min)
    }
    await sync(b)
    expect(titles(b)).toContain('ค่าเช่า')
  })

  it('concurrent edits on two devices keep both versions and converge', async () => {
    const t = createTransaction(a, tx({ title: 'ต้นฉบับ' }), TODAY)
    await sync(a)
    await sync(b)
    at('2026-10-28T09:00:00.000Z')
    updateTransaction(a, t.id, tx({ title: 'แก้จาก A' }), TODAY)
    at('2026-10-28T09:30:00.000Z')
    updateTransaction(b, t.id, tx({ title: 'แก้จาก B' }), TODAY)
    await sync(a)
    const onB = await sync(b)
    expect(onB.conflicts).toBe(1)
    await sync(a)
    expect(titles(a)).toEqual(['แก้จาก B'])
    expect(titles(b)).toEqual(['แก้จาก B'])
    expect(countConflicts(b)).toBe(1)
    expect(countConflicts(a)).toBe(0)
  })

  it('recurring bill generated on both devices stays one document; a payment on A wins on B', async () => {
    createRecurring(a, { kind: 'expense', title: 'Netflix', amountSatang: 41900, categoryId: null, paymentMethodId: null, dayOfMonth: 12, startMonth: '2026-10', endMonth: null, note: '', isActive: true })
    await sync(a)
    await sync(b)
    ensureRecurringForMonth(a, '2026-11')
    ensureRecurringForMonth(b, '2026-11')
    at('2026-10-28T12:00:00.000Z')
    setPaid(a, listMonth(a, '2026-11', TODAY)[0]!.id, true, TODAY)
    await sync(a)
    const onB = await sync(b)
    expect(onB.conflicts).toBe(0)
    expect(listMonth(b, '2026-11', TODAY)).toHaveLength(1)
    expect(listMonth(b, '2026-11', TODAY)[0]?.isPaid).toBe(true)
    const snap = await getDocs(collection(env.authenticatedContext(UID).firestore() as never, 'users', UID, 'transactions'))
    expect(snap.docs.filter((d) => d.data()['recurringPeriod'] === '2026-11')).toHaveLength(1)
  })

  it("another account cannot sync into or out of this user's space (rules), and errors surface for retry", async () => {
    createTransaction(a, tx({ title: 'ลับเฉพาะเจ้าของ' }), TODAY)
    await sync(a)

    // Bob's device bound to Bob tries to read Alice's collection by using Alice's uid in the path.
    const bobRemote = createRemote(env.authenticatedContext('bob-uid').firestore() as never, UID, 10_000)
    await expect(bobRemote.pull('transactions', '', 10)).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(
      bobRemote.push('transactions', [{ id: 'x', updatedAt: '2026-10-28T10:00:00.000Z' }])
    ).rejects.toBeTruthy()

    // A failed sync leaves local data dirty so the next attempt retries it.
    createTransaction(b, tx({ title: 'รอส่ง' }), TODAY)
    await expect(runSync(localFor(b), bobRemote, UID)).rejects.toMatchObject({ code: 'permission-denied' })
    expect(countDirty(b)).toBeGreaterThan(0)
    await sync(b) // Alice's own credentials: now it goes through
    expect(countDirty(b)).toBe(0)
  })
})
