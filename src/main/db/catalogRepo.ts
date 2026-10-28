import { randomUUID } from 'node:crypto'
import type { CategoryInput } from '@shared/schemas'
import type { Category, EntryKind, PaymentMethod } from '@shared/types'
import { inTransaction, nowIso, type Db } from './connection'

interface CategoryRow {
  id: string
  kind: EntryKind
  name: string
  icon: string
  sort_order: number
}

function toCategory(r: CategoryRow): Category {
  return { id: r.id, kind: r.kind, name: r.name, icon: r.icon, sortOrder: r.sort_order }
}

export function listCategories(db: Db): Category[] {
  const rows = db
    .prepare(
      `SELECT id, kind, name, icon, sort_order FROM categories
       WHERE deleted_at IS NULL ORDER BY kind DESC, sort_order, name`
    )
    .all() as unknown as CategoryRow[]
  return rows.map(toCategory)
}

export function createCategory(db: Db, input: CategoryInput): Category {
  const id = randomUUID()
  const now = nowIso()
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories').get() as { m: number }
  db.prepare(
    `INSERT INTO categories (id, kind, name, icon, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.kind, input.name, input.icon, max.m + 1, now, now)
  return { id, kind: input.kind, name: input.name, icon: input.icon, sortOrder: max.m + 1 }
}

export function updateCategory(db: Db, id: string, input: CategoryInput): Category {
  const result = db
    .prepare('UPDATE categories SET kind = ?, name = ?, icon = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL')
    .run(input.kind, input.name, input.icon, nowIso(), id)
  if (result.changes === 0) throw new NotFoundError('ไม่พบหมวดหมู่นี้')
  const row = db.prepare('SELECT id, kind, name, icon, sort_order FROM categories WHERE id = ?').get(id) as unknown as CategoryRow
  return toCategory(row)
}

/** Soft delete. Items that used the category become "no category" (their names stay readable). */
export function deleteCategory(db: Db, id: string): { detached: number } {
  return inTransaction(db, () => {
    const now = nowIso()
    const result = db.prepare('UPDATE categories SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL').run(now, now, id)
    if (result.changes === 0) throw new NotFoundError('ไม่พบหมวดหมู่นี้')
    const a = db.prepare('UPDATE transactions SET category_id = NULL, updated_at = ?, dirty = 1 WHERE category_id = ? AND deleted_at IS NULL').run(now, id)
    db.prepare('UPDATE recurring_rules SET category_id = NULL, updated_at = ?, dirty = 1 WHERE category_id = ? AND deleted_at IS NULL').run(now, id)
    return { detached: Number(a.changes) }
  })
}

export function createPaymentMethod(db: Db, name: string): PaymentMethod {
  const id = randomUUID()
  const now = nowIso()
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM payment_methods').get() as { m: number }
  db.prepare('INSERT INTO payment_methods (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    name,
    max.m + 1,
    now,
    now
  )
  return { id, name, sortOrder: max.m + 1 }
}

export function updatePaymentMethod(db: Db, id: string, name: string): PaymentMethod {
  const result = db
    .prepare('UPDATE payment_methods SET name = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL')
    .run(name, nowIso(), id)
  if (result.changes === 0) throw new NotFoundError('ไม่พบช่องทางชำระนี้')
  const row = db.prepare('SELECT id, name, sort_order FROM payment_methods WHERE id = ?').get(id) as unknown as {
    id: string
    name: string
    sort_order: number
  }
  return { id: row.id, name: row.name, sortOrder: row.sort_order }
}

export function deletePaymentMethod(db: Db, id: string): { detached: number } {
  return inTransaction(db, () => {
    const now = nowIso()
    const result = db.prepare('UPDATE payment_methods SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL').run(now, now, id)
    if (result.changes === 0) throw new NotFoundError('ไม่พบช่องทางชำระนี้')
    const a = db.prepare('UPDATE transactions SET payment_method_id = NULL, updated_at = ?, dirty = 1 WHERE payment_method_id = ? AND deleted_at IS NULL').run(now, id)
    db.prepare('UPDATE recurring_rules SET payment_method_id = NULL, updated_at = ?, dirty = 1 WHERE payment_method_id = ? AND deleted_at IS NULL').run(now, id)
    return { detached: Number(a.changes) }
  })
}

export function listPaymentMethods(db: Db): PaymentMethod[] {
  const rows = db
    .prepare('SELECT id, name, sort_order FROM payment_methods WHERE deleted_at IS NULL ORDER BY sort_order, name')
    .all() as unknown as Array<{ id: string; name: string; sort_order: number }>
  return rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order }))
}

/** Reject IDs that point at deleted or missing rows (FK alone would allow deleted ones). */
export function assertReferencesExist(db: Db, categoryId: string | null, paymentMethodId: string | null): void {
  if (categoryId) {
    const row = db.prepare('SELECT 1 FROM categories WHERE id = ? AND deleted_at IS NULL').get(categoryId)
    if (!row) throw new NotFoundError('ไม่พบหมวดหมู่ที่เลือก')
  }
  if (paymentMethodId) {
    const row = db.prepare('SELECT 1 FROM payment_methods WHERE id = ? AND deleted_at IS NULL').get(paymentMethodId)
    if (!row) throw new NotFoundError('ไม่พบช่องทางชำระที่เลือก')
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}
