import { randomUUID } from 'node:crypto'
import { recurringDateFor } from '@shared/dates'
import type { RecurringInput } from '@shared/schemas'
import type { EntryKind, RecurringRule } from '@shared/types'
import { assertReferencesExist, NotFoundError } from './catalogRepo'
import { inTransaction, nowIso, type Db } from './connection'

interface RecurringRow {
  id: string
  kind: EntryKind
  title: string
  amount_satang: number
  category_id: string | null
  payment_method_id: string | null
  day_of_month: number
  start_month: string
  end_month: string | null
  note: string
  is_active: number
}

function toRule(r: RecurringRow): RecurringRule {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    amountSatang: r.amount_satang,
    categoryId: r.category_id,
    paymentMethodId: r.payment_method_id,
    dayOfMonth: r.day_of_month,
    startMonth: r.start_month,
    endMonth: r.end_month,
    note: r.note,
    isActive: r.is_active === 1
  }
}

export function listRecurring(db: Db): RecurringRule[] {
  const rows = db
    .prepare('SELECT * FROM recurring_rules WHERE deleted_at IS NULL ORDER BY is_active DESC, day_of_month, title')
    .all() as unknown as RecurringRow[]
  return rows.map(toRule)
}

export function getRecurring(db: Db, id: string): RecurringRule {
  const row = db.prepare('SELECT * FROM recurring_rules WHERE id = ? AND deleted_at IS NULL').get(id) as
    | RecurringRow
    | undefined
  if (!row) throw new NotFoundError('ไม่พบรายการประจำนี้')
  return toRule(row)
}

export function createRecurring(db: Db, input: RecurringInput): RecurringRule {
  assertReferencesExist(db, input.categoryId, input.paymentMethodId)
  const id = randomUUID()
  const now = nowIso()
  db.prepare(
    `INSERT INTO recurring_rules
       (id, kind, title, amount_satang, category_id, payment_method_id, day_of_month,
        start_month, end_month, note, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.kind,
    input.title,
    input.amountSatang,
    input.categoryId,
    input.paymentMethodId,
    input.dayOfMonth,
    input.startMonth,
    input.endMonth,
    input.note,
    input.isActive ? 1 : 0,
    now,
    now
  )
  return getRecurring(db, id)
}

/**
 * Update a rule. Already-generated items that are still unpaid and dated today or later
 * follow the new values; paid or past items keep their history.
 */
export function updateRecurring(db: Db, id: string, input: RecurringInput, today: string): RecurringRule {
  getRecurring(db, id)
  assertReferencesExist(db, input.categoryId, input.paymentMethodId)
  return inTransaction(db, () => {
    const now = nowIso()
    db.prepare(
      `UPDATE recurring_rules SET kind = ?, title = ?, amount_satang = ?, category_id = ?, payment_method_id = ?,
         day_of_month = ?, start_month = ?, end_month = ?, note = ?, is_active = ?, updated_at = ?, dirty = 1
       WHERE id = ?`
    ).run(
      input.kind,
      input.title,
      input.amountSatang,
      input.categoryId,
      input.paymentMethodId,
      input.dayOfMonth,
      input.startMonth,
      input.endMonth,
      input.note,
      input.isActive ? 1 : 0,
      now,
      id
    )

    const future = db
      .prepare(
        `SELECT id, recurring_period FROM transactions
         WHERE recurring_rule_id = ? AND deleted_at IS NULL AND is_paid = 0 AND txn_date >= ?`
      )
      .all(id, today) as unknown as Array<{ id: string; recurring_period: string }>

    const updateItem = db.prepare(
      `UPDATE transactions SET kind = ?, title = ?, amount_satang = ?, category_id = ?, payment_method_id = ?,
         txn_date = ?, due_date = ?, note = ?, updated_at = ?, dirty = 1 WHERE id = ?`
    )
    const removeItem = db.prepare('UPDATE transactions SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?')
    for (const item of future) {
      const outOfRange =
        !input.isActive ||
        item.recurring_period < input.startMonth ||
        (input.endMonth !== null && item.recurring_period > input.endMonth)
      if (outOfRange) {
        removeItem.run(now, now, item.id)
        continue
      }
      const date = recurringDateFor(item.recurring_period, input.dayOfMonth)
      updateItem.run(
        input.kind,
        input.title,
        input.amountSatang,
        input.categoryId,
        input.paymentMethodId,
        date,
        date,
        input.note,
        now,
        item.id
      )
    }
    return getRecurring(db, id)
  })
}

/** Delete a rule and its unpaid items from today on. Paid/past items stay as history. */
export function removeRecurring(db: Db, id: string, today: string): void {
  getRecurring(db, id)
  inTransaction(db, () => {
    const now = nowIso()
    db.prepare('UPDATE recurring_rules SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?').run(now, now, id)
    db.prepare(
      `UPDATE transactions SET deleted_at = ?, updated_at = ?, dirty = 1
       WHERE recurring_rule_id = ? AND deleted_at IS NULL AND is_paid = 0 AND txn_date >= ?`
    ).run(now, now, id, today)
  })
}

/**
 * Create this month's items for every active rule. Safe to call repeatedly:
 * the unique index (recurring_rule_id, recurring_period) makes it idempotent, and an item
 * the user deleted stays soft-deleted instead of coming back.
 */
export function ensureRecurringForMonth(db: Db, month: string): number {
  const rules = db
    .prepare(
      `SELECT * FROM recurring_rules
       WHERE deleted_at IS NULL AND is_active = 1 AND start_month <= ? AND (end_month IS NULL OR end_month >= ?)`
    )
    .all(month, month) as unknown as RecurringRow[]
  if (rules.length === 0) return 0

  const insert = db.prepare(
    `INSERT OR IGNORE INTO transactions
       (id, kind, title, amount_satang, category_id, payment_method_id, txn_date, due_date, is_paid,
        note, recurring_rule_id, recurring_period, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`
  )
  return inTransaction(db, () => {
    let created = 0
    const now = nowIso()
    for (const r of rules) {
      const date = recurringDateFor(month, r.day_of_month)
      const result = insert.run(
        randomUUID(),
        r.kind,
        r.title,
        r.amount_satang,
        r.category_id,
        r.payment_method_id,
        date,
        date,
        r.note,
        r.id,
        month,
        now,
        now
      )
      created += Number(result.changes)
    }
    return created
  })
}
