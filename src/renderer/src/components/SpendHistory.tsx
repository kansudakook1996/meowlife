import { SPEND_SOURCES, type MonthSpend, type SpendSource } from '@shared/analytics'
import { formatThaiMonth } from '@shared/dates'
import { formatSatang } from '@shared/money'

const monthName = new Intl.DateTimeFormat('th-TH', { month: 'short', timeZone: 'UTC' })
const shortLabel = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return monthName.format(new Date(Date.UTC(y, m - 1, 1)))
}

const COLORS: Record<SpendSource, string> = {
  card: 'var(--pink)',
  installment: 'var(--blue)',
  recurring: 'var(--sky)',
  other: 'var(--cat-gray)'
}

const W = 640
const H = 240
const PAD = { top: 22, right: 12, bottom: 34, left: 12 }

const compact = (satang: number): string => {
  const baht = satang / 100
  if (baht >= 1_000_000) return `฿${(baht / 1_000_000).toFixed(baht >= 10_000_000 ? 0 : 1)}M`
  return baht >= 1000 ? `฿${(baht / 1000).toFixed(baht >= 10000 ? 0 : 1)}k` : `฿${Math.round(baht)}`
}

/**
 * Our spending per month stacked by where it came from (card, instalments, repeating items, other).
 * The table under the chart repeats every number, so nothing depends on colour alone.
 */
export function SpendHistory({ months }: { months: MonthSpend[] }): React.JSX.Element {
  const max = Math.max(1, ...months.map((m) => m.totalSatang))
  const slot = (W - PAD.left - PAD.right) / months.length
  const barW = Math.min(52, slot - 18)
  const plotH = H - PAD.top - PAD.bottom
  const base = PAD.top + plotH
  const scale = (v: number): number => (v / max) * plotH

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`กราฟรายจ่ายของเรา ${months.length} เดือนล่าสุด แยกตามบัตรเครดิต ผ่อน รายการประจำ และอื่น ๆ ดูตัวเลขจริงในตารางด้านล่าง`} style={{ width: '100%', height: 'auto' }}>
        <line x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} stroke="var(--gray-300)" />
        {months.map((m, i) => {
          const cx = PAD.left + slot * i + slot / 2
          let top = base
          return (
            <g key={m.month}>
              {m.sources.map((s) => {
                const h = scale(s.totalSatang)
                top -= h
                return h > 0 ? <rect key={s.source} x={cx - barW / 2} y={top} width={barW} height={h} fill={COLORS[s.source]} stroke="var(--navy)" strokeWidth="1" /> : null
              })}
              {m.totalSatang > 0 && (
                <text x={cx} y={base - scale(m.totalSatang) - 4} textAnchor="middle" fontSize="10" fill="var(--text)">
                  {compact(m.totalSatang)}
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
        {SPEND_SOURCES.map((s) => (
          <span key={s.key} style={{ marginRight: 14 }}>
            <span style={{ color: COLORS[s.key] }}>■</span> {s.icon} {s.label}
          </span>
        ))}
      </p>
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table className="data-table" aria-label="รายจ่ายของเราแต่ละเดือนแยกตามที่มา">
          <thead>
            <tr>
              <th>เดือน</th>
              {SPEND_SOURCES.map((s) => (
                <th key={s.key} style={{ textAlign: 'right' }}>
                  {s.label}
                </th>
              ))}
              <th style={{ textAlign: 'right' }}>รวม</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <td>{formatThaiMonth(m.month)}</td>
                {m.sources.map((s) => (
                  <td key={s.source} style={{ textAlign: 'right' }}>
                    {s.totalSatang > 0 ? formatSatang(s.totalSatang) : '—'}
                  </td>
                ))}
                <td style={{ textAlign: 'right' }}>
                  <strong>{m.totalSatang > 0 ? formatSatang(m.totalSatang) : '—'}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
