import { randomUUID } from 'node:crypto'
import { addMonths, firstDayOfMonth, firstDayOfNextMonth } from '@shared/dates'
import { fillMonths, type MonthTotals } from '@shared/trend'
import { TransactionQuerySchema, type TransactionInput, type TransactionQuery } from '@shared/schemas'
import { computeStatus } from '@shared/status'
import type { EntryKind, TransactionView } from '@shared/types'
import { assertReferencesExist, NotFoundError } from './catalogRepo'
import { nowIso, type Db } from './connection'

interface TransactionRow {
  id: string
  kind: EntryKind
  title: string
  amount_satang: number
  category_id: string | null
  payment_method_id: string | null
  txn_date: string
  due_date: string | null
  is_paid: number
  paid_date: string | null
  note: string
  recurring_rule_id: string | null
  created_at: string
  updated_at: string
  category_name: string | null
  category_icon: string | null
  payment_method_name: string | null
}

const SELECT_VIEW = `
  SELECT t.*, c.name AS category_name, c.icon AS category_icon, p.name AS payment_method_name
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN payment_methods p ON p.id = t.payment_method_id`

function toView(r: TransactionRow, today: string): TransactionView {
  const isPaid = r.is_paid === 1
  const info = computeStatus({ isPaid, dueDate: r.due_date }, today)
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    amountSatang: r.amount_satang,
    categoryId: r.category_id,
    paymentMethodId: r.payment_method_id,
    txnDate: r.txn_date,
    dueDate: r.due_date,
    isPaid,
    paidDate: r.paid_date,
    note: r.note,
    recurringRuleId: r.recurring_rule_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    categoryName: r.category_name,
    categoryIcon: r.category_icon,
    paymentMethodName: r.payment_method_name,
    status: info.status,
    daysUntilDue: info.daysUntilDue
  }
}

/** All non-deleted items of a month, newest first. */
export function listMonth(db: Db, month: string, today: string): TransactionView[] {
  const rows = db
    .prepare(
      `${SELECT_VIEW}
       WHERE t.deleted_at IS NULL AND t.txn_date >= ? AND t.txn_date < ?
       ORDER BY t.txn_date DESC, t.created_at DESC`
    )
    .all(firstDayOfMonth(month), firstDayOfNextMonth(month)) as unknown as TransactionRow[]
  return rows.map((r) => toView(r, today))
}

/** Income/expense totals for `count` months ending at `endMonth` (one SQL query). */
export function monthlyTotals(db: Db, endMonth: string, count: number): MonthTotals[] {
  const from = firstDayOfMonth(addMonths(endMonth, -(count - 1)))
  const to = firstDayOfNextMonth(endMonth)
  const rows = db
    .prepare(
      `SELECT substr(txn_date, 1, 7) AS month, kind, SUM(amount_satang) AS total
       FROM transactions WHERE deleted_at IS NULL AND txn_date >= ? AND txn_date < ?
       GROUP BY month, kind`
    )
    .all(from, to) as unknown as Array<{ month: string; kind: EntryKind; total: number }>
  return fillMonths(endMonth, count, rows)
}

/** Every non-deleted item, oldest first (for export). */
export function listAllTransactions(db: Db, today: string): TransactionView[] {
  const rows = db
    .prepare(`${SELECT_VIEW} WHERE t.deleted_at IS NULL ORDER BY t.txn_date, t.created_at`)
    .all() as unknown as TransactionRow[]
  return rows.map((r) => toView(r, today))
}

export function listTransactions(db: Db, rawQuery: TransactionQuery, today: string): TransactionView[] {
  const q = TransactionQuerySchema.parse(rawQuery)
  const needle = q.search.toLocaleLowerCase('th')
  return listMonth(db, q.month, today).filter((t) => {
    if (q.kind !== 'all' && t.kind !== q.kind) return false
    if (q.categoryId && t.categoryId !== q.categoryId) return false
    if (q.status === 'not_paid' && t.status === 'paid') return false
    if (q.status !== 'all' && q.status !== 'not_paid' && t.status !== q.status) return false
    if (needle) {
      const haystack = `${t.title} ${t.note} ${t.categoryName ?? ''}`.toLocaleLowerCase('th')
      if (!haystack.includes(needle)) return false
    }
    return true
  })
}

export function getTransaction(db: Db, id: string, today: string): TransactionView {
  const row = db.prepare(`${SELECT_VIEW} WHERE t.id = ? AND t.deleted_at IS NULL`).get(id) as
    | TransactionRow
    | undefined
  if (!row) throw new NotFoundError('ไม่พบรายการนี้ อาจถูกลบไปแล้ว')
  return toView(row, today)
}

export function createTransaction(db: Db, input: TransactionInput, today: string): TransactionView {
  assertReferencesExist(db, input.categoryId, input.paymentMethodId)
  const id = randomUUID()
  const now = nowIso()
  db.prepare(
    `INSERT INTO transactions
       (id, kind, title, amount_satang, category_id, payment_method_id, txn_date, due_date,
        is_paid, paid_date, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.kind,
    input.title,
    input.amountSatang,
    input.categoryId,
    input.paymentMethodId,
    input.txnDate,
    input.dueDate,
    input.isPaid ? 1 : 0,
    input.isPaid ? today : null,
    input.note,
    now,
    now
  )
  return getTransaction(db, id, today)
}

export function updateTransaction(db: Db, id: string, input: TransactionInput, today: string): TransactionView {
  const existing = getTransaction(db, id, today)
  assertReferencesExist(db, input.categoryId, input.paymentMethodId)
  const paidDate = input.isPaid ? (existing.isPaid ? existing.paidDate : today) : null
  db.prepare(
    `UPDATE transactions SET kind = ?, title = ?, amount_satang = ?, category_id = ?, payment_method_id = ?,
       txn_date = ?, due_date = ?, is_paid = ?, paid_date = ?, note = ?, updated_at = ?, dirty = 1
     WHERE id = ? AND deleted_at IS NULL`
  ).run(
    input.kind,
    input.title,
    input.amountSatang,
    input.categoryId,
    input.paymentMethodId,
    input.txnDate,
    input.dueDate,
    input.isPaid ? 1 : 0,
    paidDate,
    input.note,
    nowIso(),
    id
  )
  return getTransaction(db, id, today)
}

export function setPaid(db: Db, id: string, isPaid: boolean, today: string): TransactionView {
  const existing = getTransaction(db, id, today)
  if (existing.isPaid === isPaid) return existing
  db.prepare('UPDATE transactions SET is_paid = ?, paid_date = ?, updated_at = ?, dirty = 1 WHERE id = ?').run(
    isPaid ? 1 : 0,
    isPaid ? today : null,
    nowIso(),
    id
  )
  return getTransaction(db, id, today)
}

/** Soft delete so the user can undo and so the deletion can sync later. */
export function removeTransaction(db: Db, id: string): void {
  const now = nowIso()
  const result = db
    .prepare('UPDATE transactions SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL')
    .run(now, now, id)
  if (result.changes === 0) throw new NotFoundError('ไม่พบรายการนี้ อาจถูกลบไปแล้ว')
}

export function restoreTransaction(db: Db, id: string): void {
  const result = db
    .prepare(
      'UPDATE transactions SET deleted_at = NULL, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NOT NULL'
    )
    .run(nowIso(), id)
  if (result.changes === 0) throw new NotFoundError('ไม่พบรายการที่จะกู้คืน')
}
