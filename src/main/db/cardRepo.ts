import { randomUUID } from 'node:crypto'
import {
  billMonthFor,
  billTitle,
  buildStatement,
  overviewOf,
  type CardBillInfo,
  type CardCharge,
  type CardInput,
  type ChargeInput,
  type CardPlan,
  type CardsOverview,
  type CreateBillResult,
  type CreditCard,
  type PlanInput
} from '@shared/cards'
import { formatThaiMonth } from '@shared/dates'
import { NotFoundError } from './catalogRepo'
import { inTransaction, nowIso, type Db } from './connection'
import { DEFAULT_CATEGORIES } from './defaults'
import { deterministicId } from './ids'
import { getTransaction } from './transactionRepo'

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
  note: r['note'] as string,
  billMonth: r['bill_month'] as string
})

const toPlan = (r: Row): CardPlan => ({
  id: r['id'] as string,
  cardId: r['card_id'] as string,
  title: r['title'] as string,
  totalMonths: r['total_months'] as number,
  monthlySatang: r['monthly_satang'] as number,
  startMonth: r['start_month'] as string,
  note: r['note'] as string
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
    `INSERT INTO card_charges (id, card_id, charge_date, title, category, amount_satang, note, bill_month, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.cardId, input.chargeDate, input.title, input.category, input.amountSatang, input.note, billMonthFor(input.chargeDate, card.statementDay), now, now)
  return toCharge(one(db, 'SELECT * FROM card_charges WHERE id = ?', id) as Row)
}

export function updateCharge(db: Db, id: string, input: ChargeInput): CardCharge {
  const card = getCard(db, input.cardId)
  const r = db
    .prepare(
      `UPDATE card_charges SET card_id = ?, charge_date = ?, title = ?, category = ?, amount_satang = ?, note = ?, bill_month = ?,
         updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL`
    )
    .run(input.cardId, input.chargeDate, input.title, input.category, input.amountSatang, input.note, billMonthFor(input.chargeDate, card.statementDay), nowIso(), id)
  if (r.changes === 0) throw new NotFoundError('ไม่พบรายการใช้จ่ายนี้')
  return toCharge(one(db, 'SELECT * FROM card_charges WHERE id = ?', id) as Row)
}

/* ---------- instalment plans ---------- */

export function createPlan(db: Db, input: PlanInput): CardPlan {
  getCard(db, input.cardId)
  const id = randomUUID()
  const now = nowIso()
  db.prepare(
    `INSERT INTO card_plans (id, card_id, title, total_months, monthly_satang, start_month, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.cardId, input.title, input.totalMonths, input.monthlySatang, input.startMonth, input.note, now, now)
  return toPlan(one(db, 'SELECT * FROM card_plans WHERE id = ?', id) as Row)
}

export function updatePlan(db: Db, id: string, input: PlanInput): CardPlan {
  getCard(db, input.cardId)
  const r = db
    .prepare(
      `UPDATE card_plans SET card_id = ?, title = ?, total_months = ?, monthly_satang = ?, start_month = ?, note = ?,
         updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL`
    )
    .run(input.cardId, input.title, input.totalMonths, input.monthlySatang, input.startMonth, input.note, nowIso(), id)
  if (r.changes === 0) throw new NotFoundError('ไม่พบรายการผ่อนนี้')
  return toPlan(one(db, 'SELECT * FROM card_plans WHERE id = ?', id) as Row)
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

export function cardsOverview(db: Db, month: string, today: string): CardsOverview {
  const cards = listCards(db).filter((c) => c.isActive)
  const charges = all(db, 'SELECT * FROM card_charges WHERE deleted_at IS NULL AND bill_month = ?', month).map(toCharge)
  const plans = all(db, 'SELECT * FROM card_plans WHERE deleted_at IS NULL').map(toPlan)
  return overviewOf(
    month,
    cards.map((card) => ({ ...buildStatement(card, charges, plans, month), bill: billInfo(db, card.id, month, today) })),
    today
  )
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
    ).run(title, statement.total, statement.dueDate, statement.dueDate, categoryId, now, id)
    return { action: 'updated', transactionId: id, amountSatang: statement.total }
  }
  db.prepare(
    `INSERT INTO transactions (id, kind, title, amount_satang, category_id, txn_date, due_date, is_paid, note, created_at, updated_at)
     VALUES (?, 'expense', ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(id, title, statement.total, categoryId, statement.dueDate, statement.dueDate, `สร้างจากยอดบัตรเครดิต (รอบบิล ${formatThaiMonth(month)})`, now, now)
  return { action: 'created', transactionId: id, amountSatang: statement.total }
}
