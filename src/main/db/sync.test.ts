import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TransactionInput } from '@shared/schemas'
import { retryDelayMs, runSync, type SyncLocal, type SyncRemote } from '@shared/syncEngine'
import { DOC_SCHEMAS, docToRow, rowToDoc, type SyncDoc, type SyncTable } from '@shared/syncModel'
import { openMemoryDatabase, type Db } from './connection'
import { DEFAULT_CATEGORIES } from './defaults'
import { createRecurring, ensureRecurringForMonth } from './recurringRepo'
import {
  applyRemote,
  bindOwner,
  countConflicts,
  countDirty,
  getDirty,
  getState,
  listConflicts,
  markClean,
  resolveConflict,
  setState
} from './syncRepo'
import { createTransaction, listMonth, removeTransaction, setPaid, updateTransaction } from './transactionRepo'

const FOOD = DEFAULT_CATEGORIES[0]!.id
const UID = 'user-a'
const MONTH = '2026-10'

function localFor(db: Db): SyncLocal {
  return {
    bind: async (uid) => bindOwner(db, uid),
    getCursor: async (t) => getState(db, `cursor:${t}`) ?? '',
    setCursor: async (t, v) => setState(db, `cursor:${t}`, v),
    getDirty: async (l) => getDirty(db, l),
    markClean: async (items) => markClean(db, items),
    applyRemote: async (t, docs) => applyRemote(db, t, docs)
  }
}

/** In-memory stand-in for Firestore users/{uid}/... with a switch for "offline". */
class FakeRemote implements SyncRemote {
  store = new Map<SyncTable, Map<string, SyncDoc>>()
  offline = false
  pushes = 0

  private table(t: SyncTable): Map<string, SyncDoc> {
    let m = this.store.get(t)
    if (!m) this.store.set(t, (m = new Map()))
    return m
  }
  private check(): void {
    if (this.offline) throw Object.assign(new Error('offline'), { code: 'unavailable' })
  }
  async pull(table: SyncTable, since: string, limit: number): Promise<SyncDoc[]> {
    this.check()
    return [...this.table(table).values()]
      .filter((d) => String(d['updatedAt']) >= since)
      .sort((a, b) => String(a['updatedAt']).localeCompare(String(b['updatedAt'])))
      .slice(0, limit)
      .map((d) => ({ ...d }))
  }
  async push(table: SyncTable, docs: SyncDoc[]): Promise<void> {
    this.check()
    this.pushes += docs.length
    for (const d of docs) this.table(table).set(String(d['id']), { ...d })
  }
}

const sync = (db: Db, remote: FakeRemote, uid = UID): ReturnType<typeof runSync> => runSync(localFor(db), remote, uid)

function tx(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    kind: 'expense',
    title: 'ข้าวมันไก่',
    amountSatang: 5000,
    categoryId: FOOD,
    paymentMethodId: null,
    txnDate: '2026-10-10',
    dueDate: null,
    isPaid: true,
    note: '',
    ...overrides
  }
}

const at = (iso: string): void => {
  vi.setSystemTime(new Date(iso))
}
const TODAY = '2026-10-28'

