import { addMonths, formatThaiMonth } from './dates'
import { formatSatang } from './money'

export interface MonthTotals {
  month: string
  incomeTotal: number
  expenseTotal: number
  balance: number
}

/** `count` consecutive months ending at `endMonth`, filling months without data with zeros. */
export function fillMonths(endMonth: string, count: number, found: Array<{ month: string; kind: 'income' | 'expense'; total: number }>): MonthTotals[] {
  const out: MonthTotals[] = []
  for (let i = count - 1; i >= 0; i--) {
    const month = addMonths(endMonth, -i)
    const income = found.filter((f) => f.month === month && f.kind === 'income').reduce((s, f) => s + f.total, 0)
    const expense = found.filter((f) => f.month === month && f.kind === 'expense').reduce((s, f) => s + f.total, 0)
    out.push({ month, incomeTotal: income, expenseTotal: expense, balance: income - expense })
  }
  return out
}

/**
 * Gentle one-line observations about spending (never scolding).
 * `months` is oldest → newest and ends with the month being viewed.
 */
export function trendInsights(months: MonthTotals[]): string[] {
  const out: string[] = []
  const withData = months.filter((m) => m.expenseTotal > 0 || m.incomeTotal > 0)
  if (withData.length === 0) return ['ยังไม่มีข้อมูลพอสำหรับดูแนวโน้ม เริ่มจดรายการสัก 2–3 เดือนนะ']

  const current = months[months.length - 1]
  const previous = months[months.length - 2]
  if (current && previous && previous.expenseTotal > 0 && current.expenseTotal > 0) {
    const change = ((current.expenseTotal - previous.expenseTotal) / previous.expenseTotal) * 100
    const rounded = Math.round(Math.abs(change))
    if (rounded === 0) out.push('รายจ่ายเดือนนี้ใกล้เคียงกับเดือนก่อน')
    else if (change > 0) out.push(`รายจ่ายเดือนนี้มากกว่าเดือนก่อนประมาณ ${rounded}% (${formatSatang(current.expenseTotal - previous.expenseTotal)})`)
    else out.push(`รายจ่ายเดือนนี้น้อยกว่าเดือนก่อนประมาณ ${rounded}% เก่งมาก! (ประหยัดไป ${formatSatang(previous.expenseTotal - current.expenseTotal)})`)
  }

  const spendMonths = months.filter((m) => m.expenseTotal > 0)
  if (spendMonths.length >= 2) {
    const avg = Math.round(spendMonths.reduce((s, m) => s + m.expenseTotal, 0) / spendMonths.length)
    out.push(`รายจ่ายเฉลี่ยต่อเดือน ${formatSatang(avg)} (จาก ${spendMonths.length} เดือนที่มีข้อมูล)`)
    const top = spendMonths.reduce((a, b) => (b.expenseTotal > a.expenseTotal ? b : a))
    out.push(`เดือนที่ใช้มากที่สุดคือ${formatThaiMonth(top.month)} (${formatSatang(top.expenseTotal)})`)
  }

  const saved = months.filter((m) => m.balance > 0).length
  if (withData.length >= 2) out.push(`เหลือเงินในเดือนที่ผ่านมา ${saved} จาก ${withData.length} เดือน`)
  return out
}

/** Compare category totals of this month with the previous month, biggest absolute change first. */
export function categoryChanges(
  current: Array<{ name: string; totalSatang: number }>,
  previous: Array<{ name: string; totalSatang: number }>
): Array<{ name: string; current: number; previous: number; diff: number }> {
  const names = new Set([...current.map((c) => c.name), ...previous.map((p) => p.name)])
  return [...names]
    .map((name) => {
      const c = current.find((x) => x.name === name)?.totalSatang ?? 0
      const p = previous.find((x) => x.name === name)?.totalSatang ?? 0
      return { name, current: c, previous: p, diff: c - p }
    })
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
}
