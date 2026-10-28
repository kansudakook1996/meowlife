import { z } from 'zod'
import { EntryKindSchema, IdSchema, IsoDateSchema, MonthSchema } from './schemas'
import { MAX_SATANG } from './money'

/** Tables that sync to Firestore, in dependency order (categories before the rows that point at them). */
export const SYNC_TABLES = ['categories', 'payment_methods', 'recurring_rules', 'transactions'] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

/** Firestore/IPC document: camelCase fields, ints for booleans, null for empty. */
export type SyncDoc = Record<string, string | number | null>

/**
 * `updated_at` of a recurring item that the app generated and the user never touched.
 * It always loses to a real edit made on another device, so generating the same bill on two
 * devices can never resurrect something that was paid or deleted elsewhere.
 */
export const GENERATED_UPDATED_AT = '1970-01-01T00:00:00.000Z'

const COMMON = ['id', 'created_at', 'updated_at', 'deleted_at'] as const

export const TABLE_COLUMNS: Record<SyncTable, readonly string[]> = {
  categories: [...COMMON, 'kind', 'name', 'icon', 'sort_order'],
  payment_methods: [...COMMON, 'name', 'sort_order'],
  recurring_rules: [
    ...COMMON,
    'kind',
    'title',
    'amount_satang',
    'category_id',
    'payment_method_id',
    'day_of_month',
    'start_month',
    'end_month',
    'note',
    'is_active'
  ],
  transactions: [
    ...COMMON,
    'kind',
    'title',
    'amount_satang',
    'category_id',
    'payment_method_id',
    'txn_date',
    'due_date',
    'is_paid',
    'paid_date',
    'note',
    'recurring_rule_id',
    'recurring_period'
  ]
}

const toCamel = (s: string): string => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

export function rowToDoc(table: SyncTable, row: Record<string, unknown>): SyncDoc {
  const doc: SyncDoc = {}
  for (const col of TABLE_COLUMNS[table]) {
    const v = row[col]
    doc[toCamel(col)] = v === undefined || v === null ? null : (v as string | number)
  }
  return doc
}

export function docToRow(table: SyncTable, doc: SyncDoc): Record<string, string | number | null> {
  const row: Record<string, string | number | null> = {}
  for (const col of TABLE_COLUMNS[table]) row[col] = doc[toCamel(col)] ?? null
  return row
}

/* ---------- validation of documents coming from Firestore (untrusted input) ---------- */

const Stamp = z.string().min(20).max(40)
const Int01 = z.number().int().min(0).max(1)
const Amount = z.number().int().min(1).max(MAX_SATANG)

const base = {
  id: IdSchema,
  createdAt: Stamp,
  updatedAt: Stamp,
  deletedAt: Stamp.nullable()
}

export const DOC_SCHEMAS: Record<SyncTable, z.ZodType<SyncDoc>> = {
  categories: z.strictObject({
    ...base,
    kind: EntryKindSchema,
    name: z.string().min(1).max(40),
    icon: z.string().min(1).max(8),
    sortOrder: z.number().int().min(0).max(100000)
  }) as unknown as z.ZodType<SyncDoc>,
  payment_methods: z.strictObject({
    ...base,
    name: z.string().min(1).max(40),
    sortOrder: z.number().int().min(0).max(100000)
  }) as unknown as z.ZodType<SyncDoc>,
  recurring_rules: z.strictObject({
    ...base,
    kind: EntryKindSchema,
    title: z.string().min(1).max(80),
    amountSatang: Amount,
    categoryId: IdSchema.nullable(),
    paymentMethodId: IdSchema.nullable(),
    dayOfMonth: z.number().int().min(1).max(31),
    startMonth: MonthSchema,
    endMonth: MonthSchema.nullable(),
    note: z.string().max(500),
    isActive: Int01
  }) as unknown as z.ZodType<SyncDoc>,
  transactions: z.strictObject({
    ...base,
    kind: EntryKindSchema,
    title: z.string().min(1).max(80),
    amountSatang: Amount,
    categoryId: IdSchema.nullable(),
    paymentMethodId: IdSchema.nullable(),
    txnDate: IsoDateSchema,
    dueDate: IsoDateSchema.nullable(),
    isPaid: Int01,
    paidDate: IsoDateSchema.nullable(),
    note: z.string().max(500),
    recurringRuleId: IdSchema.nullable(),
    recurringPeriod: MonthSchema.nullable()
  }) as unknown as z.ZodType<SyncDoc>
}

/* ---------- shared sync types ---------- */

export interface ApplyResult {
  inserted: number
  updated: number
  ignored: number
  conflicts: number
  skipped: number
}

export interface SyncConflictView {
  id: number
  table: SyncTable
  rowId: string
  /** Name/title of the item (from either version). */
  title: string
  winner: 'local' | 'remote'
  createdAt: string
}

export type SyncPhase = 'unconfigured' | 'signed-out' | 'offline' | 'syncing' | 'idle' | 'error' | 'owner-mismatch'

export interface SyncStatus {
  phase: SyncPhase
  email: string | null
  lastSyncAt: string | null
  /** Epoch ms of the next automatic retry (phase 'error'). */
  retryAt: number | null
  message: string | null
  conflicts: number
}
