import { useState, type FormEvent } from 'react'
import {
  addDays,
  addMonths,
  formatThaiDate,
  formatThaiMonth,
  monthGrid,
  monthOf,
  startOfWeek,
  THAI_WEEKDAYS_LONG,
  THAI_WEEKDAYS_SHORT,
  todayIso,
  weekdayOf
} from '@shared/dates'
import { CALENDAR_ICONS, groupByDate, type CalendarEvent } from '@shared/calendar'
import { formatSatang } from '@shared/money'
import { MOODS } from '@shared/portalModel'
import { statusLabel } from '@shared/status'
import { errorMessage, meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useLoad } from '../lib/useLoad'

type View = 'month' | 'week' | 'day'

function range(view: View, cursor: string): [string, string] {
  if (view === 'day') return [cursor, cursor]
  if (view === 'week') {
    const s = startOfWeek(cursor)
    return [s, addDays(s, 6)]
  }
  const grid = monthGrid(monthOf(cursor))
  return [grid[0] as string, grid[grid.length - 1] as string]
}

function step(view: View, cursor: string, dir: 1 | -1): string {
  if (view === 'day') return addDays(cursor, dir)
  if (view === 'week') return addDays(cursor, 7 * dir)
  const m = addMonths(monthOf(cursor), dir)
  return `${m}-${String(Math.min(Number(cursor.slice(8)), 28)).padStart(2, '0')}`
}

function chipText(e: CalendarEvent): string {
  if (e.type === 'journal') return `${e.mood ? MOODS[e.mood - 1]?.icon : ''} บันทึก`
  if (e.amountSatang !== undefined) return `${e.title} ${formatSatang(e.amountSatang)}`
  return e.title
}

function chipClass(e: CalendarEvent): string {
  const parts = ['cal-chip', e.type]
  if (e.type === 'bill' && e.status === 'overdue') parts.push('overdue')
  if (e.done) parts.push('done')
  return parts.join(' ')
}

export function CalendarPage(): React.JSX.Element {
  const { dataVersion, refresh, toast } = usePortal()
  const today = todayIso()
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(today)
  const [from, to] = range(view, cursor)
  const { data, error } = useLoad(`cal:${from}:${to}:${dataVersion}`, () => unwrap(meow().portal.calendar.range(from, to)))
  const byDate = groupByDate(data ?? [])

  const title = view === 'month' ? formatThaiMonth(monthOf(cursor)) : view === 'week' ? `${formatThaiDate(from)} – ${formatThaiDate(to)}` : `${THAI_WEEKDAYS_LONG[weekdayOf(cursor)]} ${formatThaiDate(cursor)}`

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>ปฏิทิน</h1>
          <p className="muted">บิลที่ครบกำหนด งาน บันทึก และนิสัยของคุณในที่เดียว</p>
        </div>
        <div className="segmented" role="group" aria-label="มุมมอง">
          {(['month', 'week', 'day'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'month' ? 'เดือน' : v === 'week' ? 'สัปดาห์' : 'วัน'}
            </button>
          ))}
        </div>
      </header>

      <div className="toolbar">
        <div className="month-picker" role="group" aria-label="เลื่อนช่วงเวลา">
          <button type="button" className="icon-btn" aria-label="ก่อนหน้า" title="ก่อนหน้า" onClick={() => setCursor(step(view, cursor, -1))}>‹</button>
          <span className="month-label" aria-live="polite" style={{ minWidth: 220 }}>{title}</span>
          <button type="button" className="icon-btn" aria-label="ถัดไป" title="ถัดไป" onClick={() => setCursor(step(view, cursor, 1))}>›</button>
        </div>
        {cursor !== today && <button type="button" className="btn btn-ghost" onClick={() => setCursor(today)}>วันนี้</button>}
        <span className="muted small" aria-hidden="true">🧾 บิล · ✅ งาน · 💸 รายการ · 📔 บันทึก · 🌱 นิสัย</span>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {view === 'month' && (
        <>
          <div className="cal-grid" role="grid" aria-label={`ปฏิทิน ${title}`}>
            {THAI_WEEKDAYS_SHORT.map((d) => (
              <div key={d} className="cal-head" role="columnheader">{d}</div>
            ))}
            {monthGrid(monthOf(cursor)).map((d) => {
              const events = byDate.get(d) ?? []
              const outside = monthOf(d) !== monthOf(cursor)
              return (
                <button
                  key={d}
                  type="button"
                  role="gridcell"
                  className={`cal-cell${outside ? ' outside' : ''}${d === today ? ' today' : ''}`}
                  aria-pressed={d === cursor}
                  aria-label={`${formatThaiDate(d)} ${events.length > 0 ? `มี ${events.length} รายการ` : 'ไม่มีรายการ'}`}
                  onClick={() => setCursor(d)}
                >
                  <span className="cal-num">{Number(d.slice(8))}</span>
                  {events.slice(0, 3).map((e) => (
                    <span key={e.id + e.type} className={chipClass(e)}>
                      <span aria-hidden="true">{CALENDAR_ICONS[e.type]} </span>
                      {chipText(e)}
                    </span>
                  ))}
                  {events.length > 3 && <span className="muted small">+{events.length - 3} เพิ่มเติม</span>}
                </button>
              )
            })}
          </div>
          <DayPanel date={cursor} events={byDate.get(cursor) ?? []} onChanged={refresh} toast={toast} />
        </>
      )}

      {view === 'week' && (
        <div className="cal-week">
          {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
            <section key={d} aria-label={formatThaiDate(d)} style={d === today ? { outline: '2px solid var(--primary)' } : undefined}>
              <button type="button" className="btn btn-ghost" style={{ width: '100%', whiteSpace: 'normal' }} onClick={() => { setCursor(d); setView('day') }}>
                {THAI_WEEKDAYS_SHORT[weekdayOf(d)]} {Number(d.slice(8))}
              </button>
              {(byDate.get(d) ?? []).map((e) => (
                <div key={e.id + e.type} className={chipClass(e)} style={{ marginTop: 3, whiteSpace: 'normal' }}>
                  <span aria-hidden="true">{CALENDAR_ICONS[e.type]} </span>
                  {chipText(e)}
                </div>
              ))}
              {(byDate.get(d) ?? []).length === 0 && <p className="muted small" style={{ textAlign: 'center' }}>—</p>}
            </section>
          ))}
        </div>
      )}

      {view === 'day' && <DayPanel date={cursor} events={byDate.get(cursor) ?? []} onChanged={refresh} toast={toast} />}
    </div>
  )
}

