import { useState, type FormEvent } from 'react'
import { formatThaiDate } from '@shared/dates'
import type { Note } from '@shared/portalModel'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import { errorMessage, meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useDeleteWithUndo } from '../lib/portalApi'
import { useLoad } from '../lib/useLoad'

export function NotesPage(): React.JSX.Element {
  const { dataVersion, refresh, toast } = usePortal()
  const { data, error } = useLoad(`notes:${dataVersion}`, () => unwrap(meow().portal.notes.list()))
  const [editing, setEditing] = useState<Note | 'new' | null>(null)
  const [search, setSearch] = useState('')
  const del = useDeleteWithUndo((id) => unwrap(meow().portal.notes.remove(id)), (id) => unwrap(meow().portal.notes.restore(id)), refresh)

  const needle = search.trim().toLocaleLowerCase('th')
  const shown = (data ?? []).filter((n) => !needle || `${n.title} ${n.body}`.toLocaleLowerCase('th').includes(needle))

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>โน้ต</h1>
          <p className="muted">จดอะไรก็ได้ ค้นหาเจอเร็ว</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>＋ เพิ่มโน้ต</button>
      </header>

      <div className="toolbar">
        <label className="visually-hidden" htmlFor="note-search">ค้นหาโน้ต</label>
        <input id="note-search" type="search" className="input" style={{ flex: '1 1 260px', width: 'auto' }} placeholder="🔍 ค้นหาในชื่อและเนื้อหา" value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && <div className="alert" role="alert">{error}</div>}
      {data && shown.length === 0 && (
        <div className="card">
          <EmptyState
            title={search ? 'ไม่พบโน้ตที่ค้นหา' : 'ยังไม่มีโน้ต'}
            hint={search ? 'ลองเปลี่ยนคำค้นหาดูนะ' : 'เช่น รายการซื้อของ ไอเดีย หรือรหัสเครื่องใช้ (ไม่แนะนำให้จดรหัสผ่านสำคัญ)'}
            action={!search ? <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>＋ เพิ่มโน้ตแรก</button> : undefined}
          />
        </div>
      )}

      <ul className="tx-list">
        {shown.map((n) => (
          <li key={n.id} className="card">
            <div className="card-title">
              <h2 style={{ fontSize: '1.1rem' }}>{n.isPinned ? '📌 ' : ''}{n.title}</h2>
              <div className="toolbar">
                <span className="muted small">{formatThaiDate(n.updatedAt.slice(0, 10))}</span>
                <button type="button" className="icon-btn" aria-label={`แก้ไข ${n.title}`} title="แก้ไข" onClick={() => setEditing(n)}>✏️</button>
                <button type="button" className="icon-btn" aria-label={`ลบ ${n.title}`} title="ลบ" onClick={() => void del(n.id, n.title)}>🗑️</button>
              </div>
            </div>
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.body.length > 300 ? `${n.body.slice(0, 300)}…` : n.body}</p>
          </li>
        ))}
      </ul>

      <Modal open={editing !== null} title={editing === 'new' || editing === null ? 'เพิ่มโน้ต' : 'แก้ไขโน้ต'} onClose={() => setEditing(null)}>
        {editing !== null && <NoteForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); toast('บันทึกโน้ตแล้ว') }} />}
      </Modal>
    </div>
  )
}

function NoteForm(props: { initial: Note | null; onCancel: () => void; onSaved: () => void }): React.JSX.Element {
  const [title, setTitle] = useState(props.initial?.title ?? '')
  const [body, setBody] = useState(props.initial?.body ?? '')
  const [pinned, setPinned] = useState(props.initial?.isPinned ?? false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!title.trim()) return setError('ใส่หัวข้อโน้ตก่อนนะ')
    try {
      const input = { title: title.trim(), body, isPinned: pinned }
      if (props.initial) await unwrap(meow().portal.notes.update(props.initial.id, input))
      else await unwrap(meow().portal.notes.create(input))
      props.onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  return (
    <form className="form" onSubmit={(e) => void submit(e)} noValidate>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="note-title">หัวข้อ</label>
        <input id="note-title" className="input" autoFocus maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="note-body">เนื้อหา</label>
        <textarea id="note-body" className="input" rows={10} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
        <span className="muted small">{body.length}/5000</span>
      </div>
      <label className="check"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> ปักหมุดไว้ด้านบน</label>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={props.onCancel}>ยกเลิก</button>
        <button type="submit" className="btn btn-primary">บันทึก</button>
      </div>
    </form>
  )
}
