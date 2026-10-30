import { useMemo, useState, type FormEvent } from 'react'
import { addDays, addMonths, formatThaiDate, formatThaiMonth, monthsBetween, todayIso } from '@shared/dates'
import {
  normalizeTitle,
  planText,
  statementDateFor,
  type CardCharge,
  type CardRecurring,
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
import { autoScrollNear } from '../lib/dragScroll'
import { usePortal } from '../lib/portal'
import { useDeleteWithUndo } from '../lib/portalApi'
import { useLoad } from '../lib/useLoad'

type Editing =
  | { type: 'card'; card: CreditCard | null }
  | { type: 'charge'; cardId: string | null; charge: CardCharge | null }
  | { type: 'plan'; cardId: string; line: PlanLine | null }
  | { type: 'recurring'; cardId: string; rule: CardRecurring | null }
  | null

export function CardsPage({ startAddingCharge = false }: { startAddingCharge?: boolean }): React.JSX.Element {
  const { month, setMonth, dataVersion, refresh, toast } = usePortal()
  const [editing, setEditing] = useState<Editing>(startAddingCharge ? { type: 'charge', cardId: null, charge: null } : null)
  const { data, error, loading } = useLoad(`cards:${month}:${dataVersion}`, () => unwrap(meow().portal.cards.overview(month)))
  const { data: allCards } = useLoad(`cards-all:${dataVersion}`, () => unwrap(meow().portal.cards.list()))
  const delCharge = useDeleteWithUndo((id) => unwrap(meow().portal.cards.charges.remove(id)), (id) => unwrap(meow().portal.cards.charges.restore(id)), refresh)
  const delPlan = useDeleteWithUndo((id) => unwrap(meow().portal.cards.plans.remove(id)), (id) => unwrap(meow().portal.cards.plans.restore(id)), refresh)
  const { data: categories } = useLoad(`cards-cats:${dataVersion}`, () => unwrap(meow().categories.list()))
  const categoryNames = (categories ?? []).filter((k) => k.kind === 'expense').map((k) => k.name)
  const delRec = useDeleteWithUndo((id) => unwrap(meow().portal.cards.recurring.remove(id)), (id) => unwrap(meow().portal.cards.recurring.restore(id)), refresh)
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

  const setCardPaid = async (cardId: string, paid: boolean): Promise<void> => {
    try {
      const r = await unwrap(meow().portal.cards.setPaid(cardId, month, paid))
      refresh()
      toast(paid ? `จ่ายบิลแล้ว ${formatSatang(r.amountSatang)} · บันทึกไว้ในรายการรับ-จ่ายแล้ว` : 'ยกเลิกการจ่ายแล้ว')
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    }
  }

  const partnerPaid = async (cardId: string, paid: boolean): Promise<void> => {
    try {
      await unwrap(meow().portal.cards.partnerPaid(cardId, month, paid))
      refresh()
      toast(paid ? 'บันทึกว่าแฟนโอนแล้ว' : 'ยกเลิกการติ๊กแล้ว')
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    }
  }

  const createAllBills = async (): Promise<void> => {
    if (!data) return
    let made = 0
    try {
      for (const c of data.cards) {
        if (c.mineTotal > 0 && !c.bill) {
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

  // Card order: drag the grip of a card up or down (or Alt + arrow keys); the order is saved when you let go.
  const [liveIds, setLiveIds] = useState<string[] | null>(null)
  const [dragCardId, setDragCardId] = useState<string | null>(null)
  const savedCards = useMemo(() => data?.cards ?? [], [data])
  const orderedCards = useMemo(() => {
    // Keep showing the dropped order until the saved one has been reloaded (no flash back to the old order).
    if (!liveIds || !(dragCardId !== null || loading)) return savedCards
    const byId = new Map(savedCards.map((c) => [c.card.id, c]))
    const live = liveIds.map((id) => byId.get(id)).filter((c): c is CardStatementView => c !== undefined)
    return live.length === savedCards.length ? live : savedCards
  }, [savedCards, liveIds, dragCardId, loading])

  const saveCardOrder = async (ids: string[]): Promise<void> => {
    try {
      await unwrap(meow().portal.cards.reorder(ids))
      refresh()
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    }
  }
  const moveCard = (id: string, delta: -1 | 1): void => {
    const ids = orderedCards.map((c) => c.card.id)
    const from = ids.indexOf(id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to]!, ids[from]!]
    void saveCardOrder(ids)
  }
  const startCardDrag = (e: React.PointerEvent, id: string): void => {
    if (e.button !== 0) return
    e.preventDefault()
    const start = orderedCards.map((c) => c.card.id)
    let current = start
    setDragCardId(id)
    setLiveIds(start)
    const onMove = (ev: PointerEvent): void => {
      const hit = document.elementFromPoint(ev.clientX, ev.clientY)
      autoScrollNear(hit, ev.clientY)
      const row = hit?.closest<HTMLElement>('section[data-cardid]')
      const over = row?.dataset['cardid']
      if (!row || !over || over === id) return
      const from = current.indexOf(id)
      const to = current.indexOf(over)
      const rect = row.getBoundingClientRect()
      if ((to > from && ev.clientY < rect.top + rect.height / 2) || (to < from && ev.clientY > rect.top + rect.height / 2)) return
      const next = current.filter((x) => x !== id)
      next.splice(to, 0, id)
      current = next
      setLiveIds(next)
    }
    const onEnd = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      setDragCardId(null)
      if (current.some((x, i) => x !== start[i])) void saveCardOrder(current)
      else setLiveIds(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }

  const hasCards = (allCards?.length ?? 0) > 0
  const missingBills = data?.cards.filter((c) => c.mineTotal > 0 && !c.bill).length ?? 0

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
            {data.totalPartner > 0 && <span className="small">ส่วนของเรา {formatSatang(data.totalMine)} · ส่วนของแฟน {formatSatang(data.totalPartner)}</span>}
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

      {orderedCards.map((s) => (
        <CardSection
          key={s.card.id}
          s={s}
          dragging={dragCardId === s.card.id}
          ledgerRuleTitles={data?.ledgerRuleTitles ?? []}
          compact={dragCardId !== null}
          onGripPointerDown={(e) => startCardDrag(e, s.card.id)}
          onMoveCard={(d) => moveCard(s.card.id, d)}
          onBill={() => void createBill(s.card.id)}
          onEditCard={() => setEditing({ type: 'card', card: s.card })}
          onDeleteCard={() => void delCard(s.card.id, s.card.name)}
          onAddCharge={() => setEditing({ type: 'charge', cardId: s.card.id, charge: null })}
          onEditCharge={(charge) => setEditing({ type: 'charge', cardId: s.card.id, charge })}
          onDeleteCharge={(c) => void delCharge(c.id, c.title)}
          onAddPlan={() => setEditing({ type: 'plan', cardId: s.card.id, line: null })}
          onEditPlan={(line) => setEditing({ type: 'plan', cardId: s.card.id, line })}
          onDeletePlan={(line) => void delPlan(line.plan.id, line.plan.title)}
          onAddRecurring={() => setEditing({ type: 'recurring', cardId: s.card.id, rule: null })}
          onEditRecurring={(rule) => setEditing({ type: 'recurring', cardId: s.card.id, rule })}
          onDeleteRecurring={(rule) => void delRec(rule.id, rule.title)}
          onPartnerPaid={(paid) => void partnerPaid(s.card.id, paid)}
          onPaid={(paid) => void setCardPaid(s.card.id, paid)}
        />
      ))}

      {allCards?.some((c) => !c.isActive) && (
        <p className="muted small">มีบัตรที่ปิดการใช้งานไว้ {allCards.filter((c) => !c.isActive).length} ใบ (ไม่แสดงในรอบบิล) — เปิดใช้ใหม่ได้ที่ "แก้ไขบัตร"</p>
      )}

      <Modal open={editing !== null} title={editing?.type === 'card' ? (editing.card ? 'แก้ไขบัตร' : 'เพิ่มบัตรเครดิต') : editing?.type === 'charge' ? (editing.charge ? 'แก้ไขยอดใช้จ่าย' : 'เพิ่มยอดใช้จ่าย') : editing?.type === 'recurring' ? (editing.rule ? 'แก้ไขรายการประจำของบัตร' : 'เพิ่มรายการประจำของบัตร') : editing?.line ? 'แก้ไขรายการผ่อน' : 'เพิ่มรายการผ่อน'} onClose={() => setEditing(null)}>
        {editing?.type === 'card' && (
          <CardForm key={editing.card?.id ?? 'new'} initial={editing.card} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); toast('บันทึกบัตรแล้ว') }} />
        )}
        {editing?.type === 'charge' && allCards && (
          <ChargeForm key={editing.charge?.id ?? `new-${editing.cardId}`} cards={allCards.filter((c) => c.isActive)} initialCardId={editing.cardId} initial={editing.charge} month={month} categoryNames={categoryNames} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); toast('บันทึกยอดใช้จ่ายแล้ว') }} />
        )}
        {editing?.type === 'recurring' && (
          <RecurringForm key={editing.rule?.id ?? `new-${editing.cardId}`} cardId={editing.cardId} rule={editing.rule} ledgerRuleTitles={data?.ledgerRuleTitles ?? []} categoryNames={categoryNames} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); toast('บันทึกรายการประจำแล้ว') }} />
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
  onAddRecurring: () => void
  onEditRecurring: (r: CardRecurring) => void
  onDeleteRecurring: (r: CardRecurring) => void
  onPartnerPaid: (paid: boolean) => void
  onPaid: (paid: boolean) => void
  ledgerRuleTitles: string[]
  dragging: boolean
  /** While any card is being dragged every card folds to its title row, so they all fit on screen and can be passed over. */
  compact: boolean
  onGripPointerDown: (e: React.PointerEvent) => void
  onMoveCard: (delta: -1 | 1) => void
}): React.JSX.Element {
  const { s } = props
  const [showOld, setShowOld] = useState(false)
  const old = s.allPlans.filter((l) => l.state !== 'active')
  const due =
    s.bill?.isPaid ? 'จ่ายแล้ว' : s.daysToDue === null ? '' : s.daysToDue < 0 ? `เลยกำหนด ${-s.daysToDue} วัน` : s.daysToDue === 0 ? 'ครบกำหนดวันนี้' : `อีก ${s.daysToDue} วัน`

  if (props.compact) {
    return (
      <section className="card" aria-labelledby={`card-${s.card.id}`} data-cardid={s.card.id} style={props.dragging ? { background: 'var(--sky)' } : undefined}>
        <div className="card-title">
          <h2 id={`card-${s.card.id}`}>
            <span aria-hidden="true" style={{ marginRight: 6 }}>⠿</span>💳 {s.card.name}
          </h2>
          <strong>{formatSatang(s.total)}</strong>
        </div>
      </section>
    )
  }

  return (
    <section className="card" aria-labelledby={`card-${s.card.id}`} data-cardid={s.card.id} style={props.dragging ? { background: 'var(--sky)', transform: 'scale(1.005)' } : undefined}>
      <div className="card-title" style={{ flexWrap: 'wrap' }}>
        <div>
          <h2 id={`card-${s.card.id}`}>
            <button
              type="button"
              className="icon-btn"
              style={{ cursor: props.dragging ? 'grabbing' : 'grab', touchAction: 'none', marginRight: 6 }}
              aria-label={`จัดลำดับบัตร ${s.card.name}: ลากขึ้นลง หรือกด Alt + ลูกศรขึ้น/ลง`}
              title="ลากเพื่อเรียงลำดับบัตร"
              onPointerDown={props.onGripPointerDown}
              onKeyDown={(e) => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); props.onMoveCard(e.key === 'ArrowUp' ? -1 : 1) } }}
            >⠿</button>
            💳 {s.card.name}{s.card.issuer && <span className="muted small"> · {s.card.issuer}</span>}</h2>
          <p className="muted small">
            ตัดรอบ {formatThaiDate(s.statementDate)} · ครบกำหนดชำระ <strong>{formatThaiDate(s.dueDate)}</strong>
            {due && <> ({due})</>}
            {s.card.limitSatang && <> · วงเงิน {formatSatang(s.card.limitSatang)}</>}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="muted small">ยอดที่ต้องจ่ายรอบนี้</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 600 }}>{formatSatang(s.total)}</div>
          {s.partnerTotal > 0 && <div className="small">ส่วนของเรา <strong>{formatSatang(s.mineTotal)}</strong> · ส่วนของแฟน {formatSatang(s.partnerTotal)}</div>}
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
        {!s.bill && s.mineTotal > 0 && (
          <button type="button" className="btn btn-secondary" onClick={props.onBill}>
            สร้างรายการจ่ายบิล
          </button>
        )}
        {!s.bill?.isPaid && s.mineTotal > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => props.onPaid(true)}>
            ✓ จ่ายแล้ว {formatSatang(s.mineTotal)}
          </button>
        )}
        {s.bill?.isPaid && (
          <button type="button" className="btn btn-ghost" onClick={() => props.onPaid(false)}>
            ยกเลิกจ่าย
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={props.onEditCard}>แก้ไขบัตร</button>
        <button type="button" className="icon-btn" aria-label={`ลบบัตร ${s.card.name}`} title="ลบบัตร" onClick={props.onDeleteCard}>🗑️</button>
      </div>

      {s.duplicates.ids.length > 0 && (
        <div className="alert" role="status" style={{ marginBottom: 12 }}>
          มี {s.duplicates.ids.length} รายการในรอบนี้ที่ชื่อและยอดซ้ำกัน (ป้าย "อาจซ้ำ") ถ้าเป็นรายการเดียวกัน ยอดจะนับเกินไป {formatSatang(s.duplicates.excessSatang)} ลบรายการที่ซ้ำออกได้เลย (มักเกิดจากจดเองซ้ำกับรายการประจำของบัตร)
        </div>
      )}
      {s.bill?.isPaid && s.bill.amountSatang !== s.mineTotal && (
        <div className="alert" role="status" style={{ marginBottom: 12 }}>
          บิลที่จ่ายไปแล้ว {formatSatang(s.bill.amountSatang)} ไม่ตรงกับยอดรอบนี้ {formatSatang(s.mineTotal)} (มีรายการเพิ่มหรือแก้หลังจากกดจ่าย) ถ้ายังไม่ได้จ่ายส่วนต่าง กด “ยกเลิกจ่าย” แล้วกด “จ่ายแล้ว” ใหม่เพื่อปรับยอดให้ตรง
        </div>
      )}
      {s.partnerTotal > 0 && (
        <div className="info" style={{ marginBottom: 12 }}>
          <div>
            <strong>แฟนต้องโอนให้ {formatSatang(s.partnerTotal)}</strong> (ยอดเต็ม {formatSatang(s.total)} · ส่วนของเรา {formatSatang(s.mineTotal)})
            {s.partnerPayment && (
              <> — โอนแล้ว {formatSatang(s.partnerPayment.amountSatang)} เมื่อ {formatThaiDate(s.partnerPayment.paidDate)}{s.partnerPayment.amountSatang !== s.partnerTotal && ' (ยอดเปลี่ยนไปแล้ว ติ๊กใหม่เพื่ออัปเดต)'}</>
            )}
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}>
            {s.partnerPayment && s.partnerPayment.amountSatang === s.partnerTotal ? (
              <>
                <span className="badge badge-paid"><span aria-hidden="true">✓</span> แฟนโอนแล้ว</span>
                <button type="button" className="btn btn-ghost" onClick={() => props.onPartnerPaid(false)}>ยกเลิกการติ๊ก</button>
              </>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => props.onPartnerPaid(true)}>{s.partnerPayment ? 'อัปเดต: แฟนโอนแล้ว' : 'แฟนโอนแล้ว'}</button>
            )}
          </div>
        </div>
      )}

      <div className="card-title">
        <h3>🔁 รายการประจำทุกเดือน ({s.recurring.length})</h3>
        <button type="button" className="btn btn-secondary" onClick={props.onAddRecurring}>＋ เพิ่มรายการประจำ</button>
      </div>
      {s.recurring.length === 0 ? (
        <p className="muted">ค่าไฟ ค่าบริการรายเดือน หรือสมาชิกที่ตัดบัตรทุกเดือน ตั้งไว้ครั้งเดียว แอปจะใส่ยอดให้ทุกรอบบิลเอง</p>
      ) : (
        <ul className="tx-list" style={{ marginBottom: 16 }}>
          {s.recurring.map((r) => (
            <li key={r.id} className="tx-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto auto' }}>
              <div className="tx-main">
                <div className="tx-title">{r.title}{!r.isActive && <span className="badge badge-unpaid" style={{ marginLeft: 8 }}>หยุดไว้</span>}</div>
                <div className="tx-meta">
                  <span>ทุกวันที่ {r.dayOfMonth}</span>
                  {r.category && <span className="badge badge-unpaid">{r.category}</span>}
                  {r.partnerSatang > 0 && <PartnerBadge share={r.partnerSatang} total={r.amountSatang} />}
                  {props.ledgerRuleTitles.includes(normalizeTitle(r.title)) && <span className="badge badge-overdue" title="มีรายการประจำชื่อเดียวกันในหน้า รายการประจำ ด้วย"><span aria-hidden="true">!</span> ซ้ำกับหน้ารายการประจำ</span>}
                  <span>{formatThaiMonth(r.startMonth)} ถึง {r.endMonth ? formatThaiMonth(r.endMonth) : 'ไม่กำหนดสิ้นสุด'}</span>
                </div>
              </div>
              <span className="tx-amount expense">{formatSatang(r.amountSatang)}</span>
              <span className="tx-actions">
                <button type="button" className="icon-btn" aria-label={`แก้ไข ${r.title}`} title="แก้ไข" onClick={() => props.onEditRecurring(r)}>✏️</button>
                <button type="button" className="icon-btn" aria-label={`ลบ ${r.title}`} title="ลบ" onClick={() => props.onDeleteRecurring(r)}>🗑️</button>
              </span>
            </li>
          ))}
        </ul>
      )}

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
                  <div className="tx-meta"><span>{formatThaiDate(c.chargeDate)}</span>{c.category && <span className="badge badge-unpaid">{c.category}</span>}{s.duplicates.ids.includes(c.id) && <span className="badge badge-overdue" title="มีรายการชื่อและยอดเดียวกันในรอบนี้"><span aria-hidden="true">!</span> อาจซ้ำ</span>}{c.partnerSatang > 0 && <PartnerBadge share={c.partnerSatang} total={c.amountSatang} />}{c.note && <span>{c.note}</span>}</div>
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
        <div className="tx-meta"><span>{planText(line, formatThaiMonth)}</span>{line.plan.partnerSatang > 0 && <PartnerBadge share={line.plan.partnerSatang} total={line.plan.monthlySatang} />}</div>
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

