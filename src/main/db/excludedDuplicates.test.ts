import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findDuplicateCharges, normalizeTitle } from '@shared/cards'
import { summarizeMonth } from '@shared/summary'
import { DOC_SCHEMAS, docToRow } from '@shared/syncModel'
import { cardAnalytics } from './cardAnalytics'
import { cardsOverview, createCard, createCardRecurring, createCharge, findDuplicateChargesOf } from './cardRepo'
import { createCategory, updateCategory } from './catalogRepo'
import { openMemoryDatabase, type Db } from './connection'
import { createRecurring } from './recurringRepo'
import { createTransaction, listMonth, monthlyTotals } from './transactionRepo'

const TODAY = '2026-10-29'
let db: Db

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-29T08:00:00.000Z'))
  db = openMemoryDatabase()
})
afterEach(() => vi.useRealTimers())

const expense = (title: string, amountSatang: number, categoryId: string | null, txnDate = '2026-10-10', isPaid = true) =>
  createTransaction(db, { kind: 'expense', title, amountSatang, categoryId, paymentMethodId: null, txnDate, dueDate: null, isPaid, note: '' }, TODAY)

describe('categories that are not counted as spending', () => {
  it('leaves them out of the expense total, the by-category list, the trend and the pie — but still shows them separately', () => {
    const savings = createCategory(db, { kind: 'expense', name: 'เงินออม', icon: '🐷', excluded: true })
    const food = createCategory(db, { kind: 'expense', name: 'ข้าว', icon: '🍚' })
    expense('save', 200_000, savings.id, '2026-10-10', false)
    expense('lunch', 30_000, food.id)
    const s = summarizeMonth('2026-10', listMonth(db, '2026-10', TODAY))
    expect(s.expenseTotal).toBe(30_000)
    expect(s.excludedTotal).toBe(200_000)
    expect(s.expenseByCategory.map((c) => c.name)).toEqual(['ข้าว'])
    expect(s.balance).toBe(0 - 30_000) // no income in this test: only the counted expense is subtracted
    expect(s.outstanding).toBe(200_000) // the unpaid savings transfer is still money to pay
    expect(monthlyTotals(db, '2026-10', 1).at(-1)!.expenseTotal).toBe(30_000)
    expect(cardAnalytics(db, '2026-10', TODAY).spending.map((x) => x.name)).toEqual(['ข้าว'])
  })

  it("card charges in an excluded category stay out of the pie too; flipping the flag back counts them again", () => {
    const savings = createCategory(db, { kind: 'expense', name: 'เงินออม', icon: '🐷', excluded: true })
    const c = createCard(db, { name: 'KTC', issuer: '', statementDay: 25, dueDay: 10, limitSatang: null, isActive: true })
    createCharge(db, { cardId: c.id, chargeDate: '2026-10-05', title: 'x', category: 'เงินออม', amountSatang: 50_000, partnerSatang: 0, note: '' })
    createCharge(db, { cardId: c.id, chargeDate: '2026-10-06', title: 'y', category: 'อาหาร', amountSatang: 10_000, partnerSatang: 0, note: '' })
    expect(cardAnalytics(db, '2026-11', TODAY).spending.map((x) => x.name)).toEqual(['อาหาร'])
    updateCategory(db, savings.id, { kind: 'expense', name: 'เงินออม', icon: '🐷', excluded: false })
    expect(cardAnalytics(db, '2026-11', TODAY).spending.map((x) => x.name).sort()).toEqual(['อาหาร', 'เงินออม'])
  })

  it('editing a category without mentioning the flag keeps it; documents from older versions read as "counted"', () => {
    const cat = createCategory(db, { kind: 'expense', name: 'เงินออม', icon: '🐷', excluded: true })
    expect(updateCategory(db, cat.id, { kind: 'expense', name: 'ออม', icon: '🐷' }).excluded).toBe(true)
    const old = { id: crypto.randomUUID(), createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', deletedAt: null, kind: 'expense', name: 'x', icon: 'y', sortOrder: 0 }
    expect(DOC_SCHEMAS.categories.safeParse(old).success).toBe(true)
    expect(docToRow('categories', old)['excluded']).toBe(0)
  })
})

describe('duplicate detection', () => {
  const c0 = (over: Record<string, unknown> = {}) => ({
    id: crypto.randomUUID(), cardId: 'c', chargeDate: '2026-11-19', title: 'ค่าโทรศัพท์', category: '', amountSatang: 72_500, partnerSatang: 0, note: '', billMonth: '2026-11', ...over
  })

  it('spots the same title and amount twice in one statement (case and spacing ignored) and counts the excess', () => {
    const a = c0()
    const b = c0({ id: crypto.randomUUID(), chargeDate: '2026-11-01', title: '  ค่าโทรศัพท์ ' })
    const other = c0({ id: crypto.randomUUID(), amountSatang: 139_000 })
    const report = findDuplicateCharges([a, b, other])
    expect(report.ids.sort()).toEqual([a.id, b.id].sort())
    expect(report.excessSatang).toBe(72_500)
    expect(findDuplicateCharges([a, other]).ids).toEqual([])
    expect(findDuplicateCharges([a, { ...c0(), billMonth: '2026-12' }]).ids).toEqual([]) // a different statement is not a twin
    expect(normalizeTitle('  A   b ')).toBe('a b')
  })

  it('warns before saving a charge a repeating charge has already made, and the statement lists the twins', () => {
    const card = createCard(db, { name: 'LP', issuer: '', statementDay: 20, dueDay: 5, limitSatang: null, isActive: true })
    createCardRecurring(db, { cardId: card.id, title: 'ค่าโทรศัพท์ AIS', category: '', amountSatang: 72_500, partnerSatang: 0, dayOfMonth: 19, startMonth: '2026-10', endMonth: null, note: '', isActive: true })
    const typedByHand = { cardId: card.id, chargeDate: '2026-11-01', title: 'ค่าโทรศัพท์ AIS', category: '', amountSatang: 72_500, partnerSatang: 0, note: '' }
    // the November repeating charge (19 Nov) is in the same statement as 1 Nov: a twin exists before anything is saved
    expect(findDuplicateChargesOf(db, typedByHand, null)).toHaveLength(1)
    createCharge(db, typedByHand)
    const nov = cardsOverview(db, '2026-11', TODAY).cards[0]!
    expect(nov.duplicates.ids).toHaveLength(2)
    expect(nov.duplicates.excessSatang).toBe(72_500)
    // a different amount is not a duplicate; editing a charge never matches itself
    expect(findDuplicateChargesOf(db, { ...typedByHand, amountSatang: 1 }, null)).toHaveLength(0)
    expect(findDuplicateChargesOf(db, typedByHand, nov.charges.find((c) => c.chargeDate === '2026-11-01')!.id)).toHaveLength(1)
  })

  it('the overview lists the titles of the repeating items on the Recurring page, so a card rule with the same name can be flagged', () => {
    createRecurring(db, { kind: 'expense', title: ' ค่าไฟ ', amountSatang: 120_000, categoryId: null, paymentMethodId: null, dayOfMonth: 5, startMonth: '2026-10', endMonth: null, note: '', isActive: true })
    createRecurring(db, { kind: 'income', title: 'เงินเดือน', amountSatang: 100_000, categoryId: null, paymentMethodId: null, dayOfMonth: 25, startMonth: '2026-10', endMonth: null, note: '', isActive: true })
    expect(cardsOverview(db, '2026-10', TODAY).ledgerRuleTitles).toEqual(['ค่าไฟ'])
  })
})
