import { useState, type FormEvent } from 'react'
import { formatThaiDate, todayIso } from '@shared/dates'
import type { HabitView } from '@shared/portalApi'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import { errorMessage, meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useDeleteWithUndo } from '../lib/portalApi'
import { useLoad } from '../lib/useLoad'

const ICONS = ['💧', '🏃', '📚', '🧘', '🛌', '🥗', '🦷', '✍️', '🎵', '🧹', '💊', '🐱']

export function HabitsPage(): React.JSX.Element {
  const { dataVersion, refresh, toast } = usePortal()
  const today = todayIso()
  const { data, error } = useLoad(`habits:${dataVersion}`, () => unwrap(meow().portal.habits.list()))
  const [editing, setEditing] = useState<HabitView | 'new' | null>(null)
  const del = useDeleteWithUndo((id) => unwrap(meow().portal.habits.remove(id)), (id) => unwrap(meow().portal.habits.restore(id)), refresh)

  const check = async (h: HabitView, date: string, checked: boolean): Promise<void> => {
    try {
      await unwrap(meow().portal.habits.check(h.id, date, checked))
      refresh()
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>นิสัย</h1>
          <p className="muted">ติ๊กทุกวันที่ทำได้ ข้ามวันก็ไม่เป็นไร เริ่มใหม่ได้เสมอ</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>＋ เพิ่มนิสัย</button>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}
      {data && data.length === 0 && (
        <div className="card">
          <EmptyState title="ยังไม่มีนิสัยที่ติดตาม" hint="เช่น ดื่มน้ำ 8 แก้ว, เดิน 20 นาที, อ่านหนังสือ" action={<button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>＋ เพิ่มนิสัยแรก</button>} />
        </div>
      )}

      <ul className="tx-list">
        {(data ?? []).map((h) => (
          <li key={h.id} className="card">
            <div className="card-title">
              <h2 style={{ fontSize: '1.1rem' }}><span aria-hidden="true">{h.icon}</span> {h.name}</h2>
              <div className="toolbar">
                <button
                  type="button"
                  className={h.stats.doneToday ? 'btn btn-secondary' : 'btn btn-primary'}
                  aria-pressed={h.stats.doneToday}
                  onClick={() => void check(h, today, !h.stats.doneToday)}
                >
                  {h.stats.doneToday ? '✓ ทำวันนี้แล้ว' : 'ติ๊กวันนี้'}
                </button>
                <button type="button" className="icon-btn" aria-label={`แก้ไข ${h.name}`} title="แก้ไข" onClick={() => setEditing(h)}>✏️</button>
                <button type="button" className="icon-btn" aria-label={`ลบ ${h.name}`} title="ลบ" onClick={() => void del(h.id, h.name)}>🗑️</button>
              </div>
            </div>
            <p className="small">
              🔥 ต่อเนื่อง <strong>{h.stats.currentStreak}</strong> วัน · ดีที่สุด {h.stats.bestStreak} วัน · 30 วันล่าสุดทำ {h.stats.last30}/30 วัน
            </p>
            <div role="group" aria-label={`14 วันล่าสุดของ ${h.name}`} style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
              {h.recent.map(([date, done]) => (
                <button
                  key={date}
                  type="button"
                  className={done ? 'badge badge-paid' : 'badge badge-unpaid'}
                  style={{ cursor: 'pointer', minWidth: 34, justifyContent: 'center' }}
                  aria-pressed={done}
                  aria-label={`${formatThaiDate(date)} ${done ? 'ทำแล้ว' : 'ยังไม่ได้ทำ'}`}
                  title={formatThaiDate(date)}
                  onClick={() => void check(h, date, !done)}
                >
                  {done ? '✓' : date.slice(8)}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <Modal open={editing !== null} title={editing === 'new' || editing === null ? 'เพิ่มนิสัย' : 'แก้ไขนิสัย'} onClose={() => setEditing(null)}>
        {editing !== null && <HabitForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); toast('บันทึกนิสัยแล้ว') }} />}
      </Modal>
    </div>
  )
}

function HabitForm(props: { initial: HabitView | null; onCancel: () => void; onSaved: () => void }): React.JSX.Element {
  const [name, setName] = useState(props.initial?.name ?? '')
  const [icon, setIcon] = useState(props.initial?.icon ?? '💧')
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim()) return setError('ใส่ชื่อนิสัยก่อนนะ')
    try {
      const input = { name: name.trim(), icon }
      if (props.initial) await unwrap(meow().portal.habits.update(props.initial.id, input))
      else await unwrap(meow().portal.habits.create(input))
      props.onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  return (
    <form className="form" onSubmit={(e) => void submit(e)} noValidate>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="habit-name">ชื่อนิสัย</label>
        <input id="habit-name" className="input" autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ดื่มน้ำ 8 แก้ว" />
      </div>
      <div className="field">
        <span className="field-label" id="habit-icon">ไอคอน</span>
        <div className="segmented" role="group" aria-labelledby="habit-icon" style={{ flexWrap: 'wrap', borderRadius: 16 }}>
          {ICONS.map((i) => (
            <button key={i} type="button" aria-pressed={icon === i} aria-label={`ไอคอน ${i}`} onClick={() => setIcon(i)}>{i}</button>
          ))}
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={props.onCancel}>ยกเลิก</button>
        <button type="submit" className="btn btn-primary">บันทึก</button>
      </div>
    </form>
  )
}
