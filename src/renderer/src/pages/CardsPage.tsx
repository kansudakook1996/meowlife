import { useState, type FormEvent } from 'react'
import { addDays, addMonths, formatThaiDate, formatThaiMonth, monthsBetween, todayIso } from '@shared/dates'
import {
  CHARGE_CATEGORIES,
  planText,
  statementDateFor,
  type CardCharge,
  type CardStatementView,
  type CreditCard,
  type PlanLine
} from '@shared/cards'
import { formatSatang, parseBahtToSatang, satangToInput } from '@shared/money'
import { statusLabel } from '@shared/status'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { MonthPicker } from '../components/MonthPicker'
import { errorMessage, meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useDeleteWithUndo } from '../lib/portalApi'
import { useLoad } from '../lib/useLoad'

type Editing =
  | { type: 'card'; card: CreditCard | null }
  | { type: 'charge'; cardId: string | null; charge: CardCharge | null }
  | { type: 'plan'; cardId: string; line: PlanLine | null }
  | null

export function CardsPage({ startAddingCharge = false }: { startAddingCharge?: boolean }): React.JSX.Element {
  const { month, setMonth, dataVersion, refresh, toast } = usePortal()
  const [editing, setEditing] = useState<Editing>(startAddingCharge ? { type: 'charge', cardId: null, charge: null } : null)
  const { data, error } = useLoad(`cards:${month}:${dataVersion}`, () => unwrap(meow().portal.cards.overview(month)))
  const { data: allCards } = useLoad(`cards-all:${dataVersion}`, () => unwrap(meow().portal.cards.list()))
  const delCharge = useDeleteWithUndo((id) => unwrap(meow().portal.cards.charges.remove(id)), (id) => unwrap(meow().portal.cards.charges.restore(id)), refresh)
  const delPlan = useDeleteWithUndo((id) => unwrap(meow().portal.cards.plans.remove(id)), (id) => unwrap(meow().portal.cards.plans.restore(id)), refresh)
  const delCard = useDeleteWithUndo((id) => unwrap(meow().portal.cards.remove(id)), (id) => unwrap(meow().portal.cards.restore(id)), refresh)

  const createBill = async (cardId: string): Promise<void> => {
    try {
      const r = await unwrap(meow().portal.cards.createBill(cardId, month))
      refresh()
      toast(r.action === 'created' ? 'สร้างรายการจ่ายบิลแล้ว (ดูได้ในรายการรับ-จ่าย ปฏิทิน และการแจ้งเตือน)' : r.action === 'updated' ? `อัปเดตยอดบิลเป็น ${formatSatang(r.amountSatang)} แล้ว` : 'บิลนี้จ่ายแล้ว ไม่แก้ไขให้นะ')
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    }
  }

  const createAllBills = async (): Promise<void> => {
    if (!data) return
    let made = 0
    try {
      for (const c of data.cards) {
        if (c.total > 0 && !c.bill) {
          await unwrap(meow().portal.cards.createBill(c.card.id, month))
          made++
        }
      }
      refresh()
      toast(made > 0 ? `สร้างรายการจ่ายบิล ${made} ใบแล้ว` : 'ทุกใบมีรายการจ่ายบิลแล้ว หรือยังไม่มียอด')
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    }
  }

  const hasCards = (allCards?.length ?? 0) > 0
  const missingBills = data?.cards.filter((c) => c.total > 0 && !c.bill).length ?? 0

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>บัตรเครดิต</h1>
          <p className="muted">ยอดใช้จ่ายและค่าผ่อนของแต่ละใบ ตามรอบบิล{formatThaiMonth(month)}</p>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </header>

      <div className="toolbar">
        <button type="button" className="btn btn-primary" disabled={!hasCards} onClick={() => setEditing({ type: 'charge', cardId: null, charge: null })}>
          <Icon name="plus" /> เพิ่มยอดใช้จ่าย
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setEditing({ type: 'card', card: null })}>
          <Icon name="card" /> เพิ่มบัตร
        </button>
        {missingBills > 0 && (
          <button type="button" className="btn btn-secondary" onClick={() => void createAllBills()}>
            สร้างรายการจ่ายบิลทุกใบ ({missingBills})
          </button>
        )}
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {allCards && !hasCards && (
        <div className="card">
          <EmptyState
            title="ยังไม่ได้เพิ่มบัตรเครดิต"
            hint="เพิ่มบัตรแต่ละใบ (ชื่อ วันตัดรอบ วันครบกำหนด) แล้วจดยอดใช้จ่ายและค่าผ่อนรายเดือน แอปจะรวมยอดและสร้างรายการจ่ายบิลให้"
            action={<button type="button" className="btn btn-primary" onClick={() => setEditing({ type: 'card', card: null })}>＋ เพิ่มบัตรใบแรก</button>}
          />
        </div>
      )}

      {data && data.cards.length > 0 && (
        <section className="summary-grid" aria-label="สรุปทุกบัตร">
          <div className="summary-card summary-expense">
            <span className="label">💳 ต้องจ่ายรวมทุกใบ</span>
            <span className="value">{formatSatang(data.totalDue)}</span>
            <span className="muted small">{data.cards.length} ใบ รอบบิล{formatThaiMonth(month)}</span>
          </div>
          <div className="summary-card summary-income">
            <span className="label">🛒 ยอดใช้จ่าย</span>
            <span className="value">{formatSatang(data.chargesTotal)}</span>
          </div>
          <div className="summary-card summary-balance">
            <span className="label">📅 ค่าผ่อน</span>
            <span className="value">{formatSatang(data.installmentsTotal)}</span>
          </div>
        </section>
      )}

      {data?.cards.map((s) => (
        <CardSection
          key={s.card.id}
          s={s}
          onBill={() => void createBill(s.card.id)}
          onEditCard={() => setEditing({ type: 'card', card: s.card })}
          onDeleteCard={() => void delCard(s.card.id, s.card.name)}
          onAddCharge={() => setEditing({ type: 'charge', cardId: s.card.id, charge: null })}
          onEditCharge={(charge) => setEditing({ type: 'charge', cardId: s.card.id, charge })}
          onDeleteCharge={(c) => void delCharge(c.id, c.title)}
          onAddPlan={() => setEditing({ type: 'plan', cardId: s.card.id, line: null })}
          onEditPlan={(line) => setEditing({ type: 'plan', cardId: s.card.id, line })}
          onDeletePlan={(line) => void delPlan(line.plan.id, line.plan.title)}
        />
      ))}

      {allCards?.some((c) => !c.isActive) && (
        <p className="muted small">มีบัตรที่ปิดการใช้งานไว้ {allCards.filter((c) => !c.isActive).length} ใบ (ไม่แสดงในรอบบิล) — เปิดใช้ใหม่ได้ที่ "แก้ไขบัตร"</p>
      )}

      <Modal open={editing !== null} title={editing?.type === 'card' ? (editing.card ? 'แก้ไขบัตร' : 'เพิ่มบัตรเครดิต') : editing?.type === 'charge' ? (editing.charge ? 'แก้ไขยอดใช้จ่าย' : 'เพิ่มยอดใช้จ่าย') : editing?.line ? 'แก้ไขรายการผ่อน' : 'เพิ่มรายการผ่อน'} onClose={() => setEditing(null)}>
        {editing?.type === 'card' && (
          <CardForm key={editing.card?.id ?? 'new'} initial={editing.card} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); toast('บันทึกบัตรแล้ว') }} />
        )}
        {editing?.type === 'charge' && allCards && (
          <ChargeForm key={editing.charge?.id ?? `new-${editing.cardId}`} cards={allCards.filter((c) => c.isActive)} initialCardId={editing.cardId} initial={editing.charge} month={month} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); toast('บันทึกยอดใช้จ่ายแล้ว') }} />
        )}
        {editing?.type === 'plan' && (
          <PlanForm key={editing.line?.plan.id ?? `new-${editing.cardId}`} cardId={editing.cardId} line={editing.line} month={month} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); toast('บันทึกรายการผ่อนแล้ว') }} />
        )}
      </Modal>
    </div>
  )
}

