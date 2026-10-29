import { z } from 'zod'
import { EntryKindSchema, IdSchema, IsoDateSchema, MonthSchema } from './schemas'
import { MAX_SATANG } from './money'

/** Tables that sync to Firestore, in dependency order (categories before the rows that point at them). */
export const SYNC_TABLES = [
  'categories',
  'payment_methods',
  'recurring_rules',
  'transactions',
  'tasks',
  'journal_entries',
  'goals',
  'habits',
  'habit_checks',
  'notes',
  'credit_cards',
  'card_charges',
  'card_plans',
  'card_recurring',
  'card_partner_payments'
] as const
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
  ],
  tasks: [...COMMON, 'title', 'note', 'due_date', 'repeat', 'is_done', 'done_date'],
  journal_entries: [...COMMON, 'entry_date', 'mood', 'body'],
  goals: [...COMMON, 'title', 'kind', 'target_satang', 'saved_satang', 'progress', 'target_date', 'note', 'is_done', 'done_date'],
  habits: [...COMMON, 'name', 'icon', 'sort_order'],
  habit_checks: [...COMMON, 'habit_id', 'check_date'],
  notes: [...COMMON, 'title', 'body', 'is_pinned'],
  credit_cards: [...COMMON, 'name', 'issuer', 'statement_day', 'due_day', 'limit_satang', 'is_active', 'sort_order'],
  card_charges: [...COMMON, 'card_id', 'charge_date', 'title', 'category', 'amount_satang', 'partner_satang', 'note', 'bill_month'],
  card_plans: [...COMMON, 'card_id', 'title', 'total_months', 'monthly_satang', 'partner_satang', 'start_month', 'note'],
  card_recurring: [...COMMON, 'card_id', 'title', 'category', 'amount_satang', 'day_of_month', 'start_month', 'end_month', 'partner_satang', 'note', 'is_active'],
  card_partner_payments: [...COMMON, 'card_id', 'bill_month', 'amount_satang', 'paid_date']
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
/** The partner's share of a card amount (0 = none). */
const Share = z.number().int().min(0).max(MAX_SATANG)

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
  }) as unknown as z.ZodType<SyncDoc>,
  tasks: z.strictObject({
    ...base,
    title: z.string().min(1).max(80),
    note: z.string().max(500),
    dueDate: IsoDateSchema.nullable(),
    repeat: z.enum(['none', 'daily', 'weekly', 'monthly']),
    isDone: Int01,
    doneDate: IsoDateSchema.nullable()
  }) as unknown as z.ZodType<SyncDoc>,
  journal_entries: z.strictObject({
    ...base,
    entryDate: IsoDateSchema,
    mood: z.number().int().min(1).max(5),
    body: z.string().max(5000)
  }) as unknown as z.ZodType<SyncDoc>,
  goals: z.strictObject({
    ...base,
    title: z.string().min(1).max(80),
    kind: z.enum(['life', 'saving']),
    targetSatang: Amount.nullable(),
    savedSatang: z.number().int().min(0).max(MAX_SATANG),
    progress: z.number().int().min(0).max(100),
    targetDate: IsoDateSchema.nullable(),
    note: z.string().max(500),
    isDone: Int01,
    doneDate: IsoDateSchema.nullable()
  }) as unknown as z.ZodType<SyncDoc>,
  habits: z.strictObject({
    ...base,
    name: z.string().min(1).max(40),
    icon: z.string().min(1).max(8),
    sortOrder: z.number().int().min(0).max(100000)
  }) as unknown as z.ZodType<SyncDoc>,
  habit_checks: z.strictObject({
    ...base,
    habitId: IdSchema,
    checkDate: IsoDateSchema
  }) as unknown as z.ZodType<SyncDoc>,
  notes: z.strictObject({
    ...base,
    title: z.string().min(1).max(80),
    body: z.string().max(5000),
    isPinned: Int01
  }) as unknown as z.ZodType<SyncDoc>,
  credit_cards: z.strictObject({
    ...base,
    name: z.string().min(1).max(40),
    issuer: z.string().max(40),
    statementDay: z.number().int().min(1).max(31),
    dueDay: z.number().int().min(1).max(31),
    limitSatang: Amount.nullable(),
    isActive: Int01,
    sortOrder: z.number().int().min(0).max(100000)
  }) as unknown as z.ZodType<SyncDoc>,
  card_charges: z.strictObject({
    ...base,
    cardId: IdSchema,
    chargeDate: IsoDateSchema,
    title: z.string().min(1).max(80),
    category: z.string().max(40),
    amountSatang: Amount,
    partnerSatang: Share,
    note: z.string().max(500),
    billMonth: MonthSchema
  }) as unknown as z.ZodType<SyncDoc>,
  card_plans: z.strictObject({
    ...base,
    cardId: IdSchema,
    title: z.string().min(1).max(80),
    totalMonths: z.number().int().min(2).max(120),
    monthlySatang: Amount,
    partnerSatang: Share,
    startMonth: MonthSchema,
    note: z.string().max(500)
  }) as unknown as z.ZodType<SyncDoc>,
  card_recurring: z.strictObject({
    ...base,
    cardId: IdSchema,
    title: z.string().min(1).max(80),
    category: z.string().max(40),
    amountSatang: Amount,
    dayOfMonth: z.number().int().min(1).max(31),
    startMonth: MonthSchema,
    endMonth: MonthSchema.nullable(),
    partnerSatang: Share,
    note: z.string().max(500),
    isActive: Int01
  }) as unknown as z.ZodType<SyncDoc>,
  card_partner_payments: z.strictObject({
    ...base,
    cardId: IdSchema,
    billMonth: MonthSchema,
    amountSatang: Amount,
    paidDate: IsoDateSchema
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
