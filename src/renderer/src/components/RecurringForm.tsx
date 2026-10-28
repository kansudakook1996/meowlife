import { useState, type FormEvent } from 'react'
import { isValidMonth, monthOf, todayIso } from '@shared/dates'
import { parseBahtToSatang, satangToInput } from '@shared/money'
import type { RecurringInput } from '@shared/schemas'
import type { Category, EntryKind, PaymentMethod, RecurringRule } from '@shared/types'
import { errorMessage, meow, unwrap } from '../lib/api'

interface Props {
  initial?: RecurringRule
  categories: Category[]
  paymentMethods: PaymentMethod[]
  onSaved: () => void
  onCancel: () => void
}

export function RecurringForm(props: Props): React.JSX.Element {
  const { initial } = props
  const [kind, setKind] = useState<EntryKind>(initial?.kind ?? 'expense')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [amount, setAmount] = useState(initial ? satangToInput(initial.amountSatang) : '')
  const [day, setDay] = useState(String(initial?.dayOfMonth ?? 1))
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? monthOf(todayIso()))
  const [endMonth, setEndMonth] = useState(initial?.endMonth ?? '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [paymentMethodId, setPaymentMethodId] = useState(initial?.paymentMethodId ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const amountSatang = parseBahtToSatang(amount)
    const dayOfMonth = Number(day)
    if (!title.trim()) return setError('ใส่ชื่อรายการก่อนนะ เช่น "ค่าเช่าห้อง"')
    if (!amountSatang) return setError('ใส่จำนวนเงินที่มากกว่า 0 เช่น 4500 หรือ 599.50')
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return setError('วันที่ต้องอยู่ระหว่าง 1–31')
    if (!isValidMonth(startMonth)) return setError('เลือกเดือนเริ่มต้นให้ถูกต้อง')
    if (endMonth && (!isValidMonth(endMonth) || endMonth < startMonth)) return setError('เดือนสิ้นสุดต้องไม่ก่อนเดือนเริ่ม')

    const input: RecurringInput = {
      kind,
      title: title.trim(),
      amountSatang,
      categoryId: categoryId || null,
      paymentMethodId: paymentMethodId || null,
      dayOfMonth,
      startMonth,
      endMonth: endMonth || null,
      note: note.trim(),
      isActive
    }
    setSaving(true)
    setError(null)
    try {
      if (initial) await unwrap(meow().recurring.update(initial.id, input))
      else await unwrap(meow().recurring.create(input))
      props.onSaved()
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
      <div className="segmented" role="group" aria-label="ประเภท">
        <button type="button" aria-pressed={kind === 'expense'} onClick={() => setKind('expense')}>
          💸 รายจ่ายประจำ
        </button>
        <button type="button" aria-pressed={kind === 'income'} onClick={() => setKind('income')}>
          💰 รายรับประจำ
        </button>
      </div>
      <div className="field">
        <label htmlFor="r-title">ชื่อรายการ</label>
        <input id="r-title" className="input" autoFocus maxLength={80} value={title} placeholder="เช่น ค่าเช่าห้อง, Netflix" onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="r-amount">จำนวนเงิน (บาท)</label>
          <input id="r-amount" className="input input-amount" inputMode="decimal" value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="r-day">ครบกำหนดทุกวันที่</label>
          <input id="r-day" className="input" type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} />
          <span className="muted small">ถ้าเดือนนั้นไม่มีวันที่นี้ จะใช้วันสุดท้ายของเดือน</span>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="r-start">เริ่มเดือน</label>
          <input id="r-start" className="input" type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="r-end">ถึงเดือน (ว่าง = ไม่มีกำหนด)</label>
          <input id="r-end" className="input" type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="r-category">หมวดหมู่</label>
          <select id="r-category" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {props.categories
              .filter((c) => c.kind === kind)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-method">ช่องทาง</label>
          <select id="r-method" className="input" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {props.paymentMethods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="r-note">หมายเหตุ</label>
        <input id="r-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <label className="check">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        เปิดใช้งาน (สร้างรายการให้อัตโนมัติทุกเดือน)
      </label>
      {initial && (
        <p className="info small">
          การแก้ไขจะมีผลกับรายการที่ยังไม่จ่ายตั้งแต่วันนี้เป็นต้นไป รายการที่จ่ายแล้วหรือผ่านมาแล้วจะไม่เปลี่ยน
        </p>
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
