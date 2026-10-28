import { beforeEach, describe, expect, it } from 'vitest'
import { TransactionInputSchema, type RecurringInput, type TransactionInput } from '@shared/schemas'
import { summarizeMonth } from '@shared/summary'
import { listCategories, listPaymentMethods } from './catalogRepo'
import { openMemoryDatabase, type Db } from './connection'
import { DEFAULT_CATEGORIES } from './defaults'
import { getSchemaVersion, LATEST_SCHEMA_VERSION, migrate } from './migrations'
import {
  createRecurring,
  ensureRecurringForMonth,
  listRecurring,
  removeRecurring,
  updateRecurring
} from './recurringRepo'
import {
  createTransaction,
  listMonth,
  listTransactions,
  removeTransaction,
  restoreTransaction,
  setPaid,
  updateTransaction
} from './transactionRepo'

const TODAY = '2026-10-28'
const FOOD = DEFAULT_CATEGORIES[0]!.id
const SALARY = DEFAULT_CATEGORIES.find((c) => c.name === 'เงินเดือน')!.id

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

function rule(overrides: Partial<RecurringInput> = {}): RecurringInput {
  return {
    kind: 'expense',
    title: 'ค่าเช่าห้อง',
    amountSatang: 450000,
    categoryId: null,
    paymentMethodId: null,
    dayOfMonth: 31,
    startMonth: '2026-10',
    endMonth: null,
    note: '',
    isActive: true,
    ...overrides
  }
}

let db: Db
beforeEach(() => {
  db = openMemoryDatabase()
})

