import { beforeEach, describe, expect, it } from 'vitest'
import { parseCsv } from '@shared/csv'
import { transactionsToCsv } from '@shared/exportCsv'
import { buildImportRows, guessMapping } from '@shared/importMap'
import type { TransactionInput } from '@shared/schemas'
import {
  createCategory,
  createPaymentMethod,
  deleteCategory,
  deletePaymentMethod,
  listCategories,
  listPaymentMethods,
  updateCategory,
  updatePaymentMethod
} from './catalogRepo'
import { openMemoryDatabase, type Db } from './connection'
import { DEFAULT_CATEGORIES } from './defaults'
import { commitImport, existingKeys, missingCatalog } from './importRepo'
import { countDirty } from './syncRepo'
import { createTransaction, listAllTransactions, listMonth, monthlyTotals } from './transactionRepo'

const TODAY = '2026-10-28'
const FOOD = DEFAULT_CATEGORIES[0]!.id
let db: Db

function tx(over: Partial<TransactionInput> = {}): TransactionInput {
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
    ...over
  }
}

beforeEach(() => {
  db = openMemoryDatabase()
})

describe('categories and payment methods', () => {
  it('renames, and deleting detaches items instead of losing them', () => {
    const cat = createCategory(db, { kind: 'expense', name: 'งานอดิเรก', icon: '🎨' })
    const t = createTransaction(db, tx({ categoryId: cat.id }), TODAY)
    expect(updateCategory(db, cat.id, { kind: 'expense', name: 'งานฝีมือ', icon: '🧶' })).toMatchObject({ name: 'งานฝีมือ', icon: '🧶' })

    const result = deleteCategory(db, cat.id)
    expect(result.detached).toBe(1)
    expect(listCategories(db).some((c) => c.id === cat.id)).toBe(false)
    expect(listMonth(db, '2026-10', TODAY).find((x) => x.id === t.id)).toMatchObject({ categoryId: null })
    expect(() => deleteCategory(db, cat.id)).toThrow(/ไม่พบ/)
  })

  it('manages payment methods the same way', () => {
    const m = createPaymentMethod(db, 'บัตร KTC')
    createTransaction(db, tx({ paymentMethodId: m.id }), TODAY)
    expect(updatePaymentMethod(db, m.id, 'KTC Visa').name).toBe('KTC Visa')
    expect(deletePaymentMethod(db, m.id).detached).toBe(1)
    expect(listPaymentMethods(db).some((x) => x.id === m.id)).toBe(false)
  })
})

describe('export → import round trip', () => {
  it('re-importing an exported file into an empty database restores the same items', () => {
    const m = createPaymentMethod(db, 'โอนธนาคาร X')
    createTransaction(db, tx({ title: 'ค่าไฟ', amountSatang: 123456, isPaid: false, dueDate: '2026-10-25', paymentMethodId: m.id, note: 'มี, จุลภาค "และ" คำพูด' }), TODAY)
    createTransaction(db, tx({ kind: 'income', title: 'เงินเดือน', amountSatang: 2500000, categoryId: DEFAULT_CATEGORIES.find((c) => c.name === 'เงินเดือน')!.id }), TODAY)
    createTransaction(db, tx({ title: '=HYPERLINK("http://evil")', amountSatang: 100 }), TODAY)

    const csv = transactionsToCsv(listAllTransactions(db, TODAY))
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain("'=HYPERLINK") // formula neutralised for Excel

    const fresh = openMemoryDatabase()
    const cells = parseCsv(csv)
    const built = buildImportRows(cells, guessMapping(cells[0] as string[]), { existingKeys: existingKeys(fresh), maxDate: '2030-12-31' })
    expect(built.errors).toEqual([])
    expect(built.valid).toHaveLength(3)
    expect(missingCatalog(fresh, built.valid).methods).toEqual(['โอนธนาคาร X'])

    const result = commitImport(fresh, built.valid, true, TODAY)
    expect(result).toMatchObject({ imported: 3, createdMethods: 1, createdCategories: 0 })
    const items = listMonth(fresh, '2026-10', TODAY)
    const bill = items.find((i) => i.title === 'ค่าไฟ')!
    expect(bill).toMatchObject({ amountSatang: 123456, isPaid: false, dueDate: '2026-10-25', categoryName: 'อาหาร', paymentMethodName: 'โอนธนาคาร X', note: 'มี, จุลภาค "และ" คำพูด' })
    expect(items.find((i) => i.kind === 'income')).toMatchObject({ amountSatang: 2500000, categoryName: 'เงินเดือน' })
  })

  it('importing the same file twice flags everything as duplicates', () => {
    createTransaction(db, tx(), TODAY)
    const cells = parseCsv(transactionsToCsv(listAllTransactions(db, TODAY)))
    const built = buildImportRows(cells, guessMapping(cells[0] as string[]), { existingKeys: existingKeys(db), maxDate: '2030-12-31' })
    expect(built.valid).toHaveLength(0)
    expect(built.duplicates).toHaveLength(1)
  })

  it('creates missing categories only when asked', () => {
    const cells = [
      ['วันที่', 'รายการ', 'จำนวนเงิน', 'ประเภท', 'หมวดหมู่'],
      ['2026-10-01', 'ค่าเลี้ยงแมว', '300', 'รายจ่าย', 'สัตว์เลี้ยง'],
      ['2026-10-02', 'กาแฟ', '60', 'รายจ่าย', 'อาหาร']
    ]
    const built = buildImportRows(cells, guessMapping(cells[0] as string[]), { existingKeys: new Set(), maxDate: '2030-12-31' })
    const without = commitImport(openMemoryDatabase(), built.valid, false, TODAY)
    expect(without.createdCategories).toBe(0)
    const withNew = commitImport(db, built.valid, true, TODAY)
    expect(withNew.createdCategories).toBe(1)
    expect(listCategories(db).some((c) => c.name === 'สัตว์เลี้ยง')).toBe(true)
    expect(listMonth(db, '2026-10', TODAY).find((i) => i.title === 'กาแฟ')?.categoryName).toBe('อาหาร')
    expect(countDirty(db)).toBeGreaterThan(0)
  })
})

describe('monthlyTotals', () => {
  it('sums income and expense per month and fills empty months', () => {
    createTransaction(db, tx({ txnDate: '2026-08-05', amountSatang: 1000 }), TODAY)
    createTransaction(db, tx({ txnDate: '2026-10-05', amountSatang: 2000 }), TODAY)
    createTransaction(db, tx({ txnDate: '2026-10-06', amountSatang: 500 }), TODAY)
    createTransaction(db, tx({ kind: 'income', txnDate: '2026-10-07', amountSatang: 9000 }), TODAY)
    createTransaction(db, tx({ txnDate: '2026-07-31', amountSatang: 7777 }), TODAY) // outside the 3-month window
    const rows = monthlyTotals(db, '2026-10', 3)
    expect(rows.map((r) => [r.month, r.expenseTotal, r.incomeTotal])).toEqual([
      ['2026-08', 1000, 0],
      ['2026-09', 0, 0],
      ['2026-10', 2500, 9000]
    ])
  })
})