function ChargeForm(props: { cards: CreditCard[]; initialCardId: string | null; initial: CardCharge | null; month: string; categoryNames: string[]; onCancel: () => void; onSaved: () => void }): React.JSX.Element {
  const c = props.initial
  const [cardId, setCardId] = useState(c?.cardId ?? props.initialCardId ?? props.cards[0]?.id ?? '')
  const [date, setDate] = useState(c?.chargeDate ?? todayIso())
  const [title, setTitle] = useState(c?.title ?? '')
  const [category, setCategory] = useState(c?.category ?? '')
  const [amount, setAmount] = useState(c ? satangToInput(c.amountSatang) : '')
  const [partner, setPartner] = useState(c?.partnerSatang ? satangToInput(c.partnerSatang) : '')
  const [note, setNote] = useState(c?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [dupWarning, setDupWarning] = useState<string | null>(null)
  /** What the user already chose to save twice, so the warning is not shown again for the same entry. */
  const [acknowledged, setAcknowledged] = useState('')

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const amountSatang = parseBahtToSatang(amount)
    if (!cardId) return setError('เลือกบัตรก่อนนะ')
    if (!title.trim()) return setError('ใส่ชื่อรายการก่อนนะ เช่น "ข้าวเที่ยง", "ซื้อของใช้"')
    if (!amountSatang) return setError('ใส่จำนวนเงินที่มากกว่า 0 เช่น 250 หรือ 1,250.50')
    const partnerSatang = parsePartner(partner, amountSatang)
    if (partnerSatang === null) return setError('ส่วนของแฟนอ่านไม่ได้ หรือเกินยอดทั้งหมด')
    const input = { cardId, chargeDate: date, title: title.trim(), category: category.trim(), amountSatang, partnerSatang, note: note.trim() }
    const signature = `|||`
    try {
      if (acknowledged !== signature) {
        const twins = await unwrap(meow().portal.cards.charges.duplicates(input, c?.id ?? null))
        if (twins.length > 0) {
          setAcknowledged(signature)
          setDupWarning(`มียอด "${title.trim()}" ${formatSatang(amountSatang)} ในรอบบิลนี้อยู่แล้ว ${twins.length} รายการ (อาจจดซ้ำ หรือรายการประจำของบัตรสร้างให้แล้ว) ถ้าเป็นคนละรายการจริง กด "บันทึก" อีกครั้ง`)
          return
        }
      }
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
      {dupWarning && <div className="alert" role="alert">{dupWarning}</div>}
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
      <CategorySelect id="ch-cat" value={category} names={props.categoryNames} onChange={setCategory} />
      <div className="field">
        <label htmlFor="ch-amount">จำนวนเงิน (บาท)</label>
        <input id="ch-amount" className="input input-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </div>
      <PartnerField id="ch-partner" total={amount} value={partner} onChange={setPartner} />
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
  const [partner, setPartner] = useState(p?.partnerSatang ? satangToInput(p.partnerSatang) : '')
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
    const partnerSatang = parsePartner(partner, monthlySatang)
    if (partnerSatang === null) return setError('ส่วนของแฟนอ่านไม่ได้ หรือเกินยอดผ่อนต่อเดือน')
    const input = { cardId: props.cardId, title: title.trim(), totalMonths: totalN, monthlySatang, partnerSatang, startMonth, note: '' }
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
      <PartnerField id="pl-partner" total={monthly} value={partner} onChange={setPartner} perMonth />
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

function CategorySelect(props: { id: string; value: string; names: string[]; onChange: (v: string) => void }): React.JSX.Element {
  // Keep a value that is no longer in the category list (older entries) selectable instead of silently dropping it.
  const names = props.value && !props.names.includes(props.value) ? [props.value, ...props.names] : props.names
  return (
    <div className="field">
      <label htmlFor={props.id}>หมวดหมู่</label>
      <select id={props.id} className="input" value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">ไม่ระบุ</option>
        {names.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  )
}

function RecurringForm(props: { cardId: string; rule: CardRecurring | null; ledgerRuleTitles: string[]; categoryNames: string[]; onCancel: () => void; onSaved: () => void }): React.JSX.Element {
  const r = props.rule
  const [title, setTitle] = useState(r?.title ?? '')
  const [category, setCategory] = useState(r?.category ?? '')
  const [amount, setAmount] = useState(r ? satangToInput(r.amountSatang) : '')
  const [partner, setPartner] = useState(r?.partnerSatang ? satangToInput(r.partnerSatang) : '')
  const [day, setDay] = useState(String(r?.dayOfMonth ?? 1))
  const [startMonth, setStartMonth] = useState(r?.startMonth ?? todayIso().slice(0, 7))
  const [endMonth, setEndMonth] = useState(r?.endMonth ?? '')
  const [isActive, setIsActive] = useState(r?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const amountSatang = parseBahtToSatang(amount)
    const dayN = Number(day)
    if (!title.trim()) return setError('ใส่ชื่อรายการก่อนนะ เช่น "ค่าไฟ", "Netflix"')
    if (!amountSatang) return setError('ใส่จำนวนเงินที่มากกว่า 0 เช่น 1,200')
    if (!Number.isInteger(dayN) || dayN < 1 || dayN > 31) return setError('วันที่ตัดบัตรต้องเป็นเลข 1–31')
    if (!/^\d{4}-\d{2}$/.test(startMonth)) return setError('เลือกเดือนที่เริ่มด้วยนะ')
    if (endMonth && endMonth < startMonth) return setError('เดือนสิ้นสุดต้องไม่ก่อนเดือนที่เริ่ม')
    const partnerSatang = parsePartner(partner, amountSatang)
    if (partnerSatang === null) return setError('ส่วนของแฟนอ่านไม่ได้ หรือเกินจำนวนเงินต่อเดือน')
    const input = { cardId: props.cardId, title: title.trim(), category, amountSatang, partnerSatang, dayOfMonth: dayN, startMonth, endMonth: endMonth || null, note: r?.note ?? '', isActive }
    try {
      if (r) await unwrap(meow().portal.cards.recurring.update(r.id, input))
      else await unwrap(meow().portal.cards.recurring.create(input))
      props.onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form className="form" onSubmit={(e) => void submit(e)} noValidate>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="rc-title">รายการ</label>
        <input id="rc-title" className="input" autoFocus maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ค่าไฟ, Netflix, ค่าอินเทอร์เน็ต" />
      </div>
      {title.trim() !== '' && props.ledgerRuleTitles.includes(normalizeTitle(title)) && (
        <p className="alert" role="status">มีรายการประจำชื่อ "{title.trim()}" ในหน้า รายการประจำ อยู่แล้ว ถ้าเป็นบิลเดียวกันที่จ่ายผ่านบัตรนี้ ให้เก็บไว้ที่เดียว (ลบอีกที่ออก) ไม่งั้นยอดจะนับสองรอบ</p>
      )}
      <CategorySelect id="rc-cat" value={category} names={props.categoryNames} onChange={setCategory} />
      <div className="field-row">
        <div className="field">
          <label htmlFor="rc-amount">จำนวนเงินต่อเดือน (บาท)</label>
          <input id="rc-amount" className="input input-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="field">
          <label htmlFor="rc-day">ตัดบัตรทุกวันที่</label>
          <input id="rc-day" type="number" min={1} max={31} className="input" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
      </div>
      <PartnerField id="rc-partner" total={amount} value={partner} onChange={setPartner} perMonth />
      <div className="field-row">
        <div className="field">
          <label htmlFor="rc-start">เริ่มเดือน</label>
          <input id="rc-start" type="month" className="input" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rc-end">สิ้นสุดเดือน (ไม่บังคับ)</label>
          <input id="rc-end" type="month" className="input" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
        </div>
      </div>
      <label className="check"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> ใช้งานอยู่ (ปิดไว้เพื่อหยุดสร้างยอดเดือนต่อ ๆ ไป)</label>
      <p className="info">แอปใส่ยอดนี้ให้ทุกเดือนตามวันตัดรอบของบัตร การแก้ไขมีผลกับเดือนที่ยังไม่ถูกสร้าง ส่วนเดือนที่สร้างแล้วแก้ทีละรายการได้ในรายการยอดใช้จ่าย</p>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={props.onCancel}>ยกเลิก</button>
        <button type="submit" className="btn btn-primary">บันทึก</button>
      </div>
    </form>
  )
}

/** Partner's share typed in baht; empty/0 = none. Returns null when unreadable or larger than the whole amount. */
function parsePartner(text: string, totalSatang: number): number | null {
  const v = text.trim()
  if (!v || Number(v.replace(/,/g, '')) === 0) return 0
  const satang = parseBahtToSatang(v)
  return satang !== null && satang !== 0 && satang <= totalSatang ? satang : null
}

function PartnerBadge(props: { share: number; total: number }): React.JSX.Element {
  return (
    <span className="badge badge-unpaid">
      {props.share >= props.total ? 'แฟนจ่ายทั้งหมด' : `แฟนช่วย ${formatSatang(props.share)}`}
    </span>
  )
}

/** "Who pays?" — ours (0), the partner's whole amount, half, or any amount. The total is the text of the amount field above. */
function PartnerField(props: { id: string; total: string; value: string; onChange: (v: string) => void; perMonth?: boolean }): React.JSX.Element {
  const total = parseBahtToSatang(props.total)
  const share = parsePartner(props.value, total ?? 0)
  const mode = !props.value.trim() || share === 0 ? 'mine' : total !== null && share === total ? 'all' : 'split'
  return (
    <div className="field">
      <span className="field-label" id={`${props.id}-label`}>ใครจ่าย{props.perMonth ? ' (ต่อเดือน)' : ''}</span>
      <div className="segmented" role="group" aria-labelledby={`${props.id}-label`} style={{ flexWrap: 'wrap', borderRadius: 12 }}>
        <button type="button" aria-pressed={mode === 'mine'} onClick={() => props.onChange('')}>เราจ่ายเอง</button>
        <button type="button" aria-pressed={mode === 'all'} disabled={total === null} onClick={() => props.onChange(props.total)}>แฟนจ่ายทั้งหมด</button>
        <button type="button" aria-pressed={mode === 'split'} disabled={total === null} onClick={() => total !== null && props.onChange(satangToInput(Math.floor(total / 2)))}>หารครึ่ง</button>
      </div>
      <label htmlFor={props.id} className="muted small">ส่วนของแฟน (บาท) — ใส่เองได้ ว่างไว้ = เราจ่ายเอง</label>
      <input id={props.id} className="input input-amount" inputMode="decimal" value={props.value} onChange={(e) => props.onChange(e.target.value)} placeholder="0.00" />
      {total !== null && share !== null && share > 0 && <p className="muted small">ส่วนของเรา {formatSatang(total - share)} · ส่วนของแฟน {formatSatang(share)}</p>}
      {share === null && props.value.trim() !== '' && <p className="muted small">ส่วนของแฟนอ่านไม่ได้ หรือเกินยอดทั้งหมด</p>}
    </div>
  )
}