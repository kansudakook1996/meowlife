import { formatThaiMonth } from '@shared/dates'
import { formatSatang } from '@shared/money'
import type { MonthSummary, TransactionView } from '@shared/types'
import { CatMascot, type CatMood } from '../components/CatMascot'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { CardsDashboardCard } from '../components/CardsDashboardCard'
import { RemindersCard } from '../components/RemindersCard'
import { MonthPicker } from '../components/MonthPicker'
import { TransactionRow } from '../components/TransactionRow'
import { meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useLoad } from '../lib/useLoad'

interface DashboardData {
  summary: MonthSummary
  bills: TransactionView[]
}

function catMessage(s: MonthSummary): { mood: CatMood; text: string } {
  if (s.itemCount === 0) return { mood: 'sleepy', text: 'เดือนนี้ยังว่างอยู่เลย เริ่มจดรายการแรกกันไหม?' }
  if (s.overdueCount > 0) return { mood: 'worried', text: `มีบิลเลยกำหนด ${s.overdueCount} รายการ ค่อย ๆ จัดการทีละอย่างนะ` }
  if (s.dueSoonCount > 0) return { mood: 'happy', text: `อีกไม่กี่วันมีบิลครบกำหนด ${s.dueSoonCount} รายการ เจ๊หมีกับอาจารย์ส้มช่วยเตือนไว้ก่อนนะ` }
  if (s.balance < 0) return { mood: 'happy', text: 'เดือนนี้ใช้มากกว่ารายรับนิดหน่อย ค่อย ๆ ปรับกันนะ' }
  return { mood: 'cheer', text: 'เก่งมาก! จดรายการต่อเนื่องแบบนี้ เจ๊หมีกับอาจารย์ส้มภูมิใจในตัวคุณ' }
}

export function DashboardPage(): React.JSX.Element {
  const { month, setMonth, dataVersion, openEditor } = usePortal()
  const { data, error, loading } = useLoad<DashboardData>(`${month}:${dataVersion}`, async () => {
    const summary = await unwrap(meow().summary.month(month))
    const bills = await unwrap(meow().transactions.list({ month, kind: 'expense', status: 'not_paid' }))
    bills.sort((a, b) => (a.dueDate ?? a.txnDate).localeCompare(b.dueDate ?? b.txnDate))
    return { summary, bills }
  })

  const s = data?.summary
  const bills = data?.bills ?? []
  const cat = s ? catMessage(s) : null
  const maxCategory = s?.expenseByCategory[0]?.totalSatang ?? 0

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>ภาพรวม</h1>
          <p className="muted">สรุปเงินเข้า-ออกของ{formatThaiMonth(month)}</p>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </header>

      <section className="quick-actions" aria-label="ทางลัด">
        <button type="button" className="btn btn-primary" onClick={() => openEditor({ mode: 'new', kind: 'expense' })}>
          <Icon name="plus" /> จดรายจ่าย
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => openEditor({ mode: 'new', kind: 'income' })}>
          <Icon name="plus" /> จดรายรับ
        </button>
      </section>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {!s && !error && <div className="loading">กำลังโหลด…</div>}

      {s && cat && (
        <>
          <section className="greeting" aria-label="ข้อความจากเจ๊หมีกับอาจารย์ส้ม">
            <CatMascot mood={cat.mood} size={96} />
            <p>{cat.text}</p>
          </section>

          <RemindersCard />
          <CardsDashboardCard />

          <section className="summary-grid" aria-label="สรุปยอด" aria-busy={loading}>
            <div className="summary-card summary-income">
              <span className="label">💰 รายรับ</span>
              <span className="value">{formatSatang(s.incomeTotal)}</span>
              <span className="muted small">ได้รับแล้ว {formatSatang(s.incomeReceived)}</span>
            </div>
            <div className="summary-card summary-expense">
              <span className="label">💸 รายจ่าย</span>
              <span className="value">{formatSatang(s.expenseTotal)}</span>
              <span className="muted small">จ่ายแล้ว {formatSatang(s.expensePaid)}</span>
            </div>
            <div className="summary-card summary-balance">
              <span className="label">🐷 คงเหลือ</span>
              <span className={s.balance < 0 ? 'value negative' : 'value'}>{formatSatang(s.balance)}</span>
              <span className="muted small">รายรับ − รายจ่าย</span>
            </div>
            <div className="summary-card summary-outstanding">
              <span className="label">🧾 ค้างชำระ</span>
              <span className="value">{formatSatang(s.outstanding)}</span>
              <span className="muted small">
                {s.overdueCount > 0 ? `เกินกำหนด ${s.overdueCount} รายการ` : 'ไม่มีรายการเกินกำหนด'}
                {s.dueSoonCount > 0 ? ` · ใกล้ครบ ${s.dueSoonCount}` : ''}
              </span>
            </div>
          </section>

          {s.itemCount === 0 ? (
            <div className="card">
              <EmptyState
                title="ยังไม่มีรายการในเดือนนี้"
                hint="เพิ่มรายรับหรือรายจ่ายแรกได้เลย หรือตั้งรายการประจำ เช่น ค่าเช่า ค่าไฟ ให้แอปสร้างให้ทุกเดือน"
                action={
                  <button type="button" className="btn btn-primary" onClick={() => openEditor({ mode: 'new', kind: 'expense' })}>
                    ＋ เพิ่มรายการแรก
                  </button>
                }
              />
            </div>
          ) : (
            <div className="two-col">
              <section className="card" aria-labelledby="bills-title">
                <div className="card-title">
                  <h2 id="bills-title">🧾 บิลที่ยังไม่จ่าย</h2>
                  <span className="muted small">{bills.length} รายการ</span>
                </div>
                {bills.length === 0 ? (
                  <EmptyState mood="cheer" title="จ่ายครบทุกบิลแล้ว" hint="เดือนนี้ไม่มีรายจ่ายค้างอยู่เลย" />
                ) : (
                  <ul className="tx-list">
                    {bills.map((t) => (
                      <TransactionRow key={t.id} item={t} showDate />
                    ))}
                  </ul>
                )}
              </section>

              <section className="card" aria-labelledby="cat-title">
                <div className="card-title">
                  <h2 id="cat-title">📊 รายจ่ายตามหมวด</h2>
                </div>
                {s.expenseByCategory.length === 0 ? (
                  <p className="muted">ยังไม่มีรายจ่ายในเดือนนี้</p>
                ) : (
                  <ul className="bar-list">
                    {s.expenseByCategory.map((c) => {
                      const percent = s.expenseTotal > 0 ? Math.round((c.totalSatang / s.expenseTotal) * 100) : 0
                      const width = maxCategory > 0 ? (c.totalSatang / maxCategory) * 100 : 0
                      return (
                        <li key={c.categoryId ?? 'none'} className="bar-row">
                          <span>
                            {c.icon} {c.name}
                          </span>
                          <span className="small">
                            {formatSatang(c.totalSatang)} <span className="muted">({percent}%)</span>
                          </span>
                          <div className="bar-track" aria-hidden="true">
                            <div className="bar-fill" style={{ width: `${width}%` }} />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  )
}
