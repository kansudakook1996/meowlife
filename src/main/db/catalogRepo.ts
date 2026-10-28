import { randomUUID } from 'node:crypto'
import type { CategoryInput } from '@shared/schemas'
import type { Category, EntryKind, PaymentMethod } from '@shared/types'
import { nowIso, type Db } from './connection'

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
