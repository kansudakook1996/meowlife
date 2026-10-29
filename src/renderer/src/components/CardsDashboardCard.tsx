import { formatThaiDate, formatThaiMonth } from '@shared/dates'
import { formatSatang } from '@shared/money'
import { meow, unwrap } from '../lib/api'
import { navigateTo } from '../lib/nav'
import { usePortal } from '../lib/portal'
import { useLoad } from '../lib/useLoad'

/** Dashboard summary of this statement month's credit card bills. Hidden until a card exists. */
export function CardsDashboardCard(): React.JSX.Element | null {
  const { month, dataVersion } = usePortal()
  const { data } = useLoad(`cards-dash:${month}:${dataVersion}`, () => unwrap(meow().portal.cards.overview(month)))
  if (!data || data.cards.length === 0) return null

  return (
    <section className="card" aria-labelledby="cards-dash-title">
      <div className="card-title">
        <h2 id="cards-dash-title">💳 บัตรเครดิต · รอบบิล{formatThaiMonth(month)}</h2>
        <button type="button" className="btn btn-secondary" onClick={() => navigateTo('cards')}>ดูรายละเอียด</button>
      </div>
      <p style={{ marginBottom: 8 }}>
        ต้องจ่ายรวม <strong>{formatSatang(data.totalDue)}</strong>
        <span className="muted small"> (ใช้จ่าย {formatSatang(data.chargesTotal)} + ผ่อน {formatSatang(data.installmentsTotal)})</span>
        {data.totalPartner > 0 && <span className="small"> · ส่วนของเรา <strong>{formatSatang(data.totalMine)}</strong> · แฟนโอนให้ {formatSatang(data.totalPartner)}</span>}
      </p>
      <ul className="tx-list">
        {data.cards.map((c) => (
          <li key={c.card.id} className="tx-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
            <div className="tx-main">
              <div className="tx-title">{c.card.name}</div>
              <div className="tx-meta">
                <span>ครบกำหนด {formatThaiDate(c.dueDate)}</span>
                {c.bill?.isPaid ? (
                  <span className="badge badge-paid"><span aria-hidden="true">✓</span> จ่ายแล้ว</span>
                ) : c.daysToDue !== null && c.daysToDue < 0 && c.mineTotal > 0 ? (
                  <span className="badge badge-overdue"><span aria-hidden="true">!</span> เลยกำหนด {-c.daysToDue} วัน</span>
                ) : c.daysToDue !== null && c.daysToDue <= 5 && c.mineTotal > 0 ? (
                  <span className="badge badge-due_soon"><span aria-hidden="true">⏰</span> {c.daysToDue === 0 ? 'ครบกำหนดวันนี้' : `อีก ${c.daysToDue} วัน`}</span>
                ) : (
                  <span className="badge badge-unpaid"><span aria-hidden="true">○</span> ยังไม่จ่าย</span>
                )}
                {!c.bill && c.mineTotal > 0 && <span className="muted">ยังไม่ได้สร้างรายการจ่ายบิล</span>}
                {c.partnerTotal > 0 && (c.partnerPayment && c.partnerPayment.amountSatang === c.partnerTotal ? <span className="badge badge-paid"><span aria-hidden="true">✓</span> แฟนโอนแล้ว</span> : <span className="badge badge-due_soon"><span aria-hidden="true">○</span> รอแฟนโอน {formatSatang(c.partnerTotal)}</span>)}
              </div>
            </div>
            <span className="tx-amount expense">{formatSatang(c.total)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