let a: Db
let b: Db
let remote: FakeRemote

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at('2026-10-28T08:00:00.000Z')
  a = openMemoryDatabase()
  b = openMemoryDatabase()
  remote = new FakeRemote()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('two devices', () => {
  it('a new item on device A appears on device B and is not pushed back', async () => {
    createTransaction(a, tx(), TODAY)
    const first = await sync(a, remote)
    expect(first.pushed).toBe(1)
    expect(countDirty(a)).toBe(0)

    const second = await sync(b, remote)
    expect(second.changed).toBe(1)
    expect(second.pushed).toBe(0)
    expect(listMonth(b, MONTH, TODAY).map((t) => t.title)).toEqual(['ข้าวมันไก่'])
    expect(countDirty(b)).toBe(0)
  })

  it('edits and soft deletes propagate', async () => {
    const t = createTransaction(a, tx(), TODAY)
    await sync(a, remote)
    await sync(b, remote)

    at('2026-10-28T09:00:00.000Z')
    updateTransaction(a, t.id, tx({ title: 'แก้แล้ว', amountSatang: 6050 }), TODAY)
    await sync(a, remote)
    await sync(b, remote)
    expect(listMonth(b, MONTH, TODAY)[0]).toMatchObject({ title: 'แก้แล้ว', amountSatang: 6050 })

    at('2026-10-28T10:00:00.000Z')
    removeTransaction(b, t.id)
    await sync(b, remote)
    await sync(a, remote)
    expect(listMonth(a, MONTH, TODAY)).toHaveLength(0)
  })

  it('works offline, then uploads when online again, and retries cleanly', async () => {
    remote.offline = true
    createTransaction(a, tx({ title: 'ทำตอนออฟไลน์' }), TODAY)
    await expect(sync(a, remote)).rejects.toMatchObject({ code: 'unavailable' })
    expect(countDirty(a)).toBe(1)

    remote.offline = false
    const result = await sync(a, remote)
    expect(result.pushed).toBe(1)
    expect(countDirty(a)).toBe(0)
    expect(remote.store.get('transactions')?.size).toBe(1)

    await sync(b, remote)
    expect(listMonth(b, MONTH, TODAY)[0]?.title).toBe('ทำตอนออฟไลน์')
  })

  it('an edit made while a push is in flight stays dirty', () => {
    const t = createTransaction(a, tx(), TODAY)
    const pushedDoc = getDirty(a, 10).find((d) => d.doc['id'] === t.id)!.doc
    at('2026-10-28T08:00:05.000Z')
    updateTransaction(a, t.id, tx({ title: 'แก้ระหว่างส่ง' }), TODAY)
    markClean(a, [{ table: 'transactions', id: t.id, updatedAt: String(pushedDoc['updatedAt']) }])
    expect(countDirty(a)).toBe(1)
  })
})

describe('conflicts', () => {
  async function setup(): Promise<string> {
    const t = createTransaction(a, tx({ title: 'ต้นฉบับ' }), TODAY)
    await sync(a, remote)
    await sync(b, remote)
    return t.id
  }

  it('newer local edit wins, the other version is kept, and "use the other" restores it everywhere', async () => {
    const id = await setup()
    at('2026-10-28T09:00:00.000Z')
    updateTransaction(a, id, tx({ title: 'แก้จาก A' }), TODAY)
    at('2026-10-28T09:30:00.000Z')
    updateTransaction(b, id, tx({ title: 'แก้จาก B' }), TODAY)

    await sync(a, remote) // A pushes first
    const onB = await sync(b, remote)
    expect(onB.conflicts).toBe(1)
    expect(listMonth(b, MONTH, TODAY)[0]?.title).toBe('แก้จาก B')
    const [conflict] = listConflicts(b)
    expect(conflict).toMatchObject({ winner: 'local', title: 'แก้จาก B' })

    await sync(a, remote)
    expect(listMonth(a, MONTH, TODAY)[0]?.title).toBe('แก้จาก B')

    at('2026-10-28T11:00:00.000Z')
    resolveConflict(b, conflict!.id, 'useOther')
    expect(listMonth(b, MONTH, TODAY)[0]?.title).toBe('แก้จาก A')
    expect(countConflicts(b)).toBe(0)
    await sync(b, remote)
    await sync(a, remote)
    expect(listMonth(a, MONTH, TODAY)[0]?.title).toBe('แก้จาก A')
  })

  it('newer remote edit wins over an older unsent local edit, and the local one is kept', async () => {
    const id = await setup()
    at('2026-10-28T09:00:00.000Z')
    updateTransaction(b, id, tx({ title: 'แก้จาก B (เก่า)' }), TODAY)
    at('2026-10-28T09:30:00.000Z')
    updateTransaction(a, id, tx({ title: 'แก้จาก A (ใหม่)' }), TODAY)

    await sync(a, remote)
    const onB = await sync(b, remote)
    expect(onB.conflicts).toBe(1)
    expect(listMonth(b, MONTH, TODAY)[0]?.title).toBe('แก้จาก A (ใหม่)')
    expect(listConflicts(b)[0]).toMatchObject({ winner: 'remote', title: 'แก้จาก B (เก่า)' })
    expect(countDirty(b)).toBe(0)

    resolveConflict(b, listConflicts(b)[0]!.id, 'ack')
    expect(countConflicts(b)).toBe(0)
  })

  it('syncing again without new edits creates no new conflicts', async () => {
    const id = await setup()
    at('2026-10-28T09:00:00.000Z')
    updateTransaction(a, id, tx({ title: 'A' }), TODAY)
    at('2026-10-28T09:10:00.000Z')
    updateTransaction(b, id, tx({ title: 'B' }), TODAY)
    await sync(a, remote)
    await sync(b, remote)
    for (let i = 0; i < 3; i++) {
      await sync(a, remote)
      await sync(b, remote)
    }
    expect(countConflicts(b)).toBe(1)
    expect(countConflicts(a)).toBe(0)
  })
})

