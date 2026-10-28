import { formatSatang } from '@shared/money'
import type { MonthTotals } from '@shared/trend'

const monthName = new Intl.DateTimeFormat('th-TH', { month: 'short', timeZone: 'UTC' })

function shortLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return monthName.format(new Date(Date.UTC(y, m - 1, 1)))
}

const W = 640
const H = 240
const PAD = { top: 22, right: 12, bottom: 34, left: 12 }

/**
 * Income (blue, solid) and expense (orange, striped) bars per month.
 * Every bar has its value written on top, and the data table below the chart repeats the numbers,
 * so nothing depends on colour alone.
 */
export function TrendChart({ months }: { months: MonthTotals[] }): React.JSX.Element {
  const max = Math.max(1, ...months.flatMap((m) => [m.incomeTotal, m.expenseTotal]))
  const slot = (W - PAD.left - PAD.right) / months.length
  const barW = Math.min(34, slot / 2 - 6)
  const plotH = H - PAD.top - PAD.bottom
  const y = (v: number): number => PAD.top + plotH - (v / max) * plotH
  const label = (satang: number): string => {
    const baht = satang / 100
    if (baht >= 1_000_000) return `฿${(baht / 1_000_000).toFixed(baht >= 10_000_000 ? 0 : 1)}M`
    return baht >= 1000 ? `฿${(baht / 1000).toFixed(baht >= 10000 ? 0 : 1)}k` : `฿${Math.round(baht)}`
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`กราฟรายรับและรายจ่าย ${months.length} เดือนล่าสุด ดูตัวเลขจริงในตารางด้านล่าง`} style={{ width: '100%', height: 'auto' }}>
        <defs>
          <pattern id="stripe" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--orange-500)" />
            <rect width="3" height="6" fill="var(--orange-700)" />
          </pattern>
        </defs>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--gray-300)" />
        {months.map((m, i) => {
          const cx = PAD.left + slot * i + slot / 2
          return (
            <g key={m.month}>
              <rect x={cx - barW - 2} y={y(m.incomeTotal)} width={barW} height={y(0) - y(m.incomeTotal)} rx="3" fill="var(--blue-600)" />
              <rect x={cx + 2} y={y(m.expenseTotal)} width={barW} height={y(0) - y(m.expenseTotal)} rx="3" fill="url(#stripe)" />
              {m.incomeTotal > 0 && (
                <text x={cx - barW / 2 - 2} y={y(m.incomeTotal) - 4} textAnchor="middle" fontSize="10" fill="var(--text)">
                  {label(m.incomeTotal)}
                </text>
              )}
              {m.expenseTotal > 0 && (
                <text x={cx + barW / 2 + 2} y={y(m.expenseTotal) - 4} textAnchor="middle" fontSize="10" fill="var(--text)">
                  {label(m.expenseTotal)}
                </text>
              )}
              <text x={cx} y={H - 12} textAnchor="middle" fontSize="12" fill="var(--text)">
                {shortLabel(m.month)}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="small" aria-hidden="true">
        <span style={{ color: 'var(--blue-600)' }}>■</span> รายรับ &nbsp; <span style={{ color: 'var(--orange-700)' }}>▨</span> รายจ่าย
      </p>
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table className="data-table" aria-label="ตัวเลขรายรับรายจ่ายรายเดือน">
          <thead>
            <tr>
              <th>เดือน</th>
              <th style={{ textAlign: 'right' }}>รายรับ</th>
              <th style={{ textAlign: 'right' }}>รายจ่าย</th>
              <th style={{ textAlign: 'right' }}>คงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <td>{shortLabel(m.month)}</td>
                <td style={{ textAlign: 'right' }}>{formatSatang(m.incomeTotal)}</td>
                <td style={{ textAlign: 'right' }}>{formatSatang(m.expenseTotal)}</td>
                <td style={{ textAlign: 'right' }} className={m.balance < 0 ? 'negative' : undefined}>
                  {formatSatang(m.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
