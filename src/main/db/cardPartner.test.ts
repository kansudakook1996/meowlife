import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChargeInputSchema, PlanInputSchema } from '@shared/cards'
import {
  cardsOverview,
  createCard,
  createCardBill,
  createCardRecurring,
  createCharge,
  createPlan,
  partnerPaymentId,
  setPartnerPaid,
  updateCharge
} from './cardRepo'
import { openMemoryDatabase, type Db } from './connection'
import { removeRow } from './portalRepo'
import { getDirty } from './syncRepo'
import { getTransaction } from './transactionRepo'

const TODAY = '2026-10-29'
let db: Db

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-29T08:00:00.000Z'))
  db = openMemoryDatabase()
})
afterEach(() => vi.useRealTimers())

const card = () => createCard(db, { name: 'KTC', issuer: '', statementDay: 25, dueDay: 10, limitSatang: null, isActive: true })
const charge = (cardId: string, amountSatang: number, partnerSatang: number, chargeDate = '2026-10-05') =>
  createCharge(db, { cardId, chargeDate, title: 'item', category: '', amountSatang, partnerSatang, note: '' })
const statement = (month = '2026-10') => cardsOverview(db, month, TODAY).cards[0]!

describe("the partner's share of card spending", () => {
  it('splits a statement into the bank total, our part and the partner part (charges + instalments + repeating)', () => {
    const c = card()
    charge(c.id, 100_000, 0) // ours
    charge(c.id, 60_000, 60_000) // partner borrowed the card
    charge(c.id, 40_000, 20_000) // split in half
    createPlan(db, { cardId: c.id, title: 'phone', totalMonths: 10, monthlySatang: 150_000, partnerSatang: 75_000, startMonth: '2026-08', note: '' })
    createCardRecurring(db, { cardId: c.id, title: 'Netflix', category: '', amountSatang: 20_000, partnerSatang: 0, dayOfMonth: 5, startMonth: '2026-10', endMonth: null, note: '', isActive: true })
    const s = statement()
    expect(s.total).toBe(100_000 + 60_000 + 40_000 + 150_000 + 20_000)
    expect(s.partnerTotal).toBe(60_000 + 20_000 + 75_000)
    expect(s.mineTotal).toBe(s.total - s.partnerTotal)
    const o = cardsOverview(db, '2026-10', TODAY)
    expect(o.totalMine).toBe(s.mineTotal)
    expect(o.totalPartner).toBe(s.partnerTotal)
  })

  it('an instalment plan splits every month until it is paid off', () => {
    const c = card()
    createPlan(db, { cardId: c.id, title: 'tv', totalMonths: 3, monthlySatang: 100_000, partnerSatang: 40_000, startMonth: '2026-10', note: '' })
    expect(statement('2026-12').partnerTotal).toBe(40_000)
    expect(statement('2027-01').partnerTotal).toBe(0) // paid off
  })

  it("the ledger bill holds ONLY our part, with the full amount in its note", () => {
    const c = card()
    charge(c.id, 100_000, 0)
    charge(c.id, 60_000, 60_000)
    const r = createCardBill(db, c.id, '2026-10', TODAY)
    expect(r).toMatchObject({ action: 'created', amountSatang: 100_000 })
    const t = getTransaction(db, r.transactionId, TODAY)
    expect(t.amountSatang).toBe(100_000)
    expect(t.note).toContain('ส่วนของเรา')
    // changing the split updates the same bill
    const second = createCharge(db, { cardId: c.id, chargeDate: '2026-10-06', title: 'more', category: '', amountSatang: 30_000, partnerSatang: 0, note: '' })
    expect(createCardBill(db, c.id, '2026-10', TODAY)).toMatchObject({ action: 'updated', amountSatang: 130_000 })
    updateCharge(db, second.id, { cardId: c.id, chargeDate: '2026-10-06', title: 'more', category: '', amountSatang: 30_000, partnerSatang: 30_000, note: '' })
    expect(createCardBill(db, c.id, '2026-10', TODAY)).toMatchObject({ action: 'updated', amountSatang: 100_000 })
  })

  it('refuses to make a bill when the partner pays everything', () => {
    const c = card()
    charge(c.id, 50_000, 50_000)
    expect(() => createCardBill(db, c.id, '2026-10', TODAY)).toThrow(/แฟนจ่ายทั้งหมด/)
  })

  it("records the partner's repayment, notices when the amount changed, and can undo it", () => {
    const c = card()
    charge(c.id, 60_000, 60_000)
    expect(statement().partnerPayment).toBeNull()
    expect(setPartnerPaid(db, c.id, '2026-10', true, TODAY)).toEqual({ amountSatang: 60_000, paidDate: TODAY })
    expect(statement().partnerPayment).toEqual({ amountSatang: 60_000, paidDate: TODAY })
    // the share grows afterwards: the old payment no longer matches, ticking again records the new amount
    charge(c.id, 10_000, 10_000)
    expect(statement().partnerPayment!.amountSatang).not.toBe(statement().partnerTotal)
    expect(setPartnerPaid(db, c.id, '2026-10', true, TODAY)!.amountSatang).toBe(70_000)
    expect(getDirty(db, 100).filter((d) => d.table === 'card_partner_payments')).toHaveLength(1) // one row, same id
    expect(setPartnerPaid(db, c.id, '2026-10', false, TODAY)).toBeNull()
    expect(statement().partnerPayment).toBeNull()
    expect(partnerPaymentId(c.id, '2026-10')).toBe(partnerPaymentId(c.id, '2026-10')) // stable id for every device
  })

  it('has nothing to repay when there is no partner share; deleting the card removes the repayment too', () => {
    const c = card()
    charge(c.id, 60_000, 0)
    expect(() => setPartnerPaid(db, c.id, '2026-10', true, TODAY)).toThrow(/ไม่มีส่วนของแฟน/)
    charge(c.id, 10_000, 10_000)
    setPartnerPaid(db, c.id, '2026-10', true, TODAY)
    removeRow(db, 'credit_cards', c.id)
    const left = db.prepare('SELECT COUNT(*) AS n FROM card_partner_payments WHERE deleted_at IS NULL').get() as { n: number }
    expect(left.n).toBe(0)
  })

  it('validates: the partner part is not negative and not more than the whole amount', () => {
    const uuid = crypto.randomUUID()
    const charge0 = { cardId: uuid, chargeDate: '2026-10-05', title: 'x', category: '', amountSatang: 100, partnerSatang: 100, note: '' }
    expect(ChargeInputSchema.safeParse(charge0).success).toBe(true)
    expect(ChargeInputSchema.safeParse({ ...charge0, partnerSatang: 101 }).success).toBe(false)
    expect(ChargeInputSchema.safeParse({ ...charge0, partnerSatang: -1 }).success).toBe(false)
    const plan0 = { cardId: uuid, title: 'x', totalMonths: 5, monthlySatang: 100, partnerSatang: 50, startMonth: '2026-10', note: '' }
    expect(PlanInputSchema.safeParse(plan0).success).toBe(true)
    expect(PlanInputSchema.safeParse({ ...plan0, partnerSatang: 101 }).success).toBe(false)
  })
})
