import { sumSatang } from './money'
import type { CategoryTotal, MonthSummary, TransactionView } from './types'

const UNCATEGORIZED = { name: 'ไม่ระบุหมวด', icon: '🏷️' }

/** Monthly totals. `items` must already be the non-deleted items of `month`. */
export type HealthLevel = 'empty' | 'deficit' | 'tight' | 'ok' | 'great'

export interface MonthHealth {
  level: HealthLevel
  /** Share of the income that is left after spending, in whole percent; null when there is no income. */
  savedPercent: number | null
  /** Money received so far minus money paid so far (what is actually in hand, not the plan). */
  cashSoFar: number
  /** How far the spending is above the income (0 when it is not). */
  overBy: number
}

/** A plain verdict on the month: red when spending is above income, then thinner and thinner margins. */
export function monthHealth(s: MonthSummary): MonthHealth {
  const cashSoFar = s.incomeReceived - s.expensePaid
  const overBy = Math.max(0, -s.balance)
  const savedPercent = s.incomeTotal > 0 ? Math.floor((s.balance * 100) / s.incomeTotal) : null
  let level: HealthLevel
  if (s.incomeTotal === 0 && s.expenseTotal === 0) level = 'empty'
  else if (s.balance < 0) level = 'deficit'
  else if (savedPercent === null || savedPercent < 10) level = 'tight'
  else if (savedPercent < 20) level = 'ok'
  else level = 'great'
  return { level, savedPercent, cashSoFar, overBy }
}

export function summarizeMonth(month: string, items: TransactionView[]): MonthSummary {
  const income = items.filter((t) => t.kind === 'income')
  const allExpense = items.filter((t) => t.kind === 'expense')
  // Savings and the like are still money to pay, but they are not spending.
  const expense = allExpense.filter((t) => !t.categoryExcluded)
  const excludedTotal = sumSatang(allExpense.filter((t) => t.categoryExcluded).map((t) => t.amountSatang))

  const incomeTotal = sumSatang(income.map((t) => t.amountSatang))
  const incomeReceived = sumSatang(income.filter((t) => t.isPaid).map((t) => t.amountSatang))
  const expenseTotal = sumSatang(expense.map((t) => t.amountSatang))
  const expensePaid = sumSatang(expense.filter((t) => t.isPaid).map((t) => t.amountSatang))

  const byCategory = new Map<string, CategoryTotal>()
  for (const t of expense) {
    const key = t.categoryId ?? ''
    const current = byCategory.get(key) ?? {
      categoryId: t.categoryId,
      name: t.categoryName ?? UNCATEGORIZED.name,
      icon: t.categoryIcon ?? UNCATEGORIZED.icon,
      totalSatang: 0
    }
    current.totalSatang = sumSatang([current.totalSatang, t.amountSatang])
    byCategory.set(key, current)
  }

  return {
    month,
    incomeTotal,
    incomeReceived,
    expenseTotal,
    expensePaid,
    excludedTotal,
    balance: incomeTotal - expenseTotal,
    outstanding: sumSatang(allExpense.filter((t) => !t.isPaid).map((t) => t.amountSatang)),
    overdueCount: allExpense.filter((t) => t.status === 'overdue').length,
    dueSoonCount: allExpense.filter((t) => t.status === 'due_soon').length,
    itemCount: items.length,
    expenseByCategory: [...byCategory.values()].sort((a, b) => b.totalSatang - a.totalSatang)
  }
}
