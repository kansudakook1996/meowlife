import { describe, expect, it } from 'vitest'
import { formatThaiMonth, monthsBetween } from './dates'
import {
  billMonthFor,
  buildStatement,
  CardInputSchema,
  ChargeInputSchema,
  dueDateFor,
  overviewOf,
  planLine,
  planText,
  PlanInputSchema,
  type CardCharge,
  type CardPlan,
  type CreditCard
} from './cards'

const card: CreditCard = { id: 'c1', name: 'KTC', issuer: 'กรุงไทย', statementDay: 25, dueDay: 10, limitSatang: 5_000_000, isActive: true, sortOrder: 0 }
const plan = (over: Partial<CardPlan> = {}): CardPlan => ({
  id: 'p1', cardId: 'c1', title: 'ผ่อนโทรศัพท์', totalMonths: 10, monthlySatang: 150_000, startMonth: '2026-08', note: '', ...over
})
const charge = (over: Partial<CardCharge> = {}): CardCharge => ({
  id: 'x', cardId: 'c1', chargeDate: '2026-10-05', title: 'ข้าว', category: 'อาหาร', amountSatang: 25_000, note: '', billMonth: '2026-10', ...over
})

describe('which statement a purchase belongs to', () => {
  it('on or before the statement day → this month, after → next month', () => {
    expect(billMonthFor('2026-10-25', 25)).toBe('2026-10') // statement day itself still counts
    expect(billMonthFor('2026-10-26', 25)).toBe('2026-11')
    expect(billMonthFor('2026-10-01', 25)).toBe('2026-10')
    expect(billMonthFor('2026-12-30', 25)).toBe('2027-01') // across the year
  })

  it('uses the last day of short months when the statement day is 31', () => {
    expect(billMonthFor('2026-11-30', 31)).toBe('2026-11')
    expect(billMonthFor('2027-02-28', 31)).toBe('2027-02')
    expect(billMonthFor('2028-02-29', 30)).toBe('2028-02')
  })
})

describe('due dates', () => {
  it('same month when the due day is after the statement day, otherwise the next month', () => {
    expect(dueDateFor('2026-10', 25, 10)).toBe('2026-11-10')
    expect(dueDateFor('2026-10', 5, 20)).toBe('2026-10-20')
    expect(dueDateFor('2026-12', 25, 10)).toBe('2027-01-10')
    expect(dueDateFor('2027-01', 15, 31)).toBe('2027-01-31')
    expect(dueDateFor('2027-02', 15, 31)).toBe('2027-02-28') // clamped to the shorter month
    expect(dueDateFor('2027-01', 28, 30)).toBe('2027-01-30')
  })
})

describe('instalment plans', () => {
  it('counts the instalment number and what is left', () => {
    expect(monthsBetween('2026-08', '2026-10')).toBe(2)
    const l = planLine(plan(), '2026-10')
    expect(l).toMatchObject({ ordinal: 3, total: 10, state: 'active', remainingAfter: 7, endMonth: '2027-05', amountThisMonth: 150_000, remainingTotalSatang: 150_000 * 8 })
    expect(planText(l, formatThaiMonth)).toBe('งวดที่ 3/10 · เหลืออีก 7 งวด · ผ่อนหมดพฤษภาคม 2570')
  })

  it('first, last, finished and not-yet-started instalments', () => {
    expect(planLine(plan(), '2026-08')).toMatchObject({ ordinal: 1, state: 'active', remainingAfter: 9 })
    const last = planLine(plan(), '2027-05')
    expect(last).toMatchObject({ ordinal: 10, state: 'active', remainingAfter: 0 })
    expect(planText(last, formatThaiMonth)).toBe('งวดสุดท้าย 10/10')
    expect(planLine(plan(), '2027-06')).toMatchObject({ state: 'done', amountThisMonth: 0, remainingTotalSatang: 0 })
    expect(planText(planLine(plan(), '2027-06'), formatThaiMonth)).toBe('ผ่อนหมดแล้ว')
    expect(planLine(plan(), '2026-06')).toMatchObject({ state: 'upcoming', amountThisMonth: 0, remainingTotalSatang: 150_000 * 10 })
  })
})

