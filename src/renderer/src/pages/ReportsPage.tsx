import { addMonths, formatThaiMonth } from '@shared/dates'
import { formatSatang } from '@shared/money'
import { categoryChanges, trendInsights } from '@shared/trend'
import { CatMascot } from '../components/CatMascot'
import { MonthHealthBanner } from '../components/MonthHealthBanner'
import { MonthPicker } from '../components/MonthPicker'
import { SpendBySource } from '../components/SpendBySource'
import { SpendHistory } from '../components/SpendHistory'
import { SpendingPie } from '../components/SpendingPie'
import { TrendChart } from '../components/TrendChart'
import { meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useLoad } from '../lib/useLoad'

const TREND_MONTHS = 6

export function ReportsPage(): React.JSX.Element {
  const { month, setMonth, dataVersion } = usePortal()
  const { data, error } = useLoad(`report:${month}:${dataVersion}`, async () => {
    const [summary, previous, trend, analytics] = await Promise.all([
      unwrap(meow().summary.month(month)),
      unwrap(meow().summary.month(addMonths(month, -1))),
      unwrap(meow().reports.trend(month, TREND_MONTHS)),
      unwrap(meow().portal.cards.analytics(month))
    ])
    return { summary, previous, trend, analytics }
  })

  const insights = data ? trendInsights(data.trend) : []
  const thisMonth = data?.analytics.months.at(-1)
  const lastMonth = data?.analytics.months.at(-2)
  // Compared on OUR real spending (card statements split into what they are made of), not on the card bill as one lump.
  const changes = thisMonth && lastMonth ? categoryChanges(thisMonth.categories, lastMonth.categories) : []

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>รายงาน</h1>
          <p className="muted">สรุปรายเดือนและแนวโน้ม {TREND_MONTHS} เดือนล่าสุดถึง{formatThaiMonth(month)}</p>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </header>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {!data && !error && <div className="loading">กำลังโหลด…</div>}

      {data && (
        <>
          <MonthHealthBanner summary={data.summary} />
          <section className="summary-grid" aria-label="สรุปเดือนนี้">
            <div className="summary-card summary-income">
              <span className="label">💰 รายรับ</span>
              <span className="value">{formatSatang(data.summary.incomeTotal)}</span>
            </div>
            <div className="summary-card summary-expense">
              <span className="label">💸 รายจ่าย</span>
              <span className="value">{formatSatang(data.summary.expenseTotal)}</span>
              <span className="muted small">เดือนก่อน {formatSatang(data.previous.expenseTotal)}</span>
              {data.summary.excludedTotal > 0 && <span className="muted small">ไม่นับเป็นรายจ่าย {formatSatang(data.summary.excludedTotal)}</span>}
            </div>
            <div className="summary-card summary-balance">
              <span className="label">🐷 คงเหลือ</span>
              <span className={data.summary.balance < 0 ? 'value negative' : 'value'}>{formatSatang(data.summary.balance)}</span>
            </div>
            <div className="summary-card summary-outstanding">
              <span className="label">🧾 ค้างชำระ</span>
              <span className="value">{formatSatang(data.summary.outstanding)}</span>
            </div>
          </section>

          {thisMonth && (
            <section className="card" aria-labelledby="source-title">
              <div className="card-title">
                <h2 id="source-title">🗂️ รายจ่ายของเรา {formatThaiMonth(month)} แยกตามที่มา</h2>
                <strong>{formatSatang(thisMonth.totalSatang)}</strong>
              </div>
              <p className="muted small" style={{ marginBottom: 10 }}>
                นับเฉพาะเงินของเรา (ไม่รวมส่วนที่แฟนจ่าย และหมวดที่ตั้งเป็น "ไม่นับเป็นรายจ่าย") ยอดบัตรนับในเดือนที่บิลครบกำหนด
              </p>
              <SpendBySource spend={thisMonth} />
            </section>
          )}

          <section className="card" aria-labelledby="history-title">
            <div className="card-title">
              <h2 id="history-title">📆 รายจ่ายของเราแต่ละเดือน แยกตามที่มา</h2>
            </div>
            <SpendHistory months={data.analytics.months} />
          </section>

          <section className="card" aria-labelledby="pie-title">
            <div className="card-title">
              <h2 id="pie-title">🥧 สัดส่วนการใช้จ่ายจริงของเรา แยกตามหมวด</h2>
            </div>
            {data.analytics.spending.length === 0 ? (
              <p className="muted">ยังไม่มีรายจ่ายในเดือนนี้</p>
            ) : (
              <>
                <SpendingPie slices={data.analytics.spending} total={data.analytics.spendingTotal} />
                <p className="muted small" style={{ marginTop: 8 }}>
                  รวมรายจ่ายในรายการรับ-จ่ายกับยอดที่ใช้บัตรเครดิต (บิลบัตรที่ครบกำหนดเดือนนี้) โดย <strong>ตัดส่วนที่แฟนจ่ายออกแล้ว</strong> และไม่นับรายการจ่ายบิลบัตรซ้ำ
                </p>
              </>
            )}
          </section>

          <section className="card" aria-labelledby="catrep-title">
            <div className="card-title">
              <h2 id="catrep-title">📊 หมวดที่ใช้ เทียบเดือนก่อน</h2>
            </div>
            {changes.length === 0 ? (
              <p className="muted">ยังไม่มีรายจ่ายในสองเดือนนี้</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" aria-label="รายจ่ายตามหมวดเทียบเดือนก่อน">
                  <thead>
                    <tr>
                      <th>หมวด</th>
                      <th style={{ textAlign: 'right' }}>เดือนนี้</th>
                      <th style={{ textAlign: 'right' }}>สัดส่วน</th>
                      <th style={{ textAlign: 'right' }}>เดือนก่อน</th>
                      <th style={{ textAlign: 'right' }}>เปลี่ยนแปลง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((c) => {
                      const share = thisMonth && thisMonth.totalSatang > 0 ? Math.round((c.current / thisMonth.totalSatang) * 100) : 0
                      return (
                        <tr key={c.name}>
                          <td>{c.name}</td>
                          <td style={{ textAlign: 'right' }}>{formatSatang(c.current)}</td>
                          <td style={{ textAlign: 'right' }}>{c.current > 0 ? `${share}%` : '—'}</td>
                          <td style={{ textAlign: 'right' }}>{formatSatang(c.previous)}</td>
                          <td style={{ textAlign: 'right' }}>
                            {c.diff === 0 ? '＝ เท่าเดิม' : c.diff > 0 ? `▲ เพิ่ม ${formatSatang(c.diff)}` : `▼ ลด ${formatSatang(-c.diff)}`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="trend-title">
            <div className="card-title">
              <h2 id="trend-title">📈 รายรับ-รายจ่าย {TREND_MONTHS} เดือน</h2>
            </div>
            <TrendChart months={data.trend} />
            <div className="greeting" style={{ marginTop: 14, boxShadow: 'none', background: 'var(--bg)' }}>
              <CatMascot mood="happy" size={80} />
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {insights.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
