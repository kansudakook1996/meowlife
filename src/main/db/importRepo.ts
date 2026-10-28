import { dupKey, type ImportRow } from '@shared/importMap'
import { TransactionInputSchema } from '@shared/schemas'
import type { EntryKind } from '@shared/types'
import { createCategory, createPaymentMethod, listCategories, listPaymentMethods } from './catalogRepo'
import { inTransaction, type Db } from './connection'
import { createTransaction } from './transactionRepo'

/** Keys of everything already in the database, to detect duplicates before importing. */
export function existingKeys(db: Db): Set<string> {
  const rows = db
    .prepare('SELECT txn_date, kind, amount_satang, title FROM transactions WHERE deleted_at IS NULL')
    .all() as unknown as Array<{ txn_date: string; kind: EntryKind; amount_satang: number; title: string }>
  return new Set(rows.map((r) => dupKey({ txnDate: r.txn_date, kind: r.kind, amountSatang: r.amount_satang, title: r.title })))
}

const norm = (s: string): string => s.trim().toLowerCase()

/** Names in the file that do not exist yet (used for the preview). */
export function missingCatalog(db: Db, rows: ImportRow[]): { categories: string[]; methods: string[] } {
  const cats = new Set(listCategories(db).map((c) => `${c.kind}|${norm(c.name)}`))
  const methods = new Set(listPaymentMethods(db).map((m) => norm(m.name)))
  const newCats = new Map<string, string>()
  const newMethods = new Map<string, string>()
  for (const r of rows) {
    if (r.categoryName && !cats.has(`${r.kind}|${norm(r.categoryName)}`)) newCats.set(`${r.kind}|${norm(r.categoryName)}`, r.categoryName)
    if (r.methodName && !methods.has(norm(r.methodName))) newMethods.set(norm(r.methodName), r.methodName)
  }
  return { categories: [...newCats.values()], methods: [...newMethods.values()] }
}

export interface CommitResult {
  imported: number
  createdCategories: number
  createdMethods: number
  failed: Array<{ rowNumber: number; message: string }>
}

/**
 * Write the rows in ONE transaction: if anything unexpected fails, nothing is imported.
 * Categories / payment methods are matched by name; missing ones are created when `createMissing` is true.
 */
export function commitImport(db: Db, rows: ImportRow[], createMissing: boolean, today: string): CommitResult {
  return inTransaction(db, () => {
    const categoryIds = new Map(listCategories(db).map((c) => [`${c.kind}|${norm(c.name)}`, c.id]))
    const methodIds = new Map(listPaymentMethods(db).map((m) => [norm(m.name), m.id]))
    const result: CommitResult = { imported: 0, createdCategories: 0, createdMethods: 0, failed: [] }

    for (const row of rows) {
      let categoryId: string | null = null
      if (row.categoryName) {
        const key = `${row.kind}|${norm(row.categoryName)}`
        categoryId = categoryIds.get(key) ?? null
        if (!categoryId && createMissing) {
          categoryId = createCategory(db, { kind: row.kind, name: row.categoryName, icon: row.kind === 'income' ? '💰' : '🏷️' }).id
          categoryIds.set(key, categoryId)
          result.createdCategories++
        }
      }
      let methodId: string | null = null
      if (row.methodName) {
        methodId = methodIds.get(norm(row.methodName)) ?? null
        if (!methodId && createMissing) {
          methodId = createPaymentMethod(db, row.methodName).id
          methodIds.set(norm(row.methodName), methodId)
          result.createdMethods++
        }
      }
      const input = TransactionInputSchema.safeParse({
        kind: row.kind,
        title: row.title,
        amountSatang: row.amountSatang,
        categoryId,
        paymentMethodId: methodId,
        txnDate: row.txnDate,
        dueDate: row.dueDate,
        isPaid: row.isPaid,
        note: row.note
      })
      if (!input.success) {
        result.failed.push({ rowNumber: row.rowNumber, message: input.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' })
        continue
      }
      createTransaction(db, input.data, today)
      result.imported++
    }
    return result
  })
}
