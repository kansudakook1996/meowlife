import { useState, type FormEvent } from 'react'
import { formatThaiDate } from '@shared/dates'
import { formatSatang, parseBahtToSatang, satangToInput } from '@shared/money'
import { savingPercent, type Goal, type GoalInput, type GoalKind } from '@shared/portalModel'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import { errorMessage, meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useDeleteWithUndo } from '../lib/portalApi'
import { useLoad } from '../lib/useLoad'

type Editing = { mode: 'edit'; goal: Goal } | { mode: 'new' } | { mode: 'saving'; goal: Goal } | null

export function GoalsPage(): React.JSX.Element {
  const { dataVersion, refresh, toast } = usePortal()
  const { data, error } = useLoad(`goals:${dataVersion}`, () => unwrap(meow().portal.goals.list()))
  const [editing, setEditing] = useState<Editing>(null)
  const del = useDeleteWithUndo((id) => unwrap(meow().portal.goals.remove(id)), (id) => unwrap(meow().portal.goals.restore(id)), refresh)

  const toggleDone = async (g: Goal): Promise<void> => {
    try {
      await unwrap(meow().portal.goals.setDone(g.id, !g.isDone))
      refresh()
      if (!g.isDone) toast('ยินดีด้วย! ทำเป้าหมายสำเร็จแล้ว 🎉')
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>เป้าหมาย</h1>
          <p className="muted">เป้าหมายชีวิต แผนอนาคต และเป้าหมายการออม</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ mode: 'new' })}>＋ เพิ่มเป้าหมาย</button>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}
      {data && data.length === 0 && (
        <div className="card">
          <EmptyState title="ยังไม่มีเป้าหมาย" hint="เช่น ออมเงินเที่ยว 50,000 บาท หรือ เรียนภาษาญี่ปุ่นให้จบ" action={<button type="button" className="btn btn-primary" onClick={() => setEditing({ mode: 'new' })}>＋ เพิ่มเป้าหมายแรก</button>} />
        </div>
      )}

      <ul className="tx-list">
        {(data ?? []).map((g) => {
          const percent = g.kind === 'saving' ? savingPercent(g) : g.progress
          return (
            <li key={g.id} className="card" style={{ opacity: g.isDone ? 0.85 : 1 }}>
              <div className="card-title">
                <h2 style={{ fontSize: '1.1rem' }}>{g.kind === 'saving' ? '🐷' : '🎯'} {g.title}</h2>
                <span className={g.isDone ? 'badge badge-paid' : 'badge badge-unpaid'}>
                  <span aria-hidden="true">{g.isDone ? '✓' : '○'}</span> {g.isDone ? 'สำเร็จแล้ว' : 'กำลังทำ'}
                </span>
              </div>
              <div className="bar-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                <span className="small">
                  {g.kind === 'saving' ? `${formatSatang(g.savedSatang)} จาก ${formatSatang(g.targetSatang ?? 0)}` : 'ความคืบหน้า'}
                  {g.targetDate && ` · เป้าหมาย ${formatThaiDate(g.targetDate)}`}
                </span>
                <strong>{percent}%</strong>
                <div className="bar-track" role="progressbar" aria-label={`ความคืบหน้า ${g.title}`} aria-valuenow={Math.min(percent, 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="bar-fill" style={{ width: `${Math.min(percent, 100)}%` }} />
                </div>
              </div>
              {g.note && <p className="muted small" style={{ marginTop: 6 }}>{g.note}</p>}
              <div className="toolbar" style={{ marginTop: 10 }}>
                {g.kind === 'saving' && !g.isDone && <button type="button" className="btn btn-secondary" onClick={() => setEditing({ mode: 'saving', goal: g })}>＋ เพิ่มเงินออม</button>}
                <button type="button" className="btn btn-ghost" onClick={() => void toggleDone(g)}>{g.isDone ? 'ยกเลิกสำเร็จ' : 'ทำเสร็จแล้ว'}</button>
                <button type="button" className="icon-btn" aria-label={`แก้ไข ${g.title}`} title="แก้ไข" onClick={() => setEditing({ mode: 'edit', goal: g })}>✏️</button>
                <button type="button" className="icon-btn" aria-label={`ลบ ${g.title}`} title="ลบ" onClick={() => void del(g.id, g.title)}>🗑️</button>
              </div>
            </li>
          )
        })}
      </ul>

      <Modal open={editing !== null} title={editing?.mode === 'saving' ? 'เพิ่มเงินออม' : editing?.mode === 'edit' ? 'แก้ไขเป้าหมาย' : 'เพิ่มเป้าหมาย'} onClose={() => setEditing(null)}>
        {editing?.mode === 'saving' && (
          <SavingForm goal={editing.goal} onCancel={() => setEditing(null)} onSaved={(msg) => { setEditing(null); refresh(); toast(msg) }} />
        )}
        {(editing?.mode === 'new' || editing?.mode === 'edit') && (
          <GoalForm key={editing.mode === 'edit' ? editing.goal.id : 'new'} initial={editing.mode === 'edit' ? editing.goal : null} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); toast('บันทึกเป้าหมายแล้ว') }} />
        )}
      </Modal>
    </div>
  )
}

