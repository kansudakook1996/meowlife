import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOC_SCHEMAS, docToRow, rowToDoc } from '@shared/syncModel'
import { openMemoryDatabase, type Db } from './connection'
import { getDirty } from './syncRepo'
import { createTransaction, listMonth, reorderTransactions } from './transactionRepo'

const TODAY = '2026-10-29'
let db: Db

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-29T08:00:00.000Z'))
  db = openMemoryDatabase()
})
afterEach(() => vi.useRealTimers())

const add = (title: string, txnDate = '2026-10-10') =>
  createTransaction(db, { kind: 'expense', title, amountSatang: 100, categoryId: null, paymentMethodId: null, txnDate, dueDate: null, isPaid: true, note: '' }, TODAY)

describe('importance order of ledger items', () => {
  it('stores the order the user chose, keeps it across reads, and ignores unknown ids', () => {
    const a = add('a')
    const b = add('b')
    const c = add('c')
    expect(listMonth(db, '2026-10', TODAY).every((t) => t.priorityOrder === null)).toBe(true) // nothing ordered yet
    expect(reorderTransactions(db, [c.id, a.id, b.id, crypto.randomUUID()])).toBe(3)
    const byId = Object.fromEntries(listMonth(db, '2026-10', TODAY).map((t) => [t.title, t.priorityOrder]))
    expect(byId).toEqual({ c: 0, a: 1, b: 2 })
    expect(reorderTransactions(db, [c.id, a.id, b.id])).toBe(0) // same order again changes nothing
    expect(reorderTransactions(db, [a.id, c.id, b.id])).toBe(2) // only the two that moved
  })

  it('marks moved rows dirty so the order syncs, and does not touch deleted rows', () => {
    const a = add('a')
    const b = add('b')
    db.exec('UPDATE transactions SET dirty = 0')
    reorderTransactions(db, [b.id, a.id])
    const docs = getDirty(db, 50).filter((d) => d.table === 'transactions')
    expect(docs.map((d) => [d.doc['id'], d.doc['priorityOrder']]).sort()).toEqual([[a.id, 1], [b.id, 0]].sort())
    db.prepare('UPDATE transactions SET deleted_at = ? WHERE id = ?').run('2026-10-29T09:00:00.000Z', a.id)
    expect(reorderTransactions(db, [a.id, b.id])).toBe(1) // b moved to 1; a is deleted and ignored
  })
})

describe('documents written by older versions still sync', () => {
  const stamp = '2026-10-01T00:00:00.000Z'
  const base = { id: crypto.randomUUID(), createdAt: stamp, updatedAt: stamp, deletedAt: null }

  it('a card charge from before the partner share existed reads as "all ours"', () => {
    const old = { ...base, cardId: crypto.randomUUID(), chargeDate: '2026-10-05', title: 'x', category: '', amountSatang: 100, note: '', billMonth: '2026-10' }
    expect(DOC_SCHEMAS.card_charges.safeParse(old).success).toBe(true)
    expect(docToRow('card_charges', old)['partner_satang']).toBe(0)
  })

  it('a ledger item from before the importance order existed has no position', () => {
    const old = { ...base, kind: 'expense', title: 'x', amountSatang: 100, categoryId: null, paymentMethodId: null, txnDate: '2026-10-05', dueDate: null, isPaid: 1, paidDate: '2026-10-05', note: '', recurringRuleId: null, recurringPeriod: null }
    expect(DOC_SCHEMAS.transactions.safeParse(old).success).toBe(true)
    expect(docToRow('transactions', old)['priority_order']).toBeNull()
    const row = { id: base.id, priority_order: 3 }
    expect(rowToDoc('transactions', row)['priorityOrder']).toBe(3)
  })
})
