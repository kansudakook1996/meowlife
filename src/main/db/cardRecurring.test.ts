import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardRecurringInputSchema } from '@shared/cards'
import {
  cardsOverview,
  createCard,
  createCardRecurring,
  ensureCardRecurringForMonth,
  listCardRecurring,
  recurringChargeId,
  updateCard,
  updateCardRecurring
} from './cardRepo'
import { openMemoryDatabase, type Db } from './connection'
import { removeRow, restoreRow } from './portalRepo'
import { getDirty } from './syncRepo'

const TODAY = '2026-10-29'
let db: Db

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-29T08:00:00.000Z'))
  db = openMemoryDatabase()
})
afterEach(() => vi.useRealTimers())

const card = (over: Partial<Parameters<typeof createCard>[1]> = {}) =>
  createCard(db, { name: 'KTC', issuer: '', statementDay: 25, dueDay: 10, limitSatang: null, isActive: true, ...over })
const rule = (cardId: string, over: Partial<Parameters<typeof createCardRecurring>[1]> = {}) =>
  createCardRecurring(db, {
    cardId,
    title: 'Electricity',
    category: 'Utilities',
    amountSatang: 120_000,
    dayOfMonth: 5,
    startMonth: '2026-09',
    endMonth: null,
    partnerSatang: 0,
    note: '',
    isActive: true,
    ...over
  })

describe('repeating card charges', () => {
  it('creates one charge per month, in the right statement, with the chosen category', () => {
    const c = card()
    rule(c.id)
    const oct = cardsOverview(db, '2026-10', TODAY).cards[0]!
    // 2026-10-05 is on/before the 25th statement day -> October statement
    expect(oct.charges.map((x) => [x.title, x.category, x.chargeDate, x.amountSatang])).toEqual([['Electricity', 'Utilities', '2026-10-05', 120_000]])
    expect(oct.chargesTotal).toBe(120_000)
    expect(oct.recurring).toHaveLength(1)
    // a charge on the 28th belongs to next month's statement
    rule(c.id, { title: 'Late', dayOfMonth: 28, amountSatang: 50_000 })
    const nov = cardsOverview(db, '2026-11', TODAY).cards[0]!
    expect(nov.charges.map((x) => x.title).sort()).toEqual(['Electricity', 'Late'])
  })

  it('is idempotent and never brings back a charge the user deleted', () => {
    const c = card()
    const r = rule(c.id)
    expect(ensureCardRecurringForMonth(db, '2026-10')).toBe(1)
    expect(ensureCardRecurringForMonth(db, '2026-10')).toBe(0)
    const charge = cardsOverview(db, '2026-10', TODAY).cards[0]!.charges[0]!
    expect(charge.id).toBe(recurringChargeId(r.id, '2026-10'))
    removeRow(db, 'card_charges', charge.id)
    expect(ensureCardRecurringForMonth(db, '2026-10')).toBe(0)
    expect(cardsOverview(db, '2026-10', TODAY).cards[0]!.charges).toHaveLength(0)
    restoreRow(db, 'card_charges', charge.id)
    expect(cardsOverview(db, '2026-10', TODAY).cards[0]!.charges).toHaveLength(1)
  })

  it('honours the start/end months, the pause switch and short months', () => {
    const c = card({ statementDay: 31 })
    rule(c.id, { startMonth: '2026-11', endMonth: '2026-12', dayOfMonth: 31 })
    expect(ensureCardRecurringForMonth(db, '2026-10')).toBe(0)
    expect(ensureCardRecurringForMonth(db, '2026-11')).toBe(1)
    expect(ensureCardRecurringForMonth(db, '2026-12')).toBe(1)
    expect(ensureCardRecurringForMonth(db, '2027-01')).toBe(0)
    const nov = cardsOverview(db, '2026-11', TODAY).cards[0]!
    expect(nov.charges[0]!.chargeDate).toBe('2026-11-30') // 30 days in November
    const paused = rule(c.id, { title: 'Paused', isActive: false })
    expect(ensureCardRecurringForMonth(db, '2026-11')).toBe(0)
    updateCardRecurring(db, paused.id, { ...paused, isActive: true, endMonth: null, note: '' })
    expect(ensureCardRecurringForMonth(db, '2026-11')).toBe(1)
  })

  it('changing a rule affects months not yet created; created charges stay', () => {
    const c = card()
    const r = rule(c.id)
    ensureCardRecurringForMonth(db, '2026-10')
    updateCardRecurring(db, r.id, { ...r, amountSatang: 200_000, endMonth: null, note: '' })
    ensureCardRecurringForMonth(db, '2026-11')
    expect(cardsOverview(db, '2026-10', TODAY).cards[0]!.chargesTotal).toBe(120_000)
    expect(cardsOverview(db, '2026-11', TODAY).cards[0]!.chargesTotal).toBe(200_000)
  })

  it('follows a changed statement day, deleting the card or rule, and restore', () => {
    const c = card()
    const r = rule(c.id, { dayOfMonth: 20 })
    expect(cardsOverview(db, '2026-10', TODAY).cards[0]!.chargesTotal).toBe(120_000)
    updateCard(db, c.id, { name: 'KTC', issuer: '', statementDay: 15, dueDay: 10, limitSatang: null, isActive: true })
    // the 20th is now after the 15th: October's own charge moves to November, and October holds September's instead
    const oct = cardsOverview(db, '2026-10', TODAY).cards[0]!
    expect(oct.charges.map((x) => x.chargeDate)).toEqual(['2026-09-20'])
    expect(cardsOverview(db, '2026-11', TODAY).cards[0]!.charges.map((x) => x.chargeDate)).toEqual(['2026-10-20'])
    removeRow(db, 'card_recurring', r.id)
    expect(listCardRecurring(db)).toHaveLength(0)
    restoreRow(db, 'card_recurring', r.id)
    expect(listCardRecurring(db)).toHaveLength(1)
    removeRow(db, 'credit_cards', c.id)
    expect(listCardRecurring(db)).toHaveLength(0) // the card takes its repeating charges with it
    restoreRow(db, 'credit_cards', c.id)
    expect(listCardRecurring(db)).toHaveLength(1)
  })

  it('syncs: the rule and its generated charges are dirty rows with the same ids on every device', () => {
    const c = card()
    const r = rule(c.id)
    cardsOverview(db, '2026-10', TODAY)
    const dirty = getDirty(db, 100)
    expect(dirty.some((d) => d.table === 'card_recurring' && d.doc['id'] === r.id)).toBe(true)
    expect(dirty.some((d) => d.table === 'card_charges' && d.doc['id'] === recurringChargeId(r.id, '2026-10'))).toBe(true)
  })

  it('validates input', () => {
    const base = { cardId: crypto.randomUUID(), title: 'x', category: '', amountSatang: 100, dayOfMonth: 5, startMonth: '2026-10', endMonth: null, partnerSatang: 0, note: '', isActive: true }
    expect(CardRecurringInputSchema.safeParse(base).success).toBe(true)
    expect(CardRecurringInputSchema.safeParse({ ...base, amountSatang: 0 }).success).toBe(false)
    expect(CardRecurringInputSchema.safeParse({ ...base, dayOfMonth: 32 }).success).toBe(false)
    expect(CardRecurringInputSchema.safeParse({ ...base, endMonth: '2026-09' }).success).toBe(false)
    expect(CardRecurringInputSchema.safeParse({ ...base, extra: 1 }).success).toBe(false)
  })
})