describe('migrations', () => {
  it('creates schema at latest version and is re-runnable', () => {
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION)
    migrate(db)
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION)
  })

  it('seeds categories and payment methods but no transactions', () => {
    expect(listCategories(db)).toHaveLength(DEFAULT_CATEGORIES.length)
    expect(listPaymentMethods(db).length).toBeGreaterThan(0)
    expect(listMonth(db, '2026-10', TODAY)).toHaveLength(0)
  })

  it('refuses a database from a newer app version', () => {
    db.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 1}`)
    expect(() => migrate(db)).toThrow(/newer/)
  })
})

describe('transactions', () => {
  it('creates, updates and lists by month', () => {
    const a = createTransaction(db, tx(), TODAY)
    createTransaction(db, tx({ txnDate: '2026-11-01', title: 'พฤศจิกา' }), TODAY)
    createTransaction(db, tx({ txnDate: '2026-09-30', title: 'กันยา' }), TODAY)
    expect(a.categoryName).toBe('อาหาร')
    expect(listMonth(db, '2026-10', TODAY).map((t) => t.title)).toEqual(['ข้าวมันไก่'])

    const updated = updateTransaction(db, a.id, tx({ title: 'ข้าวผัด', amountSatang: 6050 }), TODAY)
    expect(updated.title).toBe('ข้าวผัด')
    expect(updated.amountSatang).toBe(6050)
  })

  it('tracks paid date when status changes', () => {
    const bill = createTransaction(db, tx({ isPaid: false, dueDate: '2026-10-30' }), TODAY)
    expect(bill.status).toBe('due_soon')
    expect(bill.paidDate).toBeNull()
    const paid = setPaid(db, bill.id, true, TODAY)
    expect(paid.status).toBe('paid')
    expect(paid.paidDate).toBe(TODAY)
    const back = setPaid(db, bill.id, false, TODAY)
    expect(back.paidDate).toBeNull()
    expect(back.status).toBe('due_soon')
  })

  it('soft deletes and restores', () => {
    const a = createTransaction(db, tx(), TODAY)
    removeTransaction(db, a.id)
    expect(listMonth(db, '2026-10', TODAY)).toHaveLength(0)
    expect(() => removeTransaction(db, a.id)).toThrow()
    restoreTransaction(db, a.id)
    expect(listMonth(db, '2026-10', TODAY)).toHaveLength(1)
  })

  it('rejects unknown category ids', () => {
    expect(() => createTransaction(db, tx({ categoryId: 'b0000000-0000-4000-8000-000000000999' }), TODAY)).toThrow(
      /หมวดหมู่/
    )
  })

  it('filters by kind, status and search text', () => {
    createTransaction(db, tx({ title: 'ข้าวมันไก่' }), TODAY)
    createTransaction(db, tx({ title: 'ค่าไฟ', categoryId: null, isPaid: false, dueDate: '2026-10-20' }), TODAY)
    createTransaction(db, tx({ kind: 'income', title: 'เงินเดือน', categoryId: SALARY, amountSatang: 3000000 }), TODAY)
    const q = { month: '2026-10' }
    expect(listTransactions(db, { ...q, kind: 'income' }, TODAY)).toHaveLength(1)
    expect(listTransactions(db, { ...q, status: 'overdue' }, TODAY).map((t) => t.title)).toEqual(['ค่าไฟ'])
    expect(listTransactions(db, { ...q, status: 'not_paid' }, TODAY)).toHaveLength(1)
    expect(listTransactions(db, { ...q, search: 'ข้าว' }, TODAY)).toHaveLength(1)
    expect(listTransactions(db, { ...q, search: 'อาหาร' }, TODAY)).toHaveLength(1)
  })
})

describe('monthly summary', () => {
  it('computes totals in satang exactly', () => {
    createTransaction(db, tx({ kind: 'income', title: 'เงินเดือน', categoryId: SALARY, amountSatang: 2500000 }), TODAY)
    createTransaction(db, tx({ kind: 'income', title: 'ขายของ', categoryId: null, amountSatang: 10, isPaid: false }), TODAY)
    createTransaction(db, tx({ amountSatang: 10 }), TODAY)
    createTransaction(db, tx({ amountSatang: 20 }), TODAY)
    createTransaction(db, tx({ title: 'ค่าไฟ', categoryId: null, amountSatang: 123456, isPaid: false, dueDate: '2026-10-01' }), TODAY)
    createTransaction(db, tx({ title: 'ค่าเน็ต', categoryId: null, amountSatang: 59900, isPaid: false, dueDate: '2026-10-29' }), TODAY)

    const s = summarizeMonth('2026-10', listMonth(db, '2026-10', TODAY))
    expect(s.incomeTotal).toBe(2500010)
    expect(s.incomeReceived).toBe(2500000)
    expect(s.expenseTotal).toBe(10 + 20 + 123456 + 59900)
    expect(s.expensePaid).toBe(30)
    expect(s.outstanding).toBe(123456 + 59900)
    expect(s.balance).toBe(2500010 - (10 + 20 + 123456 + 59900))
    expect(s.overdueCount).toBe(1)
    expect(s.dueSoonCount).toBe(1)
    expect(s.expenseByCategory[0]).toMatchObject({ name: 'ไม่ระบุหมวด', totalSatang: 183356 })
    expect(s.expenseByCategory[1]).toMatchObject({ name: 'อาหาร', totalSatang: 30 })
  })

  it('handles a negative balance', () => {
    createTransaction(db, tx({ amountSatang: 100 }), TODAY)
    expect(summarizeMonth('2026-10', listMonth(db, '2026-10', TODAY)).balance).toBe(-100)
  })
})

describe('recurring rules', () => {
  it('generates one item per month, idempotently, clamped to month end', () => {
    createRecurring(db, rule())
    expect(ensureRecurringForMonth(db, '2026-11')).toBe(1)
    expect(ensureRecurringForMonth(db, '2026-11')).toBe(0)
    const nov = listMonth(db, '2026-11', TODAY)
    expect(nov).toHaveLength(1)
    expect(nov[0]).toMatchObject({ txnDate: '2026-11-30', dueDate: '2026-11-30', isPaid: false })
    ensureRecurringForMonth(db, '2027-02')
    expect(listMonth(db, '2027-02', TODAY)[0]?.txnDate).toBe('2027-02-28')
  })

  it('respects start/end month and active flag', () => {
    createRecurring(db, rule({ startMonth: '2026-11', endMonth: '2026-12' }))
    createRecurring(db, rule({ title: 'ปิดไว้', isActive: false }))
    expect(ensureRecurringForMonth(db, '2026-10')).toBe(0)
    expect(ensureRecurringForMonth(db, '2026-12')).toBe(1)
    expect(ensureRecurringForMonth(db, '2027-01')).toBe(0)
  })

  it('does not bring back an item the user deleted', () => {
    createRecurring(db, rule())
    ensureRecurringForMonth(db, '2026-10')
    const item = listMonth(db, '2026-10', TODAY)[0]!
    removeTransaction(db, item.id)
    expect(ensureRecurringForMonth(db, '2026-10')).toBe(0)
    expect(listMonth(db, '2026-10', TODAY)).toHaveLength(0)
  })

  it('updating a rule changes future unpaid items but keeps paid history', () => {
    const r = createRecurring(db, rule({ dayOfMonth: 5 }))
    ensureRecurringForMonth(db, '2026-10') // 2026-10-05: before TODAY
    ensureRecurringForMonth(db, '2026-11') // 2026-11-05: future
    updateRecurring(db, r.id, rule({ dayOfMonth: 10, amountSatang: 500000 }), TODAY)
    expect(listMonth(db, '2026-10', TODAY)[0]).toMatchObject({ amountSatang: 450000, txnDate: '2026-10-05' })
    expect(listMonth(db, '2026-11', TODAY)[0]).toMatchObject({ amountSatang: 500000, txnDate: '2026-11-10' })
  })

  it('removing a rule removes only future unpaid items', () => {
    const r = createRecurring(db, rule({ dayOfMonth: 5 }))
    ensureRecurringForMonth(db, '2026-10')
    ensureRecurringForMonth(db, '2026-11')
    removeRecurring(db, r.id, TODAY)
    expect(listRecurring(db)).toHaveLength(0)
    expect(listMonth(db, '2026-10', TODAY)).toHaveLength(1)
    expect(listMonth(db, '2026-11', TODAY)).toHaveLength(0)
    expect(ensureRecurringForMonth(db, '2026-12')).toBe(0)
  })
})

describe('input validation', () => {
  it('rejects bad payloads before they reach SQL', () => {
    expect(TransactionInputSchema.safeParse(tx({ amountSatang: 0 })).success).toBe(false)
    expect(TransactionInputSchema.safeParse(tx({ amountSatang: 1.5 })).success).toBe(false)
    expect(TransactionInputSchema.safeParse(tx({ txnDate: '2026-02-30' })).success).toBe(false)
    expect(TransactionInputSchema.safeParse(tx({ title: '   ' })).success).toBe(false)
    expect(TransactionInputSchema.safeParse({ ...tx(), extra: 'x' }).success).toBe(false)
    expect(TransactionInputSchema.safeParse(tx()).success).toBe(true)
  })
})
