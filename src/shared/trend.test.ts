import { describe, expect, it } from 'vitest'
import { categoryChanges, fillMonths, trendInsights } from './trend'

describe('fillMonths', () => {
  it('returns consecutive months across a year end with zeros for gaps', () => {
    const rows = fillMonths('2027-02', 4, [
      { month: '2026-12', kind: 'expense', total: 1000 },
      { month: '2026-12', kind: 'income', total: 5000 },
      { month: '2027-02', kind: 'expense', total: 300 }
    ])
    expect(rows.map((r) => r.month)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    expect(rows[0]).toEqual({ month: '2026-11', incomeTotal: 0, expenseTotal: 0, balance: 0 })
    expect(rows[1]).toMatchObject({ incomeTotal: 5000, expenseTotal: 1000, balance: 4000 })
    expect(rows[3]).toMatchObject({ expenseTotal: 300, balance: -300 })
  })
})

describe('trendInsights', () => {
  const m = (month: string, income: number, expense: number) => ({ month, incomeTotal: income, expenseTotal: expense, balance: income - expense })

  it('asks for more data when empty', () => {
    expect(trendInsights([m('2026-09', 0, 0), m('2026-10', 0, 0)])[0]).toContain('ยังไม่มีข้อมูลพอ')
  })

  it('describes the month-over-month change kindly', () => {
    const more = trendInsights([m('2026-09', 100000, 100000), m('2026-10', 100000, 125000)])
    expect(more[0]).toContain('มากกว่าเดือนก่อนประมาณ 25%')
    const less = trendInsights([m('2026-09', 100000, 100000), m('2026-10', 100000, 80000)])
    expect(less[0]).toContain('น้อยกว่าเดือนก่อนประมาณ 20% เก่งมาก')
    const same = trendInsights([m('2026-09', 0, 100000), m('2026-10', 0, 100000)])
    expect(same[0]).toContain('ใกล้เคียง')
  })

  it('reports average, peak month and months with money left', () => {
    const lines = trendInsights([m('2026-08', 500000, 200000), m('2026-09', 500000, 600000), m('2026-10', 500000, 100000)])
    expect(lines.join('\n')).toContain('เฉลี่ยต่อเดือน ฿3,000.00') // (2,000 + 6,000 + 1,000) / 3 baht
    expect(lines.join('\n')).toContain('กันยายน 2569')
    expect(lines.join('\n')).toContain('2 จาก 3 เดือน')
  })
})

describe('categoryChanges', () => {
  it('lists the biggest changes first, including categories that appear or disappear', () => {
    const out = categoryChanges(
      [
        { name: 'อาหาร', totalSatang: 5000 },
        { name: 'เดินทาง', totalSatang: 1000 }
      ],
      [
        { name: 'อาหาร', totalSatang: 4000 },
        { name: 'ช้อปปิ้ง', totalSatang: 9000 }
      ]
    )
    expect(out.map((c) => [c.name, c.diff])).toEqual([
      ['ช้อปปิ้ง', -9000],
      ['อาหาร', 1000],
      ['เดินทาง', 1000]
    ])
  })
})