describe('statement', () => {
  it('adds this month\'s charges and active instalments, ignoring other months and other cards', () => {
    const s = buildStatement(
      card,
      [
        charge({ id: 'a', amountSatang: 25_000 }),
        charge({ id: 'b', title: 'ของใช้', amountSatang: 12_050, chargeDate: '2026-10-12' }),
        charge({ id: 'c', billMonth: '2026-11' }),
        charge({ id: 'd', cardId: 'other' })
      ],
      [plan(), plan({ id: 'p2', title: 'ผ่อนจบแล้ว', startMonth: '2026-01', totalMonths: 6, monthlySatang: 99_900 }), plan({ id: 'p3', cardId: 'other' })],
      '2026-10'
    )
    expect(s.charges.map((c) => c.id)).toEqual(['a', 'b'])
    expect(s.chargesTotal).toBe(37_050)
    expect(s.installments.map((l) => l.plan.id)).toEqual(['p1'])
    expect(s.installmentsTotal).toBe(150_000)
    expect(s.total).toBe(187_050)
    expect(s.statementDate).toBe('2026-10-25')
    expect(s.dueDate).toBe('2026-11-10')
    expect(s.futureInstallmentsTotal).toBe(150_000 * 7)
    expect(s.allPlans).toHaveLength(2)
  })

  it('totals several cards for the month', () => {
    const a = buildStatement(card, [charge()], [], '2026-10')
    const b = buildStatement({ ...card, id: 'c2', name: 'SCB' }, [charge({ cardId: 'c2', amountSatang: 100_000 })], [], '2026-10')
    const o = overviewOf('2026-10', [{ ...a, bill: null }, { ...b, bill: { transactionId: 't', isPaid: true, amountSatang: 100_000, status: 'paid' } }], '2026-10-28')
    expect(o).toMatchObject({ totalDue: 125_000, chargesTotal: 125_000, installmentsTotal: 0 })
    expect(o.cards[0]?.daysToDue).toBe(13) // 2026-11-10
    expect(o.cards[1]?.daysToDue).toBeNull() // already paid
  })
})

describe('validation', () => {
  const uuid = '11111111-1111-4111-8111-111111111111'
  it('cards', () => {
    expect(CardInputSchema.safeParse({ name: 'KTC', issuer: '', statementDay: 25, dueDay: 10, limitSatang: null, isActive: true }).success).toBe(true)
    expect(CardInputSchema.safeParse({ name: '', issuer: '', statementDay: 25, dueDay: 10, limitSatang: null, isActive: true }).success).toBe(false)
    expect(CardInputSchema.safeParse({ name: 'x', issuer: '', statementDay: 32, dueDay: 10, limitSatang: null, isActive: true }).success).toBe(false)
  })
  it('charges and plans', () => {
    const c = { cardId: uuid, chargeDate: '2026-10-05', title: 'ข้าว', category: 'อาหาร', amountSatang: 100, note: '' }
    expect(ChargeInputSchema.safeParse(c).success).toBe(true)
    expect(ChargeInputSchema.safeParse({ ...c, amountSatang: 0 }).success).toBe(false)
    expect(ChargeInputSchema.safeParse({ ...c, chargeDate: '2026-02-30' }).success).toBe(false)
    const p = { cardId: uuid, title: 'ผ่อนมือถือ', totalMonths: 10, monthlySatang: 150_000, startMonth: '2026-08', note: '' }
    expect(PlanInputSchema.safeParse(p).success).toBe(true)
    expect(PlanInputSchema.safeParse({ ...p, totalMonths: 1 }).success).toBe(false)
    expect(PlanInputSchema.safeParse({ ...p, totalMonths: 121 }).success).toBe(false)
    expect(PlanInputSchema.safeParse({ ...p, startMonth: '2026-13' }).success).toBe(false)
  })
})
