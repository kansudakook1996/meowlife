import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runSync, type SyncLocal, type SyncRemote } from '@shared/syncEngine'
import type { SyncDoc, SyncTable } from '@shared/syncModel'
import {
  cardBillId,
  cardsOverview,
  createCard,
  createCardBill,
  createCharge,
  createPlan,
  listCards,
  updateCard,
  updateCharge,
  updatePlan
} from './cardRepo'
import { openMemoryDatabase, type Db } from './connection'
import { removeRow, restoreRow } from './portalRepo'
import { applyRemote, bindOwner, countDirty, getDirty, getState, markClean, setState } from './syncRepo'
import { listMonth, setPaid } from './transactionRepo'

const TODAY = '2026-10-29'
let db: Db

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-29T08:00:00.000Z'))
  db = openMemoryDatabase()
})
afterEach(() => vi.useRealTimers())

const ktc = (over: Partial<Parameters<typeof createCard>[1]> = {}) =>
  createCard(db, { name: 'KTC', issuer: 'กรุงไทย', statementDay: 25, dueDay: 10, limitSatang: 5_000_000, isActive: true, ...over })
const charge = (cardId: string, over: Partial<Parameters<typeof createCharge>[1]> = {}) =>
  createCharge(db, { cardId, chargeDate: '2026-10-05', title: 'ข้าว', category: 'อาหาร', amountSatang: 25_000, note: '', ...over })

describe('cards and charges', () => {
  it('files each purchase into the right statement', () => {
    const c = ktc()
    expect(charge(c.id, { chargeDate: '2026-10-25' }).billMonth).toBe('2026-10')
    expect(charge(c.id, { chargeDate: '2026-10-26' }).billMonth).toBe('2026-11')
    expect(charge(c.id, { chargeDate: '2026-12-30' }).billMonth).toBe('2027-01')
  })

  it('moving a purchase to another date or card re-files it; unknown cards are refused', () => {
    const a = ktc()
    const b = ktc({ name: 'SCB', statementDay: 5, dueDay: 25 })
    const ch = charge(a.id, { chargeDate: '2026-10-10' })
    expect(updateCharge(db, ch.id, { cardId: b.id, chargeDate: '2026-10-10', title: 'ข้าว', category: '', amountSatang: 100, note: '' }).billMonth).toBe('2026-11') // after SCB's day 5
    expect(() => charge('00000000-0000-4000-8000-000000000000')).toThrow(/ไม่พบบัตร/)
  })

  it('changing the statement day re-files every existing purchase of that card', () => {
    const c = ktc()
    const ch = charge(c.id, { chargeDate: '2026-10-20' })
    expect(ch.billMonth).toBe('2026-10')
    updateCard(db, c.id, { name: 'KTC', issuer: '', statementDay: 15, dueDay: 5, limitSatang: null, isActive: true })
    const o = cardsOverview(db, '2026-11', TODAY).cards[0]!
    expect(o.charges.map((x) => x.id)).toEqual([ch.id])
  })
})

describe('monthly overview with instalments', () => {
  it('adds charges and the active instalment of every card and shows what is left', () => {
    const a = ktc()
    const b = ktc({ name: 'SCB', statementDay: 5, dueDay: 25 })
    charge(a.id, { amountSatang: 25_000 })
    charge(a.id, { title: 'ของใช้', category: 'ของใช้', amountSatang: 12_050, chargeDate: '2026-10-12' })
    charge(b.id, { amountSatang: 100_000, chargeDate: '2026-10-03' })
    createPlan(db, { cardId: a.id, title: 'ผ่อนโทรศัพท์', totalMonths: 10, monthlySatang: 150_000, startMonth: '2026-08', note: '' })
    createPlan(db, { cardId: b.id, title: 'ผ่อนจบแล้ว', totalMonths: 3, monthlySatang: 50_000, startMonth: '2026-01', note: '' })

    const o = cardsOverview(db, '2026-10', TODAY)
    const ka = o.cards.find((c) => c.card.id === a.id)!
    expect(ka).toMatchObject({ chargesTotal: 37_050, installmentsTotal: 150_000, total: 187_050, dueDate: '2026-11-10', futureInstallmentsTotal: 150_000 * 7 })
    expect(ka.installments[0]).toMatchObject({ ordinal: 3, total: 10, remainingAfter: 7, endMonth: '2027-05' })
    const kb = o.cards.find((c) => c.card.id === b.id)!
    expect(kb).toMatchObject({ chargesTotal: 100_000, installmentsTotal: 0, total: 100_000, dueDate: '2026-10-25' })
    expect(o.totalDue).toBe(287_050)
    expect(o.cards.map((c) => c.daysToDue)).toEqual([12, -4])
  })

  it('a switched-off card is left out; its plans can be edited', () => {
    const a = ktc()
    const p = createPlan(db, { cardId: a.id, title: 'ผ่อน', totalMonths: 6, monthlySatang: 100, startMonth: '2026-10', note: '' })
    expect(updatePlan(db, p.id, { cardId: a.id, title: 'ผ่อน (แก้)', totalMonths: 12, monthlySatang: 200, startMonth: '2026-10', note: '' }).totalMonths).toBe(12)
    updateCard(db, a.id, { name: 'KTC', issuer: '', statementDay: 25, dueDay: 10, limitSatang: null, isActive: false })
    expect(cardsOverview(db, '2026-10', TODAY).cards).toHaveLength(0)
    expect(listCards(db)).toHaveLength(1)
  })
})

