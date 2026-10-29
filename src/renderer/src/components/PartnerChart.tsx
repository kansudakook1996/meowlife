import type { PartnerMonth } from '@shared/analytics'
import { formatSatang } from '@shared/money'

const monthName = new Intl.DateTimeFormat('th-TH', { month: 'short', timeZone: 'UTC' })
const shortLabel = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return monthName.format(new Date(Date.UTC(y, m - 1, 1)))
}

const W = 640
const H = 240
const PAD = { top: 22, right: 12, bottom: 34, left: 12 }

const label = (satang: number): string => {
  const baht = satang / 100
  return baht >= 1000 ? `฿${(baht / 1000).toFixed(baht >= 10000 ? 0 : 1)}k` : `฿${Math.round(baht)}`
}

/**
 * What the partner owes for the card bills due in each month (outlined bar) and what they have actually transferred
 * (solid bar). Values are written on the bars and repeated in the table.
 */
export function PartnerChart({ months }: { months: PartnerMonth[] }): React.JSX.Element {
  const max = Math.max(1, ...months.flatMap((m) => [m.owedSatang, m.paidSatang]))
  const slot = (W - PAD.left - PAD.right) / months.length
  const barW = Math.min(34, slot / 2 - 6)
  const plotH = H - PAD.top - PAD.bottom
  const y = (v: number): number => PAD.top + plotH - (v / max) * plotH
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`กราฟแท่งยอดที่แฟนต้องโอนและโอนแล้ว ${months.length} เดือน ดูตัวเลขจริงในตารางด้านล่าง`} style={{ width: '100%', height: 'auto' }}>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--gray-300)" />
        {months.map((m, i) => {
          const cx = PAD.left + slot * i + slot / 2
          return (
            <g key={m.month}>
              <rect x={cx - barW - 2} y={y(m.owedSatang)} width={barW} height={y(0) - y(m.owedSatang)} rx="3" fill="var(--sky)" stroke="var(--navy)" strokeWidth="2" />
              <rect x={cx + 2} y={y(m.paidSatang)} width={barW} height={y(0) - y(m.paidSatang)} rx="3" fill="var(--blue)" />
              {m.owedSatang > 0 && <text x={cx - barW / 2 - 2} y={y(m.owedSatang) - 4} textAnchor="middle" fontSize="10" fill="var(--text)">{label(m.owedSatang)}</text>}
              {m.paidSatang > 0 && <text x={cx + barW / 2 + 2} y={y(m.paidSatang) - 4} textAnchor="middle" fontSize="10" fill="var(--text)">{label(m.paidSatang)}</text>}
              <text x={cx} y={H - 12} textAnchor="middle" fontSize="12" fill="var(--text)">{shortLabel(m.month)}</text>
            </g>
          )
        })}
      </svg>
      <p className="small" aria-hidden="true">
        <span style={{ color: 'var(--navy)' }}>▢</span> แฟนต้องโอน &nbsp; <span style={{ color: 'var(--blue)' }}>■</span> แฟนโอนแล้ว
      </p>
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table className="data-table" aria-label="ยอดที่แฟนโอนให้รายเดือน">
          <thead>
            <tr>
              <th>เดือนที่บิลครบกำหนด</th>
              <th style={{ textAlign: 'right' }}>แฟนต้องโอน</th>
              <th style={{ textAlign: 'right' }}>แฟนโอนแล้ว</th>
              <th style={{ textAlign: 'right' }}>ค้างอยู่</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <td>{shortLabel(m.month)}</td>
                <td style={{ textAlign: 'right' }}>{formatSatang(m.owedSatang)}</td>
                <td style={{ textAlign: 'right' }}>{formatSatang(m.paidSatang)}</td>
                <td style={{ textAlign: 'right' }}>{m.owedSatang > m.paidSatang ? formatSatang(m.owedSatang - m.paidSatang) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}