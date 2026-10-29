import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { foldSlices } from '@shared/analytics'
import { cardAnalytics } from './cardAnalytics'
import { cardBillId, createCard, createCardBill, createCharge, createPlan, refreshCardBills, setCardPaid, setPartnerPaid } from './cardRepo'
import { openMemoryDatabase, type Db } from './connection'
import { DEFAULT_CATEGORIES } from './defaults'
import { createTransaction, getTransaction, listMonth } from './transactionRepo'

const TODAY = '2026-10-29'
let db: Db

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-29T08:00:00.000Z'))
  db = openMemoryDatabase()
})
afterEach(() => vi.useRealTimers())

const card = () => createCard(db, { name: 'KTC', issuer: '', statementDay: 25, dueDay: 10, limitSatang: null, isActive: true })
const charge = (cardId: string, amountSatang: number, partnerSatang = 0, category = 'อาหาร', chargeDate = '2026-10-05') =>
  createCharge(db, { cardId, chargeDate, title: 'item', category, amountSatang, partnerSatang, note: '' })
const food = DEFAULT_CATEGORIES.find((c) => c.name === 'อาหาร')!

describe('paying a card statement', () => {
  it('one press creates the bill in the ledger (which card, how much) and marks it paid; undo reopens it', () => {
    const c = card()
    charge(c.id, 100_000)
    charge(c.id, 60_000, 60_000)
    const r = setCardPaid(db, c.id, '2026-10', true, TODAY)
    expect(r).toMatchObject({ isPaid: true, amountSatang: 100_000 }) // only our part
    const bill = listMonth(db, '2026-11', TODAY).find((t) => t.id === cardBillId(c.id, '2026-10'))!
    expect(bill.title).toContain('KTC')
    expect(bill).toMatchObject({ isPaid: true, paidDate: TODAY, kind: 'expense', amountSatang: 100_000 })
    expect(setCardPaid(db, c.id, '2026-10', false, TODAY)).toMatchObject({ isPaid: false })
    expect(getTransaction(db, r.transactionId, TODAY).isPaid).toBe(false)
  })

  it('cannot "pay" a statement that is empty or fully the partner\'s', () => {
    const c = card()
    expect(() => setCardPaid(db, c.id, '2026-10', true, TODAY)).toThrow()
    charge(c.id, 5_000, 5_000)
    expect(() => setCardPaid(db, c.id, '2026-10', true, TODAY)).toThrow(/แฟนจ่ายทั้งหมด/)
  })
})

describe('refreshCardBills keeps unpaid bills in step with the statement', () => {
  it('updates the amount when the statement changes, never touches a paid bill, removes an emptied one', () => {
    const c = card()
    const first = charge(c.id, 100_000)
    createCardBill(db, c.id, '2026-10', TODAY)
    const id = cardBillId(c.id, '2026-10')
    charge(c.id, 30_000)
    createPlan(db, { cardId: c.id, title: 'tv', totalMonths: 3, monthlySatang: 50_000, partnerSatang: 10_000, startMonth: '2026-10', note: '' })
    expect(getTransaction(db, id, TODAY).amountSatang).toBe(100_000) // stale until refreshed
    expect(refreshCardBills(db, TODAY)).toBe(1)
    expect(getTransaction(db, id, TODAY).amountSatang).toBe(100_000 + 30_000 + 40_000)
    expect(refreshCardBills(db, TODAY)).toBe(0) // nothing left to change

    // paid bills stay exactly as they were
    setCardPaid(db, c.id, '2026-10', true, TODAY)
    charge(c.id, 9_999)
    expect(refreshCardBills(db, TODAY)).toBe(0)
    expect(getTransaction(db, id, TODAY).amountSatang).toBe(170_000)

    // an unpaid bill whose statement becomes empty disappears
    const d = createCard(db, { name: 'SCB', issuer: '', statementDay: 25, dueDay: 10, limitSatang: null, isActive: true })
    const only = charge(d.id, 20_000)
    createCardBill(db, d.id, '2026-10', TODAY)
    db.prepare('UPDATE card_charges SET deleted_at = ? WHERE id = ?').run('2026-10-29T08:00:00.000Z', only.id)
    expect(refreshCardBills(db, TODAY)).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE id = ? AND deleted_at IS NULL').get(cardBillId(d.id, '2026-10'))).toEqual({ n: 0 })
    expect(first.id).toBeTruthy()
  })

  it('does not create bills just because months exist', () => {
    const c = card()
    charge(c.id, 100_000)
    expect(refreshCardBills(db, TODAY)).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS n FROM transactions').get()).toEqual({ n: 0 })
  })
})

