import { useState, type FormEvent } from 'react'
import { diffDays, formatThaiDate, todayIso } from '@shared/dates'
import type { Task, TaskInput, TaskRepeat } from '@shared/portalModel'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import { errorMessage, meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useDeleteWithUndo } from '../lib/portalApi'
import { useLoad } from '../lib/useLoad'

const REPEAT_LABEL: Record<TaskRepeat, string> = { none: 'ไม่ทำซ้ำ', daily: 'ทุกวัน', weekly: 'ทุกสัปดาห์', monthly: 'ทุกเดือน' }

function dueLabel(t: Task, today: string): { icon: string; text: string; tone: 'overdue' | 'due_soon' | 'unpaid' | 'paid' } {
  if (t.isDone) return { icon: '✓', text: 'เสร็จแล้ว', tone: 'paid' }
  if (!t.dueDate) return { icon: '○', text: 'ไม่มีกำหนด', tone: 'unpaid' }
  const d = diffDays(today, t.dueDate)
  if (d < 0) return { icon: '!', text: `เลยกำหนด ${-d} วัน`, tone: 'overdue' }
  if (d === 0) return { icon: '⏰', text: 'วันนี้', tone: 'due_soon' }
  if (d === 1) return { icon: '⏰', text: 'พรุ่งนี้', tone: 'due_soon' }
  return { icon: '○', text: formatThaiDate(t.dueDate), tone: 'unpaid' }
}

export function TasksPage(): React.JSX.Element {
  const { dataVersion, refresh, toast } = usePortal()
  const today = todayIso()
  const { data, error } = useLoad(`tasks:${dataVersion}`, () => unwrap(meow().portal.tasks.list()))
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [showDone, setShowDone] = useState(false)
  const del = useDeleteWithUndo(
    (id) => unwrap(meow().portal.tasks.remove(id)),
    (id) => unwrap(meow().portal.tasks.restore(id)),
    refresh
  )

  const toggle = async (t: Task): Promise<void> => {
    try {
      const after = await unwrap(meow().portal.tasks.setDone(t.id, !t.isDone))
      refresh()
      if (t.repeat !== 'none' && !t.isDone) toast(`เสร็จแล้ว! งานนี้จะมาอีกครั้ง ${after.dueDate ? formatThaiDate(after.dueDate) : ''}`)
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    }
  }

  const open = (data ?? []).filter((t) => !t.isDone)
  const done = (data ?? []).filter((t) => t.isDone)
  const groups: Array<{ title: string; items: Task[] }> = [
    { title: '⚠️ เลยกำหนด', items: open.filter((t) => t.dueDate !== null && t.dueDate < today) },
    { title: '📌 วันนี้', items: open.filter((t) => t.dueDate === today) },
    { title: '📅 ถัดไป', items: open.filter((t) => t.dueDate !== null && t.dueDate > today) },
    { title: '🗂️ ไม่มีกำหนด', items: open.filter((t) => t.dueDate === null) }
  ].filter((g) => g.items.length > 0)

  const row = (t: Task): React.JSX.Element => {
    const due = dueLabel(t, today)
    return (
      <li key={t.id} className="tx-row" style={{ gridTemplateColumns: '44px minmax(0, 1fr) auto' }}>
        <button
          type="button"
          className="icon-btn"
          style={{ width: 44, height: 44, border: '2px solid var(--orange-300)' }}
          aria-label={t.isDone ? `ยกเลิกเสร็จ ${t.title}` : `ทำ ${t.title} เสร็จแล้ว`}
          title={t.isDone ? 'ยกเลิกเสร็จ' : 'ทำเสร็จแล้ว'}
          onClick={() => void toggle(t)}
        >
          {t.isDone ? '✓' : ''}
        </button>
        <div className="tx-main">
          <div className="tx-title" style={t.isDone ? { textDecoration: 'line-through', color: 'var(--text-muted)' } : undefined}>
            {t.title}
          </div>
          <div className="tx-meta">
            <span className={`badge badge-${due.tone}`}>
              <span aria-hidden="true">{due.icon}</span>
              {due.text}
            </span>
            {t.repeat !== 'none' && <span>🔁 {REPEAT_LABEL[t.repeat]}</span>}
            {t.note && <span>{t.note}</span>}
          </div>
        </div>
        <div className="tx-actions">
          <button type="button" className="icon-btn" aria-label={`แก้ไข ${t.title}`} title="แก้ไข" onClick={() => setEditing(t)}>
            ✏️
          </button>
          <button type="button" className="icon-btn" aria-label={`ลบ ${t.title}`} title="ลบ" onClick={() => void del(t.id, t.title)}>
            🗑️
          </button>
        </div>
      </li>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>สิ่งที่ต้องทำ</h1>
          <p className="muted">งานเดี่ยวและงานประจำ ค่อย ๆ ทำไปทีละอย่าง</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          ＋ เพิ่มงาน
        </button>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}
      {!data && !error && <div className="loading">กำลังโหลด…</div>}

      {data && open.length === 0 && (
        <div className="card">
          <EmptyState
            mood="cheer"
            title={done.length > 0 ? 'ไม่มีงานค้างเลย เก่งมาก!' : 'ยังไม่มีงาน'}
            hint="จดสิ่งที่ต้องทำไว้ที่นี่ จะตั้งวันครบกำหนดหรือให้ทำซ้ำทุกวัน/สัปดาห์/เดือนก็ได้"
            action={
              <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
                ＋ เพิ่มงานแรก
              </button>
            }
          />
        </div>
      )}

      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h2 className="date-heading" style={{ fontSize: '1rem' }}>{g.title} ({g.items.length})</h2>
          <ul className="tx-list">{g.items.map(row)}</ul>
        </section>
      ))}

      {done.length > 0 && (
        <section>
          <button type="button" className="btn btn-ghost" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
            {showDone ? '▾' : '▸'} งานที่เสร็จแล้ว ({done.length})
          </button>
          {showDone && <ul className="tx-list">{done.map(row)}</ul>}
        </section>
      )}

      <Modal open={editing !== null} title={editing === 'new' || editing === null ? 'เพิ่มงาน' : 'แก้ไขงาน'} onClose={() => setEditing(null)}>
        {editing !== null && (
          <TaskForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              refresh()
              toast('บันทึกงานแล้ว')
            }}
          />
        )}
      </Modal>
    </div>
  )
}