function SavingForm(props: { goal: Goal; onCancel: () => void; onSaved: (message: string) => void }): React.JSX.Element {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const satang = parseBahtToSatang(amount)
    if (!satang) return setError('ใส่จำนวนเงินที่มากกว่า 0 เช่น 500 หรือ 1,250.50')
    try {
      const g = await unwrap(meow().portal.goals.addSaving(props.goal.id, satang))
      props.onSaved(g.isDone ? 'ถึงเป้าหมายแล้ว! 🎉' : `เพิ่มเงินออม ${formatSatang(satang)} แล้ว`)
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  return (
    <form className="form" onSubmit={(e) => void submit(e)} noValidate>
      {error && <div className="alert" role="alert">{error}</div>}
      <p>{props.goal.title}: ออมแล้ว {formatSatang(props.goal.savedSatang)} จาก {formatSatang(props.goal.targetSatang ?? 0)}</p>
      <div className="field">
        <label htmlFor="saving-amount">เพิ่มเงินออม (บาท)</label>
        <input id="saving-amount" className="input input-amount" autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={props.onCancel}>ยกเลิก</button>
        <button type="submit" className="btn btn-primary">เพิ่มเงินออม</button>
      </div>
    </form>
  )
}

function GoalForm(props: { initial: Goal | null; onCancel: () => void; onSaved: () => void }): React.JSX.Element {
  const { initial } = props
  const [kind, setKind] = useState<GoalKind>(initial?.kind ?? 'saving')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [target, setTarget] = useState(initial?.targetSatang ? satangToInput(initial.targetSatang) : '')
  const [saved, setSaved] = useState(initial ? satangToInput(initial.savedSatang) : '0')
  const [progress, setProgress] = useState(initial?.progress ?? 0)
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!title.trim()) return setError('ใส่ชื่อเป้าหมายก่อนนะ')
    const targetSatang = target.trim() ? parseBahtToSatang(target) : null
    const savedSatang = parseBahtToSatang(saved || '0')
    if (kind === 'saving' && !targetSatang) return setError('เป้าหมายการออมต้องใส่จำนวนเงินเป้าหมาย เช่น 50,000')
    if (savedSatang === null) return setError('จำนวนเงินที่ออมแล้วอ่านไม่ได้')
    const input: GoalInput = { title: title.trim(), kind, targetSatang: kind === 'saving' ? targetSatang : null, savedSatang: kind === 'saving' ? savedSatang : 0, progress: kind === 'life' ? progress : 0, targetDate: targetDate || null, note: note.trim() }
    try {
      if (initial) await unwrap(meow().portal.goals.update(initial.id, input))
      else await unwrap(meow().portal.goals.create(input))
      props.onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form className="form" onSubmit={(e) => void submit(e)} noValidate>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="segmented" role="group" aria-label="ชนิดเป้าหมาย">
        <button type="button" aria-pressed={kind === 'saving'} onClick={() => setKind('saving')}>🐷 เป้าหมายการออม</button>
        <button type="button" aria-pressed={kind === 'life'} onClick={() => setKind('life')}>🎯 เป้าหมายชีวิต</button>
      </div>
      <div className="field">
        <label htmlFor="goal-title">ชื่อเป้าหมาย</label>
        <input id="goal-title" className="input" autoFocus maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      {kind === 'saving' ? (
        <div className="field-row">
          <div className="field">
            <label htmlFor="goal-target">จำนวนเงินเป้าหมาย (บาท)</label>
            <input id="goal-target" className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="goal-saved">ออมไว้แล้ว (บาท)</label>
            <input id="goal-saved" className="input" inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="goal-progress">ความคืบหน้า: {progress}%</label>
          <input id="goal-progress" type="range" min={0} max={100} step={5} value={progress} onChange={(e) => setProgress(Number(e.target.value))} />
        </div>
      )}
      <div className="field">
        <label htmlFor="goal-date">อยากทำให้สำเร็จภายใน (ไม่บังคับ)</label>
        <input id="goal-date" type="date" className="input" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="goal-note">หมายเหตุ</label>
        <input id="goal-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={props.onCancel}>ยกเลิก</button>
        <button type="submit" className="btn btn-primary">บันทึก</button>
      </div>
    </form>
  )
}