/** Purchases from the day after the previous statement date up to this statement date belong to this bill. */
function periodStart(s: CardStatementView): string {
  return addDays(statementDateFor(addMonths(s.month, -1), s.card.statementDay), 1)
}

function CardSection(props: {
  s: CardStatementView
  onBill: () => void
  onEditCard: () => void
  onDeleteCard: () => void
  onAddCharge: () => void
  onEditCharge: (c: CardCharge) => void
  onDeleteCharge: (c: CardCharge) => void
  onAddPlan: () => void
  onEditPlan: (l: PlanLine) => void
  onDeletePlan: (l: PlanLine) => void
}): React.JSX.Element {
  const { s } = props
  const [showOld, setShowOld] = useState(false)
  const old = s.allPlans.filter((l) => l.state !== 'active')
  const billStale = s.bill && !s.bill.isPaid && s.bill.amountSatang !== s.total
  const due =
    s.bill?.isPaid ? 'จ่ายแล้ว' : s.daysToDue === null ? '' : s.daysToDue < 0 ? `เลยกำหนด ${-s.daysToDue} วัน` : s.daysToDue === 0 ? 'ครบกำหนดวันนี้' : `อีก ${s.daysToDue} วัน`

  return (
    <section className="card" aria-labelledby={`card-${s.card.id}`}>
      <div className="card-title" style={{ flexWrap: 'wrap' }}>
        <div>
          <h2 id={`card-${s.card.id}`}>💳 {s.card.name}{s.card.issuer && <span className="muted small"> · {s.card.issuer}</span>}</h2>
          <p className="muted small">
            ตัดรอบ {formatThaiDate(s.statementDate)} · ครบกำหนดชำระ <strong>{formatThaiDate(s.dueDate)}</strong>
            {due && <> ({due})</>}
            {s.card.limitSatang && <> · วงเงิน {formatSatang(s.card.limitSatang)}</>}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="muted small">ยอดที่ต้องจ่ายรอบนี้</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 600 }}>{formatSatang(s.total)}</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        {s.bill ? (
          <span className={`badge badge-${s.bill.status}`}>
            <span aria-hidden="true">{s.bill.isPaid ? '✓' : s.bill.status === 'overdue' ? '!' : '○'}</span>{' '}
            {statusLabel('expense', { status: s.bill.status, daysUntilDue: s.daysToDue })} · รายการจ่ายบิล {formatSatang(s.bill.amountSatang)}
          </span>
        ) : (
          <span className="badge badge-unpaid">ยังไม่ได้สร้างรายการจ่ายบิล</span>
        )}
        {!s.bill?.isPaid && s.total > 0 && (
          <button type="button" className={billStale || !s.bill ? 'btn btn-primary' : 'btn btn-secondary'} onClick={props.onBill}>
            {!s.bill ? 'สร้างรายการจ่ายบิล' : billStale ? `อัปเดตยอดบิลเป็น ${formatSatang(s.total)}` : 'อัปเดตยอดบิล'}
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={props.onEditCard}>แก้ไขบัตร</button>
        <button type="button" className="icon-btn" aria-label={`ลบบัตร ${s.card.name}`} title="ลบบัตร" onClick={props.onDeleteCard}>🗑️</button>
      </div>

      <div className="two-col">
        <div>
          <div className="card-title">
            <h3>🛒 ยอดใช้จ่าย {formatSatang(s.chargesTotal)}</h3>
            <button type="button" className="btn btn-secondary" onClick={props.onAddCharge}>＋ เพิ่มยอด</button>
          </div>
          {s.charges.length === 0 && <p className="muted">ยังไม่มียอดใช้จ่ายในรอบนี้ (นับยอดซื้อวันที่ {formatThaiDate(periodStart(s))} ถึง {formatThaiDate(s.statementDate)})</p>}
          <ul className="tx-list">
            {s.charges.map((c) => (
              <li key={c.id} className="tx-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto auto' }}>
                <div className="tx-main">
                  <div className="tx-title">{c.title}</div>
                  <div className="tx-meta"><span>{formatThaiDate(c.chargeDate)}</span>{c.category && <span className="badge badge-unpaid">{c.category}</span>}{c.note && <span>{c.note}</span>}</div>
                </div>
                <span className="tx-amount expense">{formatSatang(c.amountSatang)}</span>
                <span className="tx-actions">
                  <button type="button" className="icon-btn" aria-label={`แก้ไข ${c.title}`} title="แก้ไข" onClick={() => props.onEditCharge(c)}>✏️</button>
                  <button type="button" className="icon-btn" aria-label={`ลบ ${c.title}`} title="ลบ" onClick={() => props.onDeleteCharge(c)}>🗑️</button>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="card-title">
            <h3>📅 ค่าผ่อน {formatSatang(s.installmentsTotal)}</h3>
            <button type="button" className="btn btn-secondary" onClick={props.onAddPlan}>＋ เพิ่มรายการผ่อน</button>
          </div>
          {s.installments.length === 0 && <p className="muted">ไม่มีค่าผ่อนในรอบนี้</p>}
          <ul className="tx-list">{s.installments.map((l) => <PlanRow key={l.plan.id} line={l} onEdit={props.onEditPlan} onDelete={props.onDeletePlan} />)}</ul>
          {s.futureInstallmentsTotal > 0 && <p className="muted small" style={{ marginTop: 8 }}>ค่าผ่อนที่ยังต้องจ่ายหลังรอบนี้อีก {formatSatang(s.futureInstallmentsTotal)}</p>}
          {old.length > 0 && (
            <>
              <button type="button" className="btn btn-ghost" aria-expanded={showOld} onClick={() => setShowOld((v) => !v)}>
                {showOld ? '▾' : '▸'} ผ่อนหมดแล้ว / ยังไม่เริ่ม ({old.length})
              </button>
              {showOld && <ul className="tx-list">{old.map((l) => <PlanRow key={l.plan.id} line={l} onEdit={props.onEditPlan} onDelete={props.onDeletePlan} />)}</ul>}
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function PlanRow(props: { line: PlanLine; onEdit: (l: PlanLine) => void; onDelete: (l: PlanLine) => void }): React.JSX.Element {
  const { line } = props
  const pct = line.state === 'done' ? 100 : line.state === 'upcoming' ? 0 : Math.round((line.ordinal / line.total) * 100)
  return (
    <li className="tx-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto auto' }}>
      <div className="tx-main">
        <div className="tx-title">{line.plan.title}</div>
        <div className="tx-meta"><span>{planText(line, formatThaiMonth)}</span></div>
        <div className="bar-track" role="progressbar" aria-label={`ความคืบหน้าการผ่อน ${line.plan.title}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ marginTop: 4 }}>
          <div className="bar-fill" style={{ width: `${pct}%` }} />
        </div>
        {line.state !== 'done' && <div className="muted small">เดือนละ {formatSatang(line.plan.monthlySatang)} · ที่เหลือทั้งหมด {formatSatang(line.remainingTotalSatang)}</div>}
      </div>
      <span className="tx-amount expense">{line.state === 'active' ? formatSatang(line.amountThisMonth) : '—'}</span>
      <span className="tx-actions">
        <button type="button" className="icon-btn" aria-label={`แก้ไข ${line.plan.title}`} title="แก้ไข" onClick={() => props.onEdit(line)}>✏️</button>
        <button type="button" className="icon-btn" aria-label={`ลบ ${line.plan.title}`} title="ลบ" onClick={() => props.onDelete(line)}>🗑️</button>
      </span>
    </li>
  )
}

/* ---------- forms ---------- */

function CardForm(props: { initial: CreditCard | null; onCancel: () => void; onSaved: () => void }): React.JSX.Element {
  const c = props.initial
  const [name, setName] = useState(c?.name ?? '')
  const [issuer, setIssuer] = useState(c?.issuer ?? '')
  const [statementDay, setStatementDay] = useState(String(c?.statementDay ?? 25))
  const [dueDay, setDueDay] = useState(String(c?.dueDay ?? 10))
  const [limit, setLimit] = useState(c?.limitSatang ? satangToInput(c.limitSatang) : '')
  const [isActive, setIsActive] = useState(c?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const sd = Number(statementDay)
    const dd = Number(dueDay)
    if (!name.trim()) return setError('ใส่ชื่อบัตรก่อนนะ เช่น "KTC", "SCB Thai Airways"')
    if (!Number.isInteger(sd) || sd < 1 || sd > 31 || !Number.isInteger(dd) || dd < 1 || dd > 31) return setError('วันตัดรอบและวันครบกำหนดต้องเป็นเลข 1–31')
    const limitSatang = limit.trim() ? parseBahtToSatang(limit) : null
    if (limit.trim() && !limitSatang) return setError('วงเงินอ่านไม่ได้ ใส่ตัวเลข เช่น 50,000')
    const input = { name: name.trim(), issuer: issuer.trim(), statementDay: sd, dueDay: dd, limitSatang, isActive }
    try {
      if (c) await unwrap(meow().portal.cards.update(c.id, input))
      else await unwrap(meow().portal.cards.create(input))
      props.onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form className="form" onSubmit={(e) => void submit(e)} noValidate>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="field-row">
        <div className="field">
          <label htmlFor="card-name">ชื่อบัตร</label>
          <input id="card-name" className="input" autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น KTC, SCB, Krungsri" />
        </div>
        <div className="field">
          <label htmlFor="card-issuer">ธนาคาร/ผู้ออกบัตร (ไม่บังคับ)</label>
          <input id="card-issuer" className="input" maxLength={40} value={issuer} onChange={(e) => setIssuer(e.target.value)} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="card-statement">วันตัดรอบบิล (ทุกวันที่)</label>
          <input id="card-statement" type="number" min={1} max={31} className="input" value={statementDay} onChange={(e) => setStatementDay(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="card-due">วันครบกำหนดชำระ (ทุกวันที่)</label>
          <input id="card-due" type="number" min={1} max={31} className="input" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
        </div>
      </div>
      <p className="muted small">ดูได้จากใบแจ้งหนี้: ซื้อหลังวันตัดรอบจะไปรวมในบิลเดือนถัดไป · ถ้าวันครบกำหนดน้อยกว่าวันตัดรอบ จะครบกำหนดเดือนถัดไป</p>
      <div className="field">
        <label htmlFor="card-limit">วงเงิน (บาท, ไม่บังคับ)</label>
        <input id="card-limit" className="input" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
      </div>
      <label className="check"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> ใช้งานอยู่ (ปิดไว้ถ้าไม่ได้ใช้แล้ว บัตรจะไม่แสดงในรอบบิล)</label>
      <p className="muted small">แอปไม่เก็บเลขบัตร ชื่อ หรือรหัสความปลอดภัย (CVV) ของคุณ</p>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={props.onCancel}>ยกเลิก</button>
        <button type="submit" className="btn btn-primary">บันทึก</button>
      </div>
    </form>
  )
}

function ChargeForm(props: { cards: CreditCard[]; initialCardId: string | null; initial: CardCharge | null; month: string; onCancel: () => void; onSaved: () => void }): React.JSX.Element {
  const c = props.initial
  const [cardId, setCardId] = useState(c?.cardId ?? props.initialCardId ?? props.cards[0]?.id ?? '')
  const [date, setDate] = useState(c?.chargeDate ?? todayIso())
  const [title, setTitle] = useState(c?.title ?? '')
  const [category, setCategory] = useState(c?.category ?? '')
  const [amount, setAmount] = useState(c ? satangToInput(c.amountSatang) : '')
  const [note, setNote] = useState(c?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const amountSatang = parseBahtToSatang(amount)
    if (!cardId) return setError('เลือกบัตรก่อนนะ')
    if (!title.trim()) return setError('ใส่ชื่อรายการก่อนนะ เช่น "ข้าวเที่ยง", "ซื้อของใช้"')
    if (!amountSatang) return setError('ใส่จำนวนเงินที่มากกว่า 0 เช่น 250 หรือ 1,250.50')
    const input = { cardId, chargeDate: date, title: title.trim(), category: category.trim(), amountSatang, note: note.trim() }
    try {
      if (c) await unwrap(meow().portal.cards.charges.update(c.id, input))
      else await unwrap(meow().portal.cards.charges.create(input))
      props.onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form className="form" onSubmit={(e) => void submit(e)} noValidate>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="field-row">
        <div className="field">
          <label htmlFor="ch-card">บัตร</label>
          <select id="ch-card" className="input" value={cardId} onChange={(e) => setCardId(e.target.value)}>
            {props.cards.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ch-date">วันที่ใช้จ่าย</label>
          <input id="ch-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="ch-title">รายการ</label>
        <input id="ch-title" className="input" autoFocus maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ข้าวเที่ยง, ซื้อของใช้" />
      </div>
      <div className="field">
        <span className="field-label" id="ch-cat">หมวด</span>
        <div className="segmented" role="group" aria-labelledby="ch-cat" style={{ flexWrap: 'wrap', borderRadius: 12 }}>
          {CHARGE_CATEGORIES.map((k) => (
            <button key={k} type="button" aria-pressed={category === k} onClick={() => setCategory(category === k ? '' : k)}>{k}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="ch-amount">จำนวนเงิน (บาท)</label>
        <input id="ch-amount" className="input input-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </div>
      <div className="field">
        <label htmlFor="ch-note">หมายเหตุ</label>
        <input id="ch-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={props.onCancel}>ยกเลิก</button>
        <button type="submit" className="btn btn-primary">บันทึก</button>
      </div>
    </form>
  )
}

function PlanForm(props: { cardId: string; line: PlanLine | null; month: string; onCancel: () => void; onSaved: () => void }): React.JSX.Element {
  const p = props.line?.plan ?? null
  const [title, setTitle] = useState(p?.title ?? '')
  const [monthly, setMonthly] = useState(p ? satangToInput(p.monthlySatang) : '')
  const [total, setTotal] = useState(String(p?.totalMonths ?? 10))
  const [current, setCurrent] = useState(String(p ? Math.max(1, monthsBetween(p.startMonth, props.month) + 1) : 1))
  const [error, setError] = useState<string | null>(null)

  const totalN = Number(total)
  const currentN = Number(current)
  const valid = Number.isInteger(totalN) && totalN >= 2 && Number.isInteger(currentN) && currentN >= 1 && currentN <= totalN
  const startMonth = valid ? addMonths(props.month, -(currentN - 1)) : props.month
  const endMonth = valid ? addMonths(startMonth, totalN - 1) : props.month

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const monthlySatang = parseBahtToSatang(monthly)
    if (!title.trim()) return setError('ใส่ชื่อรายการผ่อนก่อนนะ เช่น "ผ่อนโทรศัพท์"')
    if (!monthlySatang) return setError('ใส่ยอดผ่อนต่อเดือนที่มากกว่า 0')
    if (!valid) return setError('จำนวนงวดต้องตั้งแต่ 2 ขึ้นไป และงวดปัจจุบันต้องอยู่ระหว่าง 1 ถึงจำนวนงวดทั้งหมด')
    const input = { cardId: props.cardId, title: title.trim(), totalMonths: totalN, monthlySatang, startMonth, note: '' }
    try {
      if (p) await unwrap(meow().portal.cards.plans.update(p.id, { ...input, note: p.note }))
      else await unwrap(meow().portal.cards.plans.create(input))
      props.onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form className="form" onSubmit={(e) => void submit(e)} noValidate>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="pl-title">รายการผ่อน</label>
        <input id="pl-title" className="input" autoFocus maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ผ่อนโทรศัพท์, ผ่อนตู้เย็น" />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="pl-monthly">ยอดผ่อนต่อเดือน (บาท)</label>
          <input id="pl-monthly" className="input input-amount" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="0.00" />
        </div>
        <div className="field">
          <label htmlFor="pl-total">ผ่อนทั้งหมดกี่งวด</label>
          <input id="pl-total" type="number" min={2} max={120} className="input" value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pl-current">รอบบิล{formatThaiMonth(props.month)} เป็นงวดที่</label>
        <input id="pl-current" type="number" min={1} max={valid ? totalN : 120} className="input" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <p className="info" aria-live="polite">
        {valid ? `เริ่มงวดที่ 1 ในรอบบิล${formatThaiMonth(startMonth)} · ผ่อนหมดในรอบบิล${formatThaiMonth(endMonth)} (เหลืออีก ${totalN - currentN} งวดหลังเดือนนี้)` : 'กรอกจำนวนงวดและงวดปัจจุบันให้ถูกต้อง'}
      </p>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={props.onCancel}>ยกเลิก</button>
        <button type="submit" className="btn btn-primary">บันทึก</button>
      </div>
    </form>
  )
}
