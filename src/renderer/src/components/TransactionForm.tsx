import { useState, type FormEvent } from 'react'
import { isValidIsoDate } from '@shared/dates'
import { parseBahtToSatang, satangToInput } from '@shared/money'
import type { TransactionInput } from '@shared/schemas'
import type { Category, EntryKind, PaymentMethod, TransactionView } from '@shared/types'
import { errorMessage, meow, unwrap } from '../lib/api'

interface Props {
  initial?: TransactionView
  defaultKind: EntryKind
  defaultDate: string
  categories: Category[]
  paymentMethods: PaymentMethod[]
  onSaved: (item: TransactionView, isNew: boolean) => void
  onCancel: () => void
}

type Errors = Partial<Record<'title' | 'amount' | 'txnDate' | 'dueDate', string>>

export function TransactionForm(props: Props): React.JSX.Element {
  const { initial } = props
  const [kind, setKind] = useState<EntryKind>(initial?.kind ?? props.defaultKind)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [amount, setAmount] = useState(initial ? satangToInput(initial.amountSatang) : '')
  const [txnDate, setTxnDate] = useState(initial?.txnDate ?? props.defaultDate)
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [paymentMethodId, setPaymentMethodId] = useState(initial?.paymentMethodId ?? '')
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '')
  const [isPaid, setIsPaid] = useState(initial?.isPaid ?? true)
  const [note, setNote] = useState(initial?.note ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const categories = props.categories.filter((c) => c.kind === kind)
  const hasDetails = Boolean(initial?.categoryId || initial?.paymentMethodId || initial?.dueDate || initial?.note)

  const changeKind = (next: EntryKind): void => {
    setKind(next)
    if (!props.categories.some((c) => c.id === categoryId && c.kind === next)) setCategoryId('')
  }

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const amountSatang = parseBahtToSatang(amount)
    const next: Errors = {}
    if (!title.trim()) next.title = 'ใส่ชื่อรายการก่อนนะ เช่น "ค่าไฟ"'
    if (amountSatang === null) next.amount = 'ใส่ตัวเลข เช่น 120 หรือ 1,250.50 (ทศนิยมไม่เกิน 2 ตำแหน่ง)'
    else if (amountSatang === 0) next.amount = 'จำนวนเงินต้องมากกว่า 0'
    if (!isValidIsoDate(txnDate)) next.txnDate = 'เลือกวันที่ให้ถูกต้อง'
    if (dueDate && !isValidIsoDate(dueDate)) next.dueDate = 'เลือกวันครบกำหนดให้ถูกต้อง'
    setErrors(next)
    if (Object.keys(next).length > 0 || amountSatang === null) return

    const input: TransactionInput = {
      kind,
      title: title.trim(),
      amountSatang,
      categoryId: categoryId || null,
      paymentMethodId: paymentMethodId || null,
      txnDate,
      dueDate: dueDate || null,
      isPaid,
      note: note.trim()
    }
    setSaving(true)
    setServerError(null)
    try {
      const saved = initial
        ? await unwrap(meow().transactions.update(initial.id, input))
        : await unwrap(meow().transactions.create(input))
      props.onSaved(saved, !initial)
    } catch (error) {
      setServerError(errorMessage(error))
      setSaving(false)
    }
  }

  const paidText = kind === 'income' ? 'ได้รับเงินแล้ว' : 'จ่ายเงินแล้ว'

  return (
    <form className="form" onSubmit={(e) => void submit(e)} noValidate>
      {serverError && (
        <div className="alert" role="alert">
          {serverError}
        </div>
      )}

      <div className="field">
        <span className="field-label" id="kind-label">
          ประเภท
        </span>
        <div className="segmented" role="group" aria-labelledby="kind-label">
          <button type="button" aria-pressed={kind === 'expense'} onClick={() => changeKind('expense')}>
            💸 รายจ่าย
          </button>
          <button type="button" aria-pressed={kind === 'income'} onClick={() => changeKind('income')}>
            💰 รายรับ
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="tx-title">ชื่อรายการ</label>
        <input
          id="tx-title"
          className="input"
          value={title}
          maxLength={80}
          autoFocus
          placeholder={kind === 'income' ? 'เช่น เงินเดือน' : 'เช่น ค่าไฟ, ข้าวกลางวัน'}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? 'tx-title-error' : undefined}
          onChange={(e) => setTitle(e.target.value)}
        />
        {errors.title && (
          <span id="tx-title-error" className="field-error">
            {errors.title}
          </span>
        )}
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="tx-amount">จำนวนเงิน (บาท)</label>
          <input
            id="tx-amount"
            className="input input-amount"
            inputMode="decimal"
            value={amount}
            placeholder="0.00"
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? 'tx-amount-error' : undefined}
            onChange={(e) => setAmount(e.target.value)}
          />
          {errors.amount && (
            <span id="tx-amount-error" className="field-error">
              {errors.amount}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="tx-date">วันที่</label>
          <input
            id="tx-date"
            type="date"
            className="input"
            value={txnDate}
            aria-invalid={Boolean(errors.txnDate)}
            onChange={(e) => setTxnDate(e.target.value)}
          />
          {errors.txnDate && <span className="field-error">{errors.txnDate}</span>}
        </div>
      </div>

      <label className="check">
        <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />
        {paidText}
      </label>

      <details className="more" open={hasDetails}>
        <summary>รายละเอียดเพิ่มเติม (ไม่บังคับ)</summary>
        <div className="form">
          <div className="field-row">
            <div className="field">
              <label htmlFor="tx-category">หมวดหมู่</label>
              <select id="tx-category" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">— ไม่ระบุ —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tx-method">ช่องทาง</label>
              <select
                id="tx-method"
                className="input"
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
              >
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
            <label htmlFor="tx-due">วันครบกำหนด (สำหรับบิล)</label>
            <input
              id="tx-due"
              type="date"
              className="input"
              value={dueDate}
              aria-invalid={Boolean(errors.dueDate)}
              onChange={(e) => {
                // A new bill with a due date is usually not paid yet.
                if (!initial && !dueDate && e.target.value) setIsPaid(false)
                setDueDate(e.target.value)
              }}
            />
            {errors.dueDate && <span className="field-error">{errors.dueDate}</span>}
          </div>
          <div className="field">
            <label htmlFor="tx-note">หมายเหตุ</label>
            <textarea id="tx-note" className="input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      </details>

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