function TaskForm(props: { initial: Task | null; onCancel: () => void; onSaved: () => void }): React.JSX.Element {
  const { initial } = props
  const [title, setTitle] = useState(initial?.title ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '')
  const [repeat, setRepeat] = useState<TaskRepeat>(initial?.repeat ?? 'none')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!title.trim()) return setError('ใส่ชื่องานก่อนนะ')
    if (repeat !== 'none' && !dueDate) return setError('งานที่ทำซ้ำต้องมีวันครบกำหนดครั้งแรก')
    const input: TaskInput = { title: title.trim(), note: note.trim(), dueDate: dueDate || null, repeat }
    setSaving(true)
    try {
      if (initial) await unwrap(meow().portal.tasks.update(initial.id, input))
      else await unwrap(meow().portal.tasks.create(input))
      props.onSaved()
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <form className="form" onSubmit={(e) => void submit(e)} noValidate>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="task-title">ชื่องาน</label>
        <input id="task-title" className="input" autoFocus maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น โทรหาแม่, ซื้อทรายแมว" />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="task-due">วันครบกำหนด (ไม่บังคับ)</label>
          <input id="task-due" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="task-repeat">ทำซ้ำ</label>
          <select id="task-repeat" className="input" value={repeat} onChange={(e) => setRepeat(e.target.value as TaskRepeat)}>
            {(Object.keys(REPEAT_LABEL) as TaskRepeat[]).map((r) => (
              <option key={r} value={r}>{REPEAT_LABEL[r]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="task-note">หมายเหตุ</label>
        <input id="task-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={props.onCancel}>ยกเลิก</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </div>
    </form>
  )
}
