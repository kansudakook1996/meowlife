import { addMonths } from '@shared/dates'
import type { CardAnalytics, PartnerMonth, SpendingSlice } from '@shared/analytics'
import type { CardsOverview } from '@shared/cards'
import { buildOverview, cardBillId, ensureCardRecurringForMonth, listCards } from './cardRepo'
import type { Db } from './connection'
import { listMonth } from './transactionRepo'

const NO_CATEGORY = 'ไม่ระบุหมวด'

const PARTNER_MONTHS = 6

/**
 * Numbers for the two charts. Everything is on a "when the money leaves" basis, the same as the ledger: a card statement
 * counts in the month its bill is DUE. Money the partner pays (whole items or a share) is taken out of the spending pie.
 */
export function cardAnalytics(db: Db, month: string, today: string): CardAnalytics {
  const cards = listCards(db).filter((c) => c.isActive)
  const overviews = new Map<string, CardsOverview>()
  const overviewOf = (billMonth: string): CardsOverview => {
    let o = overviews.get(billMonth)
    if (!o) {
      ensureCardRecurringForMonth(db, addMonths(billMonth, -1))
      ensureCardRecurringForMonth(db, billMonth)
      o = buildOverview(db, billMonth, today)
      overviews.set(billMonth, o)
    }
    return o
  }
  /** The statement of `card` whose bill falls due in calendar month `dueMonth`. */
  const statementDueIn = (cardId: string, dueMonth: string) => {
    const card = cards.find((c) => c.id === cardId)!
    const billMonth = card.dueDay > card.statementDay ? dueMonth : addMonths(dueMonth, -1)
    return { billMonth, statement: overviewOf(billMonth).cards.find((s) => s.card.id === cardId) }
  }

  // ---- spending pie: ledger (minus card bills) + our share of what is on the cards ----
  const totals = new Map<string, SpendingSlice>()
  const add = (name: string, icon: string, satang: number): void => {
    if (satang <= 0) return
    const cur = totals.get(name)
    if (cur) cur.totalSatang += satang
    else totals.set(name, { name, icon, totalSatang: satang })
  }
  const iconOf = new Map<string, string>(
    (db.prepare("SELECT name, icon FROM categories WHERE deleted_at IS NULL AND kind = 'expense'").all() as unknown as Array<{ name: string; icon: string }>).map((r) => [r.name, r.icon])
  )

  const billIds = new Set<string>()
  for (const card of cards) {
    const { billMonth, statement } = statementDueIn(card.id, month)
    billIds.add(cardBillId(card.id, billMonth))
    if (!statement) continue
    for (const c of statement.charges) {
      const name = c.category || NO_CATEGORY
      add(name, iconOf.get(name) ?? '💳', c.amountSatang - c.partnerSatang)
    }
    for (const line of statement.installments) add('ผ่อนชำระบัตรเครดิต', '📅', line.amountThisMonth - line.partnerThisMonth)
  }
  for (const t of listMonth(db, month, today)) {
    if (t.kind !== 'expense' || billIds.has(t.id)) continue
    const name = t.categoryName ?? NO_CATEGORY
    add(name, t.categoryIcon ?? '🏷️', t.amountSatang)
  }
  const spending = [...totals.values()].sort((a, b) => b.totalSatang - a.totalSatang)

  // ---- partner bars ----
  const partnerMonths: PartnerMonth[] = []
  for (let i = PARTNER_MONTHS - 1; i >= 0; i--) {
    const m = addMonths(month, -i)
    let owed = 0
    let paid = 0
    for (const card of cards) {
      const { statement } = statementDueIn(card.id, m)
      if (!statement) continue
      owed += statement.partnerTotal
      paid += statement.partnerPayment?.amountSatang ?? 0
    }
    partnerMonths.push({ month: m, owedSatang: owed, paidSatang: paid })
  }

  return { month, spending, spendingTotal: spending.reduce((s, x) => s + x.totalSatang, 0), partnerMonths }
}