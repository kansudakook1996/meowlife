import { formatThaiDate, todayIso } from '@shared/dates'
import { formatSatang } from '@shared/money'
import { errorMessage, meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useLoad } from '../lib/useLoad'

/** "วันนี้ต้องดูแล": tasks due today or overdue and bills that are overdue or due soon. Hidden when nothing is due. */
export function RemindersCard(): React.JSX.Element | null {
  const { dataVersion, refresh, toast } = usePortal()
  const today = todayIso()
  const { data } = useLoad(`reminders:${dataVersion}`, () => unwrap(meow().portal.reminders.due()))
  if (!data || (data.tasks.length === 0 && data.bills.length === 0)) return null

  const done = async (id: string): Promise<void> => {
    try {
      await unwrap(meow().portal.tasks.setDone(id, true))
      refresh()
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    }
  }

  return (
    <section className="card reminder-card" aria-labelledby="remind-card-title">
      <div className="card-title">
        <h2 id="remind-card-title">🔔 วันนี้ต้องดูแล</h2>
        <span className="muted small">ค่อย ๆ ทำไปทีละอย่างนะ</span>
      </div>
      <ul className="tx-list">
        {data.tasks.map((t) => (
          <li key={t.id} className="tx-row" style={{ gridTemplateColumns: '44px minmax(0, 1fr) auto' }}>
            <span className="tx-icon income" aria-hidden="true">✅</span>
            <div className="tx-main">
              <div className="tx-title">{t.title}</div>
              <div className="tx-meta">
                <span className={t.dueDate && t.dueDate < today ? 'badge badge-overdue' : 'badge badge-due_soon'}>
                  <span aria-hidden="true">{t.dueDate && t.dueDate < today ? '!' : '⏰'}</span> งาน · {t.dueDate ? formatThaiDate(t.dueDate) : ''}
                </span>
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => void done(t.id)}>✓ เสร็จแล้ว</button>
          </li>
        ))}
        {data.bills.map((b) => (
          <li key={b.id} className="tx-row" style={{ gridTemplateColumns: '44px minmax(0, 1fr) auto' }}>
            <span className="tx-icon expense" aria-hidden="true">🧾</span>
            <div className="tx-main">
              <div className="tx-title">{b.title}</div>
              <div className="tx-meta">
                <span className={`badge badge-${b.status}`}>
                  <span aria-hidden="true">{b.status === 'overdue' ? '!' : '⏰'}</span>{' '}
                  {b.status === 'overdue' ? `เกินกำหนด ${Math.abs(b.daysUntilDue ?? 0)} วัน` : b.daysUntilDue === 0 ? 'ครบกำหนดวันนี้' : `อีก ${b.daysUntilDue} วันครบกำหนด`}
                </span>
              </div>
            </div>
            <span className="tx-amount expense">{formatSatang(b.amountSatang)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
