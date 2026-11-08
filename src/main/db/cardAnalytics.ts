import { addMonths } from '@shared/dates'
import { groupSpending, type CardAnalytics, type SpendLine } from '@shared/analytics'
import type { CardsOverview } from '@shared/cards'
import { buildOverview, cardBillId, ensureCardRecurringForMonth, listCards, recurringChargeId } from './cardRepo'
import type { Db } from './connection'
import { listMonth } from './transactionRepo'

const NO_CATEGORY = 'ไม่ระบุหมวด'
const INSTALLMENT_CATEGORY = 'ผ่อนชำระบัตรเครดิต'

/** How many months the report looks back, the viewed month included. */
export const REPORT_MONTHS = 6

/**
 * Numbers for the report. Everything is on a "when the money leaves" basis, the same as the ledger: a card statement
 * counts in the month its bill is DUE. Only OUR money counts: whatever the partner pays (whole items or a share) is left out,
 * and so are categories marked "not counted as spending". Each piece is tagged with where it came from (card / instalment /
 * repeating item / other) so a month can be split by source as well as by category.
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

  const categoryRows = db.prepare("SELECT name, icon, excluded FROM categories WHERE deleted_at IS NULL AND kind = 'expense'").all() as unknown as Array<{ name: string; icon: string; excluded: number }>
  const iconOf = new Map<string, string>(categoryRows.map((r) => [r.name, r.icon]))
  // Categories that are not counted as spending (savings…) stay out, whether they come from the ledger or a card.
  const excludedNames = new Set(categoryRows.filter((r) => r.excluded === 1).map((r) => r.name))
  // Card charges made by a repeating rule have a fixed id per rule and month, so they can be told apart from hand-typed ones.
  const ruleIds = (db.prepare('SELECT id FROM card_recurring').all() as unknown as Array<{ id: string }>).map((r) => r.id)

  const linesOf = (m: string): SpendLine[] => {
    const lines: SpendLine[] = []
    const push = (source: SpendLine['source'], category: string, icon: string, satang: number, label = category, labelIcon = icon): void => {
      if (satang > 0 && !excludedNames.has(category)) lines.push({ source, category, icon, label, labelIcon, satang })
    }
    const billIds = new Set<string>()
    for (const card of cards) {
      const { billMonth, statement } = statementDueIn(card.id, m)
      billIds.add(cardBillId(card.id, billMonth))
      if (!statement) continue
      const repeating = new Set(ruleIds.flatMap((id) => [recurringChargeId(id, addMonths(billMonth, -1)), recurringChargeId(id, billMonth)]))
      for (const c of statement.charges) {
        const name = c.category || NO_CATEGORY
        push(repeating.has(c.id) ? 'recurring' : 'card', name, iconOf.get(name) ?? '💳', c.amountSatang - c.partnerSatang)
      }
      for (const line of statement.installments) {
        push('installment', INSTALLMENT_CATEGORY, '📅', line.amountThisMonth - line.partnerThisMonth, line.plan.title)
      }
    }
    for (const t of listMonth(db, m, today)) {
      if (t.kind !== 'expense' || billIds.has(t.id)) continue
      push(t.recurringRuleId ? 'recurring' : 'other', t.categoryName ?? NO_CATEGORY, t.categoryIcon ?? '🏷️', t.amountSatang)
    }
    return lines
  }

  const months = Array.from({ length: REPORT_MONTHS }, (_, i) => {
    const m = addMonths(month, i - (REPORT_MONTHS - 1))
    return groupSpending(m, linesOf(m))
  })
  const current = months[months.length - 1]!
  return { month, spending: current.categories, spendingTotal: current.totalSatang, months }
}
