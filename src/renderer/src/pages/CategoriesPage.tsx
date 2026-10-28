import { useState, type FormEvent } from 'react'
import type { Category, EntryKind, PaymentMethod } from '@shared/types'
import { Modal } from '../components/Modal'
import { errorMessage, meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'

const ICONS = ['🍚', '☕', '🛒', '🏠', '💡', '🚌', '⛽', '💳', '📺', '🎮', '🎁', '👕', '🩺', '💊', '📚', '🐱', '✈️', '🎨', '💰', '✨', '🧾', '📦', '🏷️', '🎓']

type Editing =
  | { type: 'category'; item: Category | null; kind: EntryKind }
  | { type: 'method'; item: PaymentMethod | null }
  | null

export function CategoriesPage(): React.JSX.Element {
  const { categories, paymentMethods, refresh, toast, confirm } = usePortal()
  const [editing, setEditing] = useState<Editing>(null)

  const removeCategory = async (c: Category): Promise<void> => {
    const ok = await confirm({
      title: `ลบหมวด "${c.name}" ไหม?`,
      message: 'รายการที่เคยอยู่ในหมวดนี้จะกลายเป็น "ไม่ระบุหมวด" ข้อมูลรายการไม่หาย',
      confirmLabel: 'ลบหมวด',
      danger: true
    })
    if (!ok) return
    try {
      const r = await unwrap(meow().categories.remove(c.id))
      refresh()
      toast(`ลบหมวด "${c.name}" แล้ว${r.detached > 0 ? ` (${r.detached} รายการกลายเป็นไม่ระบุหมวด)` : ''}`)
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    }
  }

  const removeMethod = async (m: PaymentMethod): Promise<void> => {
    const ok = await confirm({
      title: `ลบช่องทาง "${m.name}" ไหม?`,
      message: 'รายการที่เคยใช้ช่องทางนี้จะกลายเป็น "ไม่ระบุ" ข้อมูลรายการไม่หาย',
      confirmLabel: 'ลบช่องทาง',
      danger: true
    })
    if (!ok) return
    try {
      await unwrap(meow().paymentMethods.remove(m.id))
      refresh()
      toast(`ลบช่องทาง "${m.name}" แล้ว`)
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    }
  }

  const section = (kind: EntryKind, title: string): React.JSX.Element => (
    <section className="card" aria-labelledby={`cat-${kind}`}>
      <div className="card-title">
        <h2 id={`cat-${kind}`}>{title}</h2>
        <button type="button" className="btn btn-secondary" onClick={() => setEditing({ type: 'category', item: null, kind })}>
          ＋ เพิ่มหมวด
        </button>
      </div>
      <ul className="tx-list">
        {categories
          .filter((c) => c.kind === kind)
          .map((c) => (
            <li key={c.id} className="tx-row" style={{ gridTemplateColumns: '44px minmax(0, 1fr) auto' }}>
              <span className={`tx-icon ${kind}`} aria-hidden="true">
                {c.icon}
              </span>
              <span className="tx-title">{c.name}</span>
              <span className="tx-actions">
                <button type="button" className="icon-btn" aria-label={`แก้ไขหมวด ${c.name}`} title="แก้ไข" onClick={() => setEditing({ type: 'category', item: c, kind })}>
                  ✏️
                </button>
                <button type="button" className="icon-btn" aria-label={`ลบหมวด ${c.name}`} title="ลบ" onClick={() => void removeCategory(c)}>
                  🗑️
                </button>
              </span>
            </li>
          ))}
      </ul>
    </section>
  )

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>หมวดหมู่และช่องทางชำระ</h1>
          <p className="muted">จัดให้เหมาะกับการใช้เงินของคุณ</p>
        </div>
      </header>

      <div className="two-col">
        {section('expense', '💸 หมวดรายจ่าย')}
        {section('income', '💰 หมวดรายรับ')}
      </div>

      <section className="card" aria-labelledby="methods-title">
        <div className="card-title">
          <h2 id="methods-title">💳 ช่องทางชำระ</h2>
          <button type="button" className="btn btn-secondary" onClick={() => setEditing({ type: 'method', item: null })}>
            ＋ เพิ่มช่องทาง
          </button>
        </div>
        <ul className="tx-list">
          {paymentMethods.map((m) => (
            <li key={m.id} className="tx-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
              <span className="tx-title">{m.name}</span>
              <span className="tx-actions">
                <button type="button" className="icon-btn" aria-label={`แก้ไขช่องทาง ${m.name}`} title="แก้ไข" onClick={() => setEditing({ type: 'method', item: m })}>
                  ✏️
                </button>
                <button type="button" className="icon-btn" aria-label={`ลบช่องทาง ${m.name}`} title="ลบ" onClick={() => void removeMethod(m)}>
                  🗑️
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Modal
        open={editing !== null}
        title={editing === null ? '' : editing.type === 'category' ? (editing.item ? 'แก้ไขหมวด' : 'เพิ่มหมวด') : editing.item ? 'แก้ไขช่องทาง' : 'เพิ่มช่องทาง'}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <CatalogForm
            key={editing.type + (editing.item?.id ?? 'new')}
            editing={editing}
            onCancel={() => setEditing(null)}
            onSaved={(message) => {
              setEditing(null)
              refresh()
              toast(message)
            }}
          />
        )}
      </Modal>
    </div>
  )
}

function CatalogForm(props: { editing: NonNullable<Editing>; onCancel: () => void; onSaved: (message: string) => void }): React.JSX.Element {
  const { editing } = props
  const [name, setName] = useState(editing.item?.name ?? '')
  const [icon, setIcon] = useState(editing.type === 'category' ? (editing.item?.icon ?? (editing.kind === 'income' ? '💰' : '🏷️')) : '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim()) return setError('กรุณาใส่ชื่อ')
    setSaving(true)
    setError(null)
    try {
      if (editing.type === 'category') {
        const input = { kind: editing.kind, name: name.trim(), icon: icon.trim() || '🏷️' }
        if (editing.item) await unwrap(meow().categories.update(editing.item.id, input))
        else await unwrap(meow().categories.create(input))
        props.onSaved(`บันทึกหมวด "${name.trim()}" แล้ว`)
      } else {
        if (editing.item) await unwrap(meow().paymentMethods.update(editing.item.id, name.trim()))
        else await unwrap(meow().paymentMethods.create(name.trim()))
        props.onSaved(`บันทึกช่องทาง "${name.trim()}" แล้ว`)
      }
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <form className="form" onSubmit={(e) => void submit(e)} noValidate>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label htmlFor="cat-name">ชื่อ</label>
        <input id="cat-name" className="input" autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {editing.type === 'category' && (
        <div className="field">
          <span className="field-label" id="icon-label">
            ไอคอน
          </span>
          <div className="segmented" role="group" aria-labelledby="icon-label" style={{ flexWrap: 'wrap', borderRadius: 16 }}>
            {ICONS.map((i) => (
              <button key={i} type="button" aria-pressed={icon === i} aria-label={`ไอคอน ${i}`} onClick={() => setIcon(i)}>
                {i}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={props.onCancel}>
          ยกเลิก
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </form>
  )
}
