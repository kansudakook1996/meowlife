import { describe, expect, it } from 'vitest'
import { monthHealth } from './summary'
import type { MonthSummary } from './types'

const base: MonthSummary = {
  month: '2026-10',
  incomeTotal: 0,
  incomeReceived: 0,
  expenseTotal: 0,
  expensePaid: 0,
  excludedTotal: 0,
  balance: 0,
  outstanding: 0,
  overdueCount: 0,
  dueSoonCount: 0,
  itemCount: 0,
  expenseByCategory: []
}

const month = (incomeTotal: number, expenseTotal: number, over: Partial<MonthSummary> = {}): MonthSummary => ({
  ...base,
  incomeTotal,
  expenseTotal,
  balance: incomeTotal - expenseTotal,
  itemCount: 2,
  ...over
})

describe('monthHealth', () => {
  it('is empty when nothing has been recorded', () => {
    expect(monthHealth(base).level).toBe('empty')
  })

  it('is a deficit when spending is above income, and says by how much', () => {
    const h = monthHealth(month(3_000_000, 3_250_000))
    expect(h.level).toBe('deficit')
    expect(h.overBy).toBe(250_000)
    expect(monthHealth(month(0, 100)).level).toBe('deficit') // spending with no income at all
  })

  it('grades the margin: under 10% tight, under 20% ok, 20% and over great; zero left is tight, not a deficit', () => {
    expect(monthHealth(month(1_000_000, 1_000_000)).level).toBe('tight')
    expect(monthHealth(month(1_000_000, 910_000)).level).toBe('tight') // 9%
    expect(monthHealth(month(1_000_000, 900_000)).level).toBe('ok') // 10%
    expect(monthHealth(month(1_000_000, 810_000)).level).toBe('ok') // 19%
    expect(monthHealth(month(1_000_000, 800_000)).level).toBe('great') // 20%
    expect(monthHealth(month(1_000_000, 800_000)).savedPercent).toBe(20)
    expect(monthHealth(month(1_000_000, 1_000_000)).overBy).toBe(0)
  })

  it('reports the cash in hand so far separately from the plan', () => {
    const h = monthHealth(month(3_000_000, 1_000_000, { incomeReceived: 0, expensePaid: 400_000 }))
    expect(h.level).toBe('great')
    expect(h.cashSoFar).toBe(-400_000) // salary has not arrived yet but bills are already paid
  })

  it('has no percentage when there is no income', () => {
    expect(monthHealth(month(0, 0, { itemCount: 1 })).savedPercent).toBeNull()
  })
})