describe('putting a statement into the ledger', () => {
  it('creates one unpaid bill, updates it when the amount changes, and never touches a paid one', () => {
    const c = ktc()
    charge(c.id, { amountSatang: 25_000 })
    expect(() => createCardBill(db, c.id, '2026-12', TODAY)).toThrow(/ยังไม่มียอด/)

    const first = createCardBill(db, c.id, '2026-10', TODAY)
    expect(first).toMatchObject({ action: 'created', amountSatang: 25_000, transactionId: cardBillId(c.id, '2026-10') })
    let bills = listMonth(db, '2026-11', TODAY)
    expect(bills).toHaveLength(1)
    expect(bills[0]).toMatchObject({ title: 'ชำระบัตร KTC (ตุลาคม 2569)', kind: 'expense', dueDate: '2026-11-10', isPaid: false, categoryName: 'บัตรเครดิต' })

    charge(c.id, { title: 'กาแฟ', amountSatang: 7_500, chargeDate: '2026-10-20' })
    expect(createCardBill(db, c.id, '2026-10', TODAY)).toMatchObject({ action: 'updated', amountSatang: 32_500 })
    expect(createCardBill(db, c.id, '2026-10', TODAY).transactionId).toBe(first.transactionId)
    bills = listMonth(db, '2026-11', TODAY)
    expect(bills).toHaveLength(1) // pressing it again never duplicates
    expect(bills[0]?.amountSatang).toBe(32_500)

    setPaid(db, first.transactionId, true, TODAY)
    charge(c.id, { title: 'หลังจ่าย', amountSatang: 999, chargeDate: '2026-10-21' })
    expect(createCardBill(db, c.id, '2026-10', TODAY)).toMatchObject({ action: 'paid', amountSatang: 32_500 })
    expect(listMonth(db, '2026-11', TODAY)[0]).toMatchObject({ isPaid: true, amountSatang: 32_500 })
    expect(cardsOverview(db, '2026-10', TODAY).cards[0]?.bill).toMatchObject({ isPaid: true, amountSatang: 32_500 })
    expect(cardsOverview(db, '2026-10', TODAY).cards[0]?.daysToDue).toBeNull()
  })

  it('the bill shows up as an unpaid bill with the right status for reminders', () => {
    const c = ktc({ dueDay: 30, statementDay: 20 })
    charge(c.id, { chargeDate: '2026-10-05' })
    createCardBill(db, c.id, '2026-10', TODAY)
    const bill = listMonth(db, '2026-10', TODAY).find((t) => t.title.startsWith('ชำระบัตร'))!
    expect(bill).toMatchObject({ dueDate: '2026-10-30', status: 'due_soon' }) // 1 day away
  })
})

describe('delete and undo', () => {
  it('deleting a card hides its charges and plans together; undo brings them all back', () => {
    const c = ktc()
    charge(c.id)
    createPlan(db, { cardId: c.id, title: 'ผ่อน', totalMonths: 6, monthlySatang: 100, startMonth: '2026-10', note: '' })
    removeRow(db, 'credit_cards', c.id)
    expect(listCards(db)).toHaveLength(0)
    expect(cardsOverview(db, '2026-10', TODAY).cards).toHaveLength(0)
    restoreRow(db, 'credit_cards', c.id)
    const k = cardsOverview(db, '2026-10', TODAY).cards[0]!
    expect(k.charges).toHaveLength(1)
    expect(k.installments).toHaveLength(1)
  })
})