describe('card analytics', () => {
  it("pie: counts our share by category, drops the partner's items, and never counts the card bill twice", () => {
    const c = card()
    charge(c.id, 100_000, 0, 'อาหาร') // ours
    charge(c.id, 60_000, 60_000, 'ช้อปปิ้ง') // partner pays everything -> disappears
    charge(c.id, 40_000, 20_000, 'อาหาร') // half each
    createPlan(db, { cardId: c.id, title: 'phone', totalMonths: 10, monthlySatang: 150_000, partnerSatang: 50_000, startMonth: '2026-08', note: '' })
    createCardBill(db, c.id, '2026-10', TODAY) // the bill is due 2026-11-10: it must not be added on top
    createTransaction(
      db,
      { kind: 'expense', title: 'coffee', amountSatang: 7_000, categoryId: food.id, paymentMethodId: null, txnDate: '2026-11-03', dueDate: null, isPaid: true, note: '' },
      TODAY
    )
    const a = cardAnalytics(db, '2026-11', TODAY)
    const by = Object.fromEntries(a.spending.map((s) => [s.name, s.totalSatang]))
    expect(by['อาหาร']).toBe(100_000 + 20_000 + 7_000) // card food (ours) + the ledger coffee
    expect(by['ช้อปปิ้ง']).toBeUndefined()
    expect(by['ผ่อนชำระบัตรเครดิต']).toBe(100_000)
    expect(by['บัตรเครดิต']).toBeUndefined() // the bill itself is not a spending category
    expect(a.spendingTotal).toBe(127_000 + 100_000)
    expect(a.spending[0]!.name).toBe('อาหาร') // biggest first
  })

  it('bars: what the partner owes per month (by due date) and what they have transferred', () => {
    const c = card()
    charge(c.id, 60_000, 60_000)
    expect(cardAnalytics(db, '2026-11', TODAY).partnerMonths.at(-1)).toEqual({ month: '2026-11', owedSatang: 60_000, paidSatang: 0 })
    setPartnerPaid(db, c.id, '2026-10', true, TODAY)
    const a = cardAnalytics(db, '2026-11', TODAY)
    expect(a.partnerMonths).toHaveLength(6)
    expect(a.partnerMonths.at(-1)).toEqual({ month: '2026-11', owedSatang: 60_000, paidSatang: 60_000 })
    expect(a.partnerMonths[0]!.month).toBe('2026-06')
    expect(a.partnerMonths.slice(0, -1).every((m) => m.owedSatang === 0 || m.month === '2026-11')).toBe(true)
  })

  it('folds a long tail of small slices into one "อื่น ๆ" slice', () => {
    const slices = Array.from({ length: 10 }, (_, i) => ({ name: `c${i}`, icon: 'x', totalSatang: 1000 - i }))
    const folded = foldSlices(slices, 6)
    expect(folded).toHaveLength(6)
    expect(folded.at(-1)).toMatchObject({ name: 'อื่น ๆ', totalSatang: 995 + 994 + 993 + 992 + 991 })
    expect(foldSlices(slices.slice(0, 3), 6)).toHaveLength(3)
  })
})
