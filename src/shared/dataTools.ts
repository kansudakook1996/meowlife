import { z } from 'zod'
import { IMPORT_FIELDS, type ImportMapping, type ImportRow, type ImportRowError } from './importMap'

export interface BackupSummary {
  schemaVersion: number
  transactions: number
  recurringRules: number
  categories: number
  paymentMethods: number
}

export interface RestoreResult {
  summary: BackupSummary
  /** Copy of the data as it was just before restoring. */
  safetyCopy: string
  softDeleted: number
  skipped: number
}

export interface ImportSession {
  token: string
  fileName: string
  /** Rows in the file including the header row. */
  totalRows: number
  columnCount: number
  /** First rows of the file (for the screen where the user maps columns). */
  sample: string[][]
  /** Suggested mapping from the header names. */
  mapping: ImportMapping
}

export interface ImportPreview {
  totalRows: number
  validCount: number
  duplicateCount: number
  errorCount: number
  sampleValid: ImportRow[]
  sampleDuplicates: ImportRow[]
  errors: ImportRowError[]
  newCategories: string[]
  newMethods: string[]
}

export interface ImportCommitResult {
  imported: number
  skippedDuplicates: number
  errorCount: number
  createdCategories: number
  createdMethods: number
}

export interface BackupPick {
  fileName: string
  summary: BackupSummary
}

export interface ExportResult {
  path: string
  rows: number
}

const ColumnIndex = z.number().int().min(0).max(199).nullable()

export const ImportMappingSchema = z.strictObject({
  columns: z.strictObject(Object.fromEntries(IMPORT_FIELDS.map((f) => [f, ColumnIndex])) as Record<(typeof IMPORT_FIELDS)[number], typeof ColumnIndex>),
  firstRowIsHeader: z.boolean(),
  defaultKind: z.enum(['income', 'expense']),
  useSign: z.boolean(),
  defaultPaid: z.boolean()
}) satisfies z.ZodType<ImportMapping>

export const ImportPreviewRequestSchema = z.strictObject({ token: z.string().max(64), mapping: ImportMappingSchema })
export const ImportCommitRequestSchema = z.strictObject({
  token: z.string().max(64),
  mapping: ImportMappingSchema,
  includeDuplicates: z.boolean(),
  createMissing: z.boolean()
})
export const ExportRequestSchema = z.strictObject({
  scope: z.enum(['all', 'month']),
  month: z.string().max(7).optional()
})