/* ---------- sync ---------- */

class FakeRemote implements SyncRemote {
  store = new Map<SyncTable, Map<string, SyncDoc>>()
  private t(table: SyncTable): Map<string, SyncDoc> {
    let m = this.store.get(table)
    if (!m) this.store.set(table, (m = new Map()))
    return m
  }
  async pull(table: SyncTable, since: string, limit: number): Promise<SyncDoc[]> {
    return [...this.t(table).values()].filter((d) => String(d['updatedAt']) >= since).sort((a, b) => String(a['updatedAt']).localeCompare(String(b['updatedAt']))).slice(0, limit).map((d) => ({ ...d }))
  }
  async push(table: SyncTable, docs: SyncDoc[]): Promise<void> {
    for (const d of docs) this.t(table).set(String(d['id']), { ...d })
  }
}
const localFor = (d: Db): SyncLocal => ({
  bind: async (uid) => bindOwner(d, uid),
  getCursor: async (t) => getState(d, `cursor:${t}`) ?? '',
  setCursor: async (t, v) => setState(d, `cursor:${t}`, v),
  getDirty: async (l, ex) => getDirty(d, l, ex),
  markClean: async (i) => markClean(d, i),
  applyRemote: async (t, docs) => applyRemote(d, t, docs)
})

describe('credit cards sync between two devices', () => {
  it('cards, charges, plans and the ledger bill arrive on the other device; edits there flow back', async () => {
    const remote = new FakeRemote()
    const b = openMemoryDatabase()
    const c = ktc()
    const ch = charge(c.id, { amountSatang: 60_000 })
    createPlan(db, { cardId: c.id, title: 'ผ่อนโทรศัพท์', totalMonths: 10, monthlySatang: 150_000, startMonth: '2026-08', note: '' })
    createCardBill(db, c.id, '2026-10', TODAY)
    await runSync(localFor(db), remote, 'u')
    expect(countDirty(db)).toBe(0)

    const first = await runSync(localFor(b), remote, 'u')
    expect(first.skipped).toBe(0)
    const view = cardsOverview(b, '2026-10', TODAY).cards[0]!
    expect(view).toMatchObject({ chargesTotal: 60_000, installmentsTotal: 150_000, total: 210_000 })
    expect(view.bill).toMatchObject({ amountSatang: 210_000, isPaid: false })

    vi.setSystemTime(new Date('2026-10-29T09:00:00.000Z'))
    updateCharge(b, ch.id, { cardId: c.id, chargeDate: '2026-10-05', title: 'ข้าว (แก้)', category: 'อาหาร', amountSatang: 70_000, note: '' })
    setPaid(b, cardBillId(c.id, '2026-10'), true, TODAY)
    await runSync(localFor(b), remote, 'u')
    await runSync(localFor(db), remote, 'u')
    expect(cardsOverview(db, '2026-10', TODAY).cards[0]).toMatchObject({ chargesTotal: 70_000 })
    expect(cardsOverview(db, '2026-10', TODAY).cards[0]?.bill?.isPaid).toBe(true)
  })

  it('the same monthly bill made on two devices is a single ledger entry', async () => {
    const remote = new FakeRemote()
    const b = openMemoryDatabase()
    const c = ktc()
    charge(c.id)
    await runSync(localFor(db), remote, 'u')
    await runSync(localFor(b), remote, 'u')
    createCardBill(db, c.id, '2026-10', TODAY)
    createCardBill(b, c.id, '2026-10', TODAY)
    await runSync(localFor(db), remote, 'u')
    await runSync(localFor(b), remote, 'u')
    await runSync(localFor(db), remote, 'u')
    const docs = [...(remote.store.get('transactions')?.values() ?? [])].filter((d) => String(d['title']).startsWith('ชำระบัตร'))
    expect(docs).toHaveLength(1)
    expect(listMonth(db, '2026-11', TODAY)).toHaveLength(1)
    expect(listMonth(b, '2026-11', TODAY)).toHaveLength(1)
  })
})