describe('recurring items on two devices', () => {
  it('are generated once, and a payment made on one device wins over the untouched copy on the other', async () => {
    const rule = createRecurring(a, {
      kind: 'expense',
      title: 'ค่าเช่าห้อง',
      amountSatang: 450000,
      categoryId: null,
      paymentMethodId: null,
      dayOfMonth: 5,
      startMonth: '2026-10',
      endMonth: null,
      note: '',
      isActive: true
    })
    await sync(a, remote)
    await sync(b, remote)
    ensureRecurringForMonth(a, '2026-11')
    ensureRecurringForMonth(b, '2026-11')
    expect(rule.id).toBeTruthy()

    at('2026-10-28T12:00:00.000Z')
    setPaid(a, listMonth(a, '2026-11', TODAY)[0]!.id, true, TODAY)
    await sync(a, remote)
    const onB = await sync(b, remote)

    expect(onB.conflicts).toBe(0)
    const items = listMonth(b, '2026-11', TODAY)
    expect(items).toHaveLength(1)
    expect(items[0]?.isPaid).toBe(true)
    await sync(a, remote)
    const docs = [...(remote.store.get('transactions')?.values() ?? [])].filter((d) => d['recurringPeriod'] === '2026-11')
    expect(docs).toHaveLength(1)
  })
})

describe('safety', () => {
  it('refuses to sync a database that belongs to another account', async () => {
    createTransaction(a, tx(), TODAY)
    await sync(a, remote, 'user-a')
    const result = await sync(a, remote, 'user-b')
    expect(result.status).toBe('owner-mismatch')
    expect(remote.pushes).toBe(1)
  })

  it('skips invalid remote documents, reports them, and does not move the cursor past them', async () => {
    remote.store.set(
      'transactions',
      new Map<string, SyncDoc>([
        ['bad', { id: 'bad', updatedAt: '2026-10-28T09:00:00.000Z', title: 'x' }],
        ['inject', { ...validTxDoc('11111111-1111-4111-8111-111111111111'), evil: "'); DROP TABLE transactions;--" }]
      ])
    )
    const result = await sync(a, remote)
    expect(result.skipped).toBe(2)
    expect(getState(a, 'cursor:transactions')).toBeNull()
    expect(listMonth(a, MONTH, TODAY)).toHaveLength(0)
  })

  it('applies a valid remote document and rejects out-of-range values', () => {
    const good = validTxDoc('22222222-2222-4222-8222-222222222222')
    const bad = { ...validTxDoc('33333333-3333-4333-8333-333333333333'), amountSatang: -5 }
    const result = applyRemote(a, 'transactions', [good, bad])
    expect(result).toMatchObject({ inserted: 1, skipped: 1 })
  })
})

describe('model + retry', () => {
  it('rowToDoc/docToRow round trip with camelCase fields', () => {
    const t = createTransaction(a, tx({ note: 'หมายเหตุ' }), TODAY)
    const row = a.prepare('SELECT * FROM transactions WHERE id = ?').get(t.id) as Record<string, unknown>
    const doc = rowToDoc('transactions', row)
    expect(doc).toMatchObject({ id: t.id, amountSatang: 5000, isPaid: 1, txnDate: '2026-10-10', note: 'หมายเหตุ' })
    expect(DOC_SCHEMAS.transactions.safeParse(doc).success).toBe(true)
    expect(docToRow('transactions', doc)['amount_satang']).toBe(5000)
    expect(Object.keys(doc)).not.toContain('dirty')
  })

  it('retry backoff: 5s, 15s, 1min, then every 5min', () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelayMs)).toEqual([5000, 15000, 60000, 300000, 300000, 300000])
  })
})

function validTxDoc(id: string): SyncDoc {
  return {
    id,
    createdAt: '2026-10-28T08:00:00.000Z',
    updatedAt: '2026-10-28T09:00:00.000Z',
    deletedAt: null,
    kind: 'expense',
    title: 'ไกลบ้าน',
    amountSatang: 1000,
    categoryId: null,
    paymentMethodId: null,
    txnDate: '2026-10-10',
    dueDate: null,
    isPaid: 0,
    paidDate: null,
    note: '',
    recurringRuleId: null,
    recurringPeriod: null
  }
}
