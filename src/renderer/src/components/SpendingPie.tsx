import { foldSlices, type SpendingSlice } from '@shared/analytics'
import { formatSatang } from '@shared/money'

const COLORS = ['var(--pink)', 'var(--blue)', 'var(--sky)', 'var(--navy)', 'var(--blue-gray)', 'var(--cat-gray)', 'var(--orange-500)']
const R = 70
const C = 2 * Math.PI * R

/**
 * Donut chart of where OUR money went. The table beside it repeats every number (name, share, amount),
 * so the chart never depends on colour alone.
 */
export function SpendingPie({ slices, total }: { slices: SpendingSlice[]; total: number }): React.JSX.Element {
  const shown = foldSlices(slices, COLORS.length)
  const lengths = shown.map((s) => (s.totalSatang / total) * C)
  const offsets = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0))
  return (
    <div className="two-col" style={{ alignItems: 'center' }}>
      <svg viewBox="0 0 200 200" role="img" aria-label={`กราฟวงกลมสัดส่วนการใช้จ่ายของเรา รวม ${formatSatang(total)} ดูตัวเลขในตารางข้างกราฟ`} style={{ width: '100%', maxWidth: 260, height: 'auto', margin: '0 auto' }}>
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--cat-gray)" strokeWidth="36" opacity="0.25" />
        {shown.map((s, i) => {
          const len = lengths[i]!
          return (
            <circle
              key={s.name}
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={COLORS[i % COLORS.length]}
              strokeWidth="36"
              strokeDasharray={`${Math.max(0, len - 1)} ${C - Math.max(0, len - 1)}`}
              strokeDashoffset={-offsets[i]!}
              transform="rotate(-90 100 100)"
            />
          )
        })}
        <text x="100" y="95" textAnchor="middle" fontSize="11" fill="var(--text)">ใช้จ่ายจริงของเรา</text>
        <text x="100" y="115" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--text)">{formatSatang(total)}</text>
      </svg>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" aria-label="สัดส่วนการใช้จ่ายตามหมวด">
          <thead>
            <tr>
              <th>หมวด</th>
              <th style={{ textAlign: 'right' }}>สัดส่วน</th>
              <th style={{ textAlign: 'right' }}>จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s, i) => (
              <tr key={s.name}>
                <td>
                  <span aria-hidden="true" style={{ color: COLORS[i % COLORS.length], fontSize: '1.1em' }}>●</span> {s.icon} {s.name}
                </td>
                <td style={{ textAlign: 'right' }}>{Math.round((s.totalSatang / total) * 100)}%</td>
                <td style={{ textAlign: 'right' }}>{formatSatang(s.totalSatang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}