import { randomUUID } from 'node:crypto'
import {
  billMonthFor,
  billTitle,
  buildStatement,
  overviewOf,
  type CardBillInfo,
  type CardCharge,
  type CardInput,
  type CardRecurring,
  type CardRecurringInput,
  type CardStatementView,
  type ChargeInput,
  type CardPlan,
  type CardsOverview,
  type CreateBillResult,
  type CreditCard,
  type PartnerPaymentInfo,
  type PlanInput,
  type SetCardPaidResult
} from '@shared/cards'
import { addMonths, formatThaiMonth, recurringDateFor } from '@shared/dates'
import { formatSatang } from '@shared/money'
import { GENERATED_UPDATED_AT } from '@shared/syncModel'
import { NotFoundError } from './catalogRepo'
import { inTransaction, nowIso, type Db } from './connection'
import { DEFAULT_CATEGORIES } from './defaults'
import { deterministicId } from './ids'
import { getTransaction, setPaid } from './transactionRepo'

type Row = Record<string, unknown>
const all = (db: Db, sql: string, ...args: Array<string | number | null>): Row[] => db.prepare(sql).all(...args) as unknown as Row[]
const one = (db: Db, sql: string, ...args: Array<string | number | null>): Row | undefined => db.prepare(sql).get(...args) as unknown as Row | undefined

/* ---------- row → entity ---------- */

const toCard = (r: Row): CreditCard => ({
  id: r['id'] as string,
  name: r['name'] as string,
  issuer: r['issuer'] as string,
  statementDay: r['statement_day'] as number,
  dueDay: r['due_day'] as number,
  limitSatang: r['limit_satang'] as number | null,
  isActive: r['is_active'] === 1,
  sortOrder: r['sort_order'] as number
})

const toCharge = (r: Row): CardCharge => ({
  id: r['id'] as string,
  cardId: r['card_id'] as string,
  chargeDate: r['charge_date'] as string,
  title: r['title'] as string,
  category: r['category'] as string,
  amountSatang: r['amount_satang'] as number,
  partnerSatang: r['partner_satang'] as number,
  note: r['note'] as string,
  billMonth: r['bill_month'] as string
})

const toPlan = (r: Row): CardPlan => ({
  id: r['id'] as string,
  cardId: r['card_id'] as string,
  title: r['title'] as string,
  totalMonths: r['total_months'] as number,
  monthlySatang: r['monthly_satang'] as number,
  partnerSatang: r['partner_satang'] as number,
  startMonth: r['start_month'] as string,
  note: r['note'] as string
})

const toRecurring = (r: Row): CardRecurring => ({
  id: r['id'] as string,
  cardId: r['card_id'] as string,
  title: r['title'] as string,
  category: r['category'] as string,
  amountSatang: r['amount_satang'] as number,
  dayOfMonth: r['day_of_month'] as number,
  startMonth: r['start_month'] as string,
  endMonth: r['end_month'] as string | null,
  partnerSatang: r['partner_satang'] as number,
  note: r['note'] as string,
  isActive: r['is_active'] === 1
})

/* ---------- cards ---------- */

export function listCards(db: Db): CreditCard[] {
  return all(db, 'SELECT * FROM credit_cards WHERE deleted_at IS NULL ORDER BY is_active DESC, sort_order, created_at').map(toCard)
}

export function getCard(db: Db, id: string): CreditCard {
  const r = one(db, 'SELECT * FROM credit_cards WHERE id = ? AND deleted_at IS NULL', id)
  if (!r) throw new NotFoundError('ไม่พบบัตรใบนี้')
  return toCard(r)
}

export function createCard(db: Db, input: CardInput): CreditCard {
  const id = randomUUID()
  const now = nowIso()
  const max = one(db, 'SELECT COALESCE(MAX(sort_order), -1) AS m FROM credit_cards') as { m: number }
  db.prepare(
    `INSERT INTO credit_cards (id, name, issuer, statement_day, due_day, limit_satang, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.name, input.issuer, input.statementDay, input.dueDay, input.limitSatang, input.isActive ? 1 : 0, max.m + 1, now, now)
  return getCard(db, id)
}

/** Changing the statement day re-files every charge of the card into the right statement. */
export function updateCard(db: Db, id: string, input: CardInput): CreditCard {
  const before = getCard(db, id)
  return inTransaction(db, () => {
    const now = nowIso()
    db.prepare(
      `UPDATE credit_cards SET name = ?, issuer = ?, statement_day = ?, due_day = ?, limit_satang = ?, is_active = ?,
         updated_at = ?, dirty = 1 WHERE id = ?`
    ).run(input.name, input.issuer, input.statementDay, input.dueDay, input.limitSatang, input.isActive ? 1 : 0, now, id)
    if (before.statementDay !== input.statementDay) {
      const rows = all(db, 'SELECT id, charge_date, bill_month FROM card_charges WHERE card_id = ? AND deleted_at IS NULL', id)
      const update = db.prepare('UPDATE card_charges SET bill_month = ?, updated_at = ?, dirty = 1 WHERE id = ?')
      for (const r of rows) {
        const month = billMonthFor(r['charge_date'] as string, input.statementDay)
        if (month !== r['bill_month']) update.run(month, now, r['id'] as string)
      }
    }
    return getCard(db, id)
  })
}

/* ---------- charges ---------- */

export function createCharge(db: Db, input: ChargeInput): CardCharge {
  const card = getCard(db, input.cardId)
  const id = randomUUID()
  const now = nowIso()
  db.prepare(
    `INSERT INTO card_charges (id, card_id, charge_date, title, category, amount_satang, partner_satang, note, bill_month, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.cardId, input.chargeDate, input.title, input.category, input.amountSatang, input.partnerSatang, input.note, billMonthFor(input.chargeDate, card.statementDay), now, now)
  return toCharge(one(db, 'SELECT * FROM card_charges WHERE id = ?', id) as Row)
}

export function updateCharge(db: Db, id: string, input: ChargeInput): CardCharge {
  const card = getCard(db, input.cardId)
  const r = db
    .prepare(
      `UPDATE card_charges SET card_id = ?, charge_date = ?, title = ?, category = ?, amount_satang = ?, partner_satang = ?, note = ?, bill_month = ?,
         updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL`
    )
    .run(input.cardId, input.chargeDate, input.title, input.category, input.amountSatang, input.partnerSatang, input.note, billMonthFor(input.chargeDate, card.statementDay), nowIso(), id)
  if (r.changes === 0) throw new NotFoundError('ไม่พบรายการใช้จ่ายนี้')
  return toCharge(one(db, 'SELECT * FROM card_charges WHERE id = ?', id) as Row)
}

/* ---------- instalment plans ---------- */

export function createPlan(db: Db, input: PlanInput): CardPlan {
  getCard(db, input.cardId)
  const id = randomUUID()
  const now = nowIso()
  db.prepare(
    `INSERT INTO card_plans (id, card_id, title, total_months, monthly_satang, partner_satang, start_month, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.cardId, input.title, input.totalMonths, input.monthlySatang, input.partnerSatang, input.startMonth, input.note, now, now)
  return toPlan(one(db, 'SELECT * FROM card_plans WHERE id = ?', id) as Row)
}

export function updatePlan(db: Db, id: string, input: PlanInput): CardPlan {
  getCard(db, input.cardId)
  const r = db
    .prepare(
      `UPDATE card_plans SET card_id = ?, title = ?, total_months = ?, monthly_satang = ?, partner_satang = ?, start_month = ?, note = ?,
         updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL`
    )
    .run(input.cardId, input.title, input.totalMonths, input.monthlySatang, input.partnerSatang, input.startMonth, input.note, nowIso(), id)
  if (r.changes === 0) throw new NotFoundError('ไม่พบรายการผ่อนนี้')
  return toPlan(one(db, 'SELECT * FROM card_plans WHERE id = ?', id) as Row)
}

/* ---------- monthly repeating charges ---------- */

export function listCardRecurring(db: Db): CardRecurring[] {
  return all(db, 'SELECT * FROM card_recurring WHERE deleted_at IS NULL ORDER BY day_of_month, created_at').map(toRecurring)
}

export function createCardRecurring(db: Db, input: CardRecurringInput): CardRecurring {
  getCard(db, input.cardId)
  const id = randomUUID()
  const now = nowIso()
  db.prepare(
    `INSERT INTO card_recurring (id, card_id, title, category, amount_satang, partner_satang, day_of_month, start_month, end_month, note, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.cardId, input.title, input.category, input.amountSatang, input.partnerSatang, input.dayOfMonth, input.startMonth, input.endMonth, input.note, input.isActive ? 1 : 0, now, now)
  return toRecurring(one(db, 'SELECT * FROM card_recurring WHERE id = ?', id) as Row)
}

/** Changing a rule affects the months that have not been created yet; charges already made stay as they are (edit them one by one). */
export function updateCardRecurring(db: Db, id: string, input: CardRecurringInput): CardRecurring {
  getCard(db, input.cardId)
  const r = db
    .prepare(
      `UPDATE card_recurring SET card_id = ?, title = ?, category = ?, amount_satang = ?, partner_satang = ?, day_of_month = ?, start_month = ?, end_month = ?,
         note = ?, is_active = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL`
    )
    .run(input.cardId, input.title, input.category, input.amountSatang, input.partnerSatang, input.dayOfMonth, input.startMonth, input.endMonth, input.note, input.isActive ? 1 : 0, nowIso(), id)
  if (r.changes === 0) throw new NotFoundError('ไม่พบรายการประจำนี้')
  return toRecurring(one(db, 'SELECT * FROM card_recurring WHERE id = ?', id) as Row)
}

/** Same id on every device for "the charge of repeating rule R in calendar month M". Key must never change. */
export const recurringChargeId = (ruleId: string, month: string): string => deterministicId(`cardrec:${ruleId}:${month}`)

/**
 * Create the charges of every active repeating rule for one calendar month. Safe to call again and again:
 * the id is fixed, so a charge that exists (or that the user deleted) is never created a second time, and a
 * generated charge always loses to a real edit made on another device.
 */
export function ensureCardRecurringForMonth(db: Db, month: string): number {
  const rules = all(
    db,
    `SELECT r.* FROM card_recurring r JOIN credit_cards c ON c.id = r.card_id AND c.deleted_at IS NULL
     WHERE r.deleted_at IS NULL AND r.is_active = 1 AND r.start_month <= ? AND (r.end_month IS NULL OR r.end_month >= ?)`,
    month,
    month
  ).map(toRecurring)
  if (rules.length === 0) return 0
  const statementDays = new Map(listCards(db).map((c) => [c.id, c.statementDay]))
  const insert = db.prepare(
    `INSERT OR IGNORE INTO card_charges (id, card_id, charge_date, title, category, amount_satang, partner_satang, note, bill_month, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  return inTransaction(db, () => {
    let created = 0
    const now = nowIso()
    for (const r of rules) {
      const date = recurringDateFor(month, r.dayOfMonth)
      const result = insert.run(
        recurringChargeId(r.id, month),
        r.cardId,
        date,
        r.title,
        r.category,
        r.amountSatang,
        r.partnerSatang,
        r.note,
        billMonthFor(date, statementDays.get(r.cardId) ?? 25),
        now,
        GENERATED_UPDATED_AT
      )
      created += Number(result.changes)
    }
    return created
  })
}

/* ---------- monthly overview ---------- */

/** Same id on every device for "the bill of card X for statement month M". Key must never change. */
export const cardBillId = (cardId: string, month: string): string => deterministicId(`cardbill:${cardId}:${month}`)

function billInfo(db: Db, cardId: string, month: string, today: string): CardBillInfo | null {
  const id = cardBillId(cardId, month)
  const r = one(db, 'SELECT id FROM transactions WHERE id = ? AND deleted_at IS NULL', id)
  if (!r) return null
  const t = getTransaction(db, id, today)
  return { transactionId: id, isPaid: t.isPaid, amountSatang: t.amountSatang, status: t.status }
}

/** Same id on every device for "the partner's repayment of card X for statement month M". Key must never change. */
export const partnerPaymentId = (cardId: string, month: string): string => deterministicId(`cardpartner:${cardId}:${month}`)

function partnerPaymentInfo(db: Db, cardId: string, month: string): PartnerPaymentInfo | null {
  const r = one(db, 'SELECT amount_satang, paid_date FROM card_partner_payments WHERE id = ? AND deleted_at IS NULL', partnerPaymentId(cardId, month))
  return r ? { amountSatang: r['amount_satang'] as number, paidDate: r['paid_date'] as string } : null
}

/** Statement overview WITHOUT creating any repeating charges first (use cardsOverview unless you did that yourself). */
export function buildOverview(db: Db, month: string, today: string): CardsOverview {
  const cards = listCards(db).filter((c) => c.isActive)
  const recurring = listCardRecurring(db)
  const charges = all(db, 'SELECT * FROM card_charges WHERE deleted_at IS NULL AND bill_month = ?', month).map(toCharge)
  const plans = all(db, 'SELECT * FROM card_plans WHERE deleted_at IS NULL').map(toPlan)
  return overviewOf(
    month,
    cards.map((card) => ({ ...buildStatement(card, charges, plans, month, recurring), bill: billInfo(db, card.id, month, today), partnerPayment: partnerPaymentInfo(db, card.id, month) })),
    today
  )
}

export function cardsOverview(db: Db, month: string, today: string): CardsOverview {
  // A statement holds purchases from the previous calendar month and this one, so create both months' repeating charges first.
  ensureCardRecurringForMonth(db, addMonths(month, -1))
  ensureCardRecurringForMonth(db, month)
  return buildOverview(db, month, today)
}

function billNote(s: CardStatementView): string {
  return s.partnerTotal > 0
    ? `ส่วนของเรา (ยอดเต็มของบัตร ${formatSatang(s.total)} · แฟนจ่าย ${formatSatang(s.partnerTotal)}) รอบบิล ${formatThaiMonth(s.month)}`
    : `สร้างจากยอดบัตรเครดิต (รอบบิล ${formatThaiMonth(s.month)})`
}

/**
 * Put this statement into the ledger as an unpaid expense due on the card's due date, so it shows up on the
 * dashboard, calendar and reminders like any other bill. Safe to press again: the same bill is updated (never
 * duplicated), and a bill that is already paid is left alone.
 */
export function createCardBill(db: Db, cardId: string, month: string, today: string): CreateBillResult {
  const card = getCard(db, cardId)
  const overview = cardsOverview(db, month, today)
  const statement = overview.cards.find((c) => c.card.id === cardId)
  if (!statement) throw new NotFoundError('บัตรใบนี้ถูกปิดการใช้งานอยู่')
  if (statement.total <= 0) throw new NotFoundError('เดือนนี้ยังไม่มียอดของบัตรนี้')
  // Only OUR part is an expense of ours; the partner's part is tracked on the statement (and repaid via setPartnerPaid).
  if (statement.mineTotal <= 0) throw new NotFoundError('รอบนี้แฟนจ่ายทั้งหมด จึงไม่มีส่วนของเราให้สร้างเป็นรายการจ่ายบิล')
  const mine = statement.mineTotal
  const note = billNote(statement)

  const id = cardBillId(cardId, month)
  const title = billTitle(card.name, month, formatThaiMonth)
  const categoryId = (one(db, 'SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL', DEFAULT_CATEGORIES.find((c) => c.name === 'บัตรเครดิต')?.id ?? '') as { id: string } | undefined)?.id ?? null
  const existing = one(db, 'SELECT is_paid FROM transactions WHERE id = ?', id)
  const now = nowIso()

  if (existing && existing['is_paid'] === 1) {
    return { action: 'paid', transactionId: id, amountSatang: getTransaction(db, id, today).amountSatang }
  }
  if (existing) {
    db.prepare(
      `UPDATE transactions SET title = ?, amount_satang = ?, txn_date = ?, due_date = ?, category_id = COALESCE(category_id, ?),
         deleted_at = NULL, updated_at = ?, dirty = 1 WHERE id = ?`
    ).run(title, mine, statement.dueDate, statement.dueDate, categoryId, now, id)
    db.prepare('UPDATE transactions SET note = ? WHERE id = ? AND note LIKE ?').run(note, id, 'สร้างจาก%')
    db.prepare('UPDATE transactions SET note = ? WHERE id = ? AND note LIKE ?').run(note, id, 'ส่วนของเรา%')
    return { action: 'updated', transactionId: id, amountSatang: mine }
  }
  db.prepare(
    `INSERT INTO transactions (id, kind, title, amount_satang, category_id, txn_date, due_date, is_paid, note, created_at, updated_at)
     VALUES (?, 'expense', ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(id, title, mine, categoryId, statement.dueDate, statement.dueDate, note, now, now)
  return { action: 'created', transactionId: id, amountSatang: mine }
}

/**
 * Record (or undo) that the partner has transferred their part of a statement back. Saved with a fixed id so it
 * syncs like everything else; ticking again after the share changed simply records the new amount.
 */
export function setPartnerPaid(db: Db, cardId: string, month: string, paid: boolean, today: string): PartnerPaymentInfo | null {
  getCard(db, cardId)
  const id = partnerPaymentId(cardId, month)
  const now = nowIso()
  if (!paid) {
    db.prepare('UPDATE card_partner_payments SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL').run(now, now, id)
    return null
  }
  const statement = cardsOverview(db, month, today).cards.find((c) => c.card.id === cardId)
  if (!statement) throw new NotFoundError('บัตรใบนี้ถูกปิดการใช้งานอยู่')
  if (statement.partnerTotal <= 0) throw new NotFoundError('รอบนี้ไม่มีส่วนของแฟน')
  db.prepare(
    `INSERT INTO card_partner_payments (id, card_id, bill_month, amount_satang, paid_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET amount_satang = excluded.amount_satang, paid_date = excluded.paid_date,
       deleted_at = NULL, updated_at = excluded.updated_at, dirty = 1`
  ).run(id, cardId, month, statement.partnerTotal, today, now, now)
  return { amountSatang: statement.partnerTotal, paidDate: today }
}

/**
 * Mark the statement's bill as paid (or undo it). The bill is created first when it does not exist yet, so one press
 * puts "which card, how much" into the ledger — as a paid expense — in the month it is due.
 */
export function setCardPaid(db: Db, cardId: string, month: string, paid: boolean, today: string): SetCardPaidResult {
  const id = cardBillId(cardId, month)
  getCard(db, cardId)
  if (paid) {
    createCardBill(db, cardId, month, today) // creates or refreshes the amount; leaves an already-paid bill alone
    setPaid(db, id, true, today)
  } else if (one(db, 'SELECT id FROM transactions WHERE id = ? AND deleted_at IS NULL', id)) {
    setPaid(db, id, false, today)
  }
  const t = one(db, 'SELECT id FROM transactions WHERE id = ? AND deleted_at IS NULL', id) ? getTransaction(db, id, today) : null
  return { isPaid: t?.isPaid ?? false, transactionId: id, amountSatang: t?.amountSatang ?? 0 }
}

/**
 * Keep every UNPAID ledger bill equal to what its statement really is now (charges, instalments, repeating charges and the
 * partner's share all move the total). Bills that are paid are never touched; a bill whose statement became empty is removed.
 * Looks one year back and one year ahead, and only at months that already have a bill, so browsing never creates anything.
 */
export function refreshCardBills(db: Db, today: string): number {
  const cards = listCards(db).filter((c) => c.isActive)
  if (cards.length === 0) return 0
  const thisMonth = today.slice(0, 7)
  let changed = 0
  for (let i = -12; i <= 12; i++) {
    const month = addMonths(thisMonth, i)
    const open = cards.filter((c) => one(db, 'SELECT 1 AS x FROM transactions WHERE id = ? AND deleted_at IS NULL AND is_paid = 0', cardBillId(c.id, month)))
    if (open.length === 0) continue
    const overview = cardsOverview(db, month, today)
    for (const s of overview.cards) {
      if (!open.some((c) => c.id === s.card.id)) continue
      const id = cardBillId(s.card.id, month)
      const now = nowIso()
      if (s.mineTotal <= 0) {
        db.prepare('UPDATE transactions SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?').run(now, now, id)
        changed++
        continue
      }
      const row = one(db, 'SELECT amount_satang, due_date, note FROM transactions WHERE id = ?', id) as Row
      const note = String(row['note']).startsWith('สร้างจาก') || String(row['note']).startsWith('ส่วนของเรา') ? billNote(s) : String(row['note'])
      if (row['amount_satang'] === s.mineTotal && row['due_date'] === s.dueDate && row['note'] === note) continue
      db.prepare('UPDATE transactions SET amount_satang = ?, txn_date = ?, due_date = ?, note = ?, updated_at = ?, dirty = 1 WHERE id = ?').run(
        s.mineTotal, s.dueDate, s.dueDate, note, now, id
      )
      changed++
    }
  }
  return changed
}