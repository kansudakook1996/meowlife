import { SPEND_SOURCES, type MonthSpend } from '@shared/analytics'
import { formatSatang } from '@shared/money'

/** One month of our spending: a block per source with its total and what it is made of (categories, or plans for instalments). */
export function SpendBySource({ spend }: { spend: MonthSpend }): React.JSX.Element {
  return (
    <div className="two-col">
      {SPEND_SOURCES.map((meta) => {
        const s = spend.sources.find((x) => x.source === meta.key)!
        const share = spend.totalSatang > 0 ? Math.round((s.totalSatang / spend.totalSatang) * 100) : 0
        return (
          <section key={meta.key} className="card" aria-label={`${meta.label}: ${formatSatang(s.totalSatang)}`} style={{ boxShadow: 'none' }}>
            <div className="card-title">
              <h3 style={{ margin: 0 }}>
                <span aria-hidden="true">{meta.icon}</span> {meta.label}
              </h3>
              <strong>{formatSatang(s.totalSatang)}</strong>
            </div>
            <p className="muted small">
              {meta.hint}
              {s.totalSatang > 0 ? ` · ${share}% ของรายจ่ายเดือนนี้` : ''}
            </p>
            {s.items.length === 0 ? (
              <p className="muted small">ไม่มีรายการในเดือนนี้</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {s.items.map((it) => (
                  <li key={it.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0' }}>
                    <span>
                      {it.icon} {it.name}
                    </span>
                    <span>{formatSatang(it.totalSatang)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
