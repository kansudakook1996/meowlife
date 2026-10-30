import { sumSatang } from './money'
import type { CategoryTotal, MonthSummary, TransactionView } from './types'

const UNCATEGORIZED = { name: 'ไม่ระบุหมวด', icon: '🏷️' }

/** Monthly totals. `items` must already be the non-deleted items of `month`. */
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