function DayPanel(props: {
  date: string
  events: CalendarEvent[]
  onChanged: () => void
  toast: (message: string, opts?: { tone?: 'info' | 'error' }) => void
}): React.JSX.Element {
  const [title, setTitle] = useState('')

  const addTask = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!title.trim()) return
    try {
      await unwrap(meow().portal.tasks.create({ title: title.trim(), note: '', dueDate: props.date, repeat: 'none' }))
      setTitle('')
      props.onChanged()
      props.toast(`เพิ่มงานวันที่ ${formatThaiDate(props.date)} แล้ว`)
    } catch (err) {
      props.toast(errorMessage(err), { tone: 'error' })
    }
  }

  const toggleTask = async (id: string, done: boolean): Promise<void> => {
    try {
      await unwrap(meow().portal.tasks.setDone(id, !done))
      props.onChanged()
    } catch (err) {
      props.toast(errorMessage(err), { tone: 'error' })
    }
  }

  return (
    <section className="card" aria-labelledby="day-title">
      <div className="card-title">
        <h2 id="day-title">{THAI_WEEKDAYS_LONG[weekdayOf(props.date)]} {formatThaiDate(props.date)}</h2>
      </div>
      {props.events.length === 0 && <p className="muted">วันนี้ยังไม่มีรายการ</p>}
      <ul className="tx-list">
        {props.events.map((e) => (
          <li key={e.id + e.type} className="tx-row" style={{ gridTemplateColumns: '44px minmax(0, 1fr) auto' }}>
            <span className="tx-icon income" aria-hidden="true">{CALENDAR_ICONS[e.type]}</span>
            <div className="tx-main">
              <div className="tx-title" style={e.done && e.type === 'task' ? { textDecoration: 'line-through' } : undefined}>{e.type === 'journal' ? `บันทึกประจำวัน ${e.mood ? MOODS[e.mood - 1]?.icon : ''}` : e.title}</div>
              <div className="tx-meta">
                <span>{e.type === 'bill' ? 'บิลครบกำหนด' : e.type === 'task' ? 'งาน' : e.type === 'transaction' ? 'รายการรับ-จ่าย' : e.type === 'habit' ? 'นิสัย' : 'บันทึก'}</span>
                {e.status && e.kind && <span className={`badge badge-${e.status}`}>{statusLabel(e.kind, { status: e.status, daysUntilDue: null })}</span>}
              </div>
            </div>
            <div className="tx-actions" style={{ alignItems: 'center' }}>
              {e.amountSatang !== undefined && <span className={`tx-amount ${e.kind ?? 'expense'}`}>{formatSatang(e.amountSatang)}</span>}
              {e.type === 'task' && (
                <button type="button" className="btn btn-secondary" onClick={() => void toggleTask(e.id, Boolean(e.done))}>
                  {e.done ? 'ยกเลิกเสร็จ' : '✓ เสร็จแล้ว'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <form className="toolbar" style={{ marginTop: 12 }} onSubmit={(e) => void addTask(e)}>
        <label className="visually-hidden" htmlFor="day-task">เพิ่มงานในวันนี้</label>
        <input id="day-task" className="input" style={{ flex: '1 1 240px', width: 'auto' }} maxLength={80} placeholder="＋ เพิ่มงานในวันนี้ (กด Enter)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" className="btn btn-secondary">เพิ่มงาน</button>
      </form>
    </section>
  )
}
