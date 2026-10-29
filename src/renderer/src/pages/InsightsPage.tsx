import { addMonths, formatThaiMonth } from '@shared/dates'
import { formatSatang } from '@shared/money'
import { MOODS } from '@shared/portalModel'
import { trendInsights } from '@shared/trend'
import { CatMascot } from '../components/CatMascot'
import { MonthPicker } from '../components/MonthPicker'
import { meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useLoad } from '../lib/useLoad'

export function InsightsPage(): React.JSX.Element {
  const { month, setMonth, dataVersion } = usePortal()
  const { data, error } = useLoad(`insights:${month}:${dataVersion}`, async () => {
    const [summary, previous, trend, activity] = await Promise.all([
      unwrap(meow().summary.month(month)),
      unwrap(meow().summary.month(addMonths(month, -1))),
      unwrap(meow().reports.trend(month, 6)),
      unwrap(meow().portal.insights.activity(month))
    ])
    return { summary, previous, trend, activity }
  })

  const a = data?.activity
  const lines: string[] = []
  if (data && a) {
    lines.push(...trendInsights(data.trend).slice(0, 2))
    if (a.tasksDone > 0) lines.push(`เดือนนี้ทำงานเสร็จแล้ว ${a.tasksDone} รายการ เก่งมาก!`)
    if (a.journalDays > 0) lines.push(`เขียนบันทึก ${a.journalDays} วัน อารมณ์เฉลี่ย ${a.averageMood} จาก 5`)
    const best = [...a.habits].filter((h) => h.doneDays > 0).sort((x, y) => y.doneDays - x.doneDays)[0]
    if (best) lines.push(`นิสัยที่ทำได้บ่อยที่สุด: ${best.icon} ${best.name} (${best.doneDays} วัน)`)
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>สถิติและข้อสังเกต</h1>
          <p className="muted">ภาพรวมการเงินและกิจกรรมของ{formatThaiMonth(month)}</p>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </header>

      {error && <div className="alert" role="alert">{error}</div>}
      {!data && !error && <div className="loading">กำลังโหลด…</div>}

      {data && a && (
        <>
          <section className="greeting" aria-label="ข้อสังเกตจากเจ๊หมีกับอาจารย์ส้ม">
            <CatMascot mood="happy" size={96} />
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {lines.length === 0 ? <li>เดือนนี้ยังมีข้อมูลไม่มาก ลองจดรายการหรือเขียนบันทึกสักหน่อยนะ</li> : lines.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </section>

          <section className="summary-grid" aria-label="สรุปการเงิน">
            <div className="summary-card summary-income"><span className="label">💰 รายรับ</span><span className="value">{formatSatang(data.summary.incomeTotal)}</span></div>
            <div className="summary-card summary-expense"><span className="label">💸 รายจ่าย</span><span className="value">{formatSatang(data.summary.expenseTotal)}</span><span className="muted small">เดือนก่อน {formatSatang(data.previous.expenseTotal)}</span></div>
            <div className="summary-card summary-balance"><span className="label">🐷 คงเหลือ</span><span className={data.summary.balance < 0 ? 'value negative' : 'value'}>{formatSatang(data.summary.balance)}</span></div>
            <div className="summary-card summary-outstanding"><span className="label">🧾 ค้างชำระ</span><span className="value">{formatSatang(data.summary.outstanding)}</span></div>
          </section>

          <div className="two-col">
            <section className="card" aria-labelledby="ins-tasks">
              <div className="card-title"><h2 id="ins-tasks">✅ งาน</h2></div>
              <p>ทำเสร็จเดือนนี้ <strong>{a.tasksDone}</strong> · ยังค้าง <strong>{a.tasksOpen}</strong>{a.tasksOverdue > 0 && <> · เลยกำหนด <strong>{a.tasksOverdue}</strong></>}</p>
            </section>
            <section className="card" aria-labelledby="ins-journal">
              <div className="card-title"><h2 id="ins-journal">📔 บันทึกและอารมณ์</h2></div>
              <p>
                เขียนบันทึก <strong>{a.journalDays}</strong> วัน
                {a.averageMood !== null && <> · อารมณ์เฉลี่ย <strong>{a.averageMood}</strong>/5 {MOODS[Math.round(a.averageMood) - 1]?.icon}</>}
              </p>
            </section>
          </div>

          <section className="card" aria-labelledby="ins-habits">
            <div className="card-title"><h2 id="ins-habits">🌱 นิสัย</h2></div>
            {a.habits.length === 0 ? <p className="muted">ยังไม่มีนิสัยที่ติดตาม</p> : (
              <ul className="bar-list">
                {a.habits.map((h) => {
                  const pct = h.daysCounted > 0 ? Math.round((h.doneDays / h.daysCounted) * 100) : 0
                  return (
                    <li key={h.id} className="bar-row">
                      <span>{h.icon} {h.name}</span>
                      <span className="small">{h.doneDays}/{h.daysCounted} วัน ({pct}%)</span>
                      <div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="ins-goals">
            <div className="card-title"><h2 id="ins-goals">🎯 เป้าหมาย</h2></div>
            {a.goals.length === 0 ? <p className="muted">ยังไม่มีเป้าหมาย</p> : (
              <ul className="bar-list">
                {a.goals.map((g) => (
                  <li key={g.id} className="bar-row">
                    <span>{g.kind === 'saving' ? '🐷' : '🎯'} {g.title}{g.isDone ? ' ✓' : ''}</span>
                    <span className="small">{g.percent}%</span>
                    <div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ width: `${Math.min(100, g.percent)}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
