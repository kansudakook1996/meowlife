import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { BrowserWindow, dialog, shell } from 'electron'
import { z } from 'zod'
import { toCsv } from '@shared/csv'
import {
  ExportRequestSchema,
  ImportCommitRequestSchema,
  ImportPreviewRequestSchema,
  type ImportPreview,
  type ImportSession
} from '@shared/dataTools'
import { addMonths, isValidMonth, monthOf, todayIso } from '@shared/dates'
import { transactionsToCsv } from '@shared/exportCsv'
import { buildImportRows, defaultMaxDate, guessMapping, type ImportMapping } from '@shared/importMap'
import { IPC } from '@shared/ipc'
import { CategoryInputSchema, IdSchema, MonthSchema } from '@shared/schemas'
import {
  createBackup,
  inspectBackup,
  restoreFromBackup,
  BACKUP_EXTENSION,
  BackupError
} from '../db/backupRepo'
import {
  deleteCategory,
  deletePaymentMethod,
  NotFoundError,
  updateCategory,
  updatePaymentMethod,
  createPaymentMethod
} from '../db/catalogRepo'
import type { Db } from '../db/connection'
import { commitImport, existingKeys, missingCatalog } from '../db/importRepo'
import { listAllTransactions, monthlyTotals } from '../db/transactionRepo'
import { readSpreadsheetFile, SpreadsheetError } from '../import/spreadsheet'
import { handle } from './handle'

const NoInput = z.undefined()
const NameSchema = z.string().trim().min(1, { error: 'กรุณาใส่ชื่อ' }).max(40, { error: 'ชื่อยาวเกิน 40 ตัวอักษร' })

interface Session {
  cells: string[][]
  fileName: string
  at: number
}

const SESSION_TTL_MS = 30 * 60_000
const sessions = new Map<string, Session>()

function newSession(cells: string[][], fileName: string): string {
  const now = Date.now()
  for (const [k, s] of sessions) if (now - s.at > SESSION_TTL_MS) sessions.delete(k)
  while (sessions.size >= 3) sessions.delete(sessions.keys().next().value as string)
  const token = randomUUID()
  sessions.set(token, { cells, fileName, at: now })
  return token
}

function getSession(token: string): Session {
  const s = sessions.get(token)
  if (!s) throw new SpreadsheetError('หมดเวลาแล้ว กรุณาเลือกไฟล์ใหม่อีกครั้ง')
  s.at = Date.now()
  return s
}

function assertMapped(mapping: ImportMapping): void {
  const { date, title, amount } = mapping.columns
  if (date === null || title === null || amount === null) {
    throw new SpreadsheetError('ต้องเลือกคอลัมน์ "วันที่" "ชื่อรายการ" และ "จำนวนเงิน" ให้ครบก่อน')
  }
}

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

async function chooseSavePath(defaultName: string, filterName: string, extensions: string[]): Promise<string | null> {
  const options = { defaultPath: defaultName, filters: [{ name: filterName, extensions }] }
  const win = parentWindow()
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  return result.canceled || !result.filePath ? null : result.filePath
}

async function chooseOpenPath(filterName: string, extensions: string[]): Promise<string | null> {
  const options = { properties: ['openFile' as const], filters: [{ name: filterName, extensions }] }
  const win = parentWindow()
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return result.canceled || !result.filePaths[0] ? null : result.filePaths[0]
}

/** Backup / restore, CSV export, import wizard, categories and reports. All file dialogs live here (main process). */
export function registerDataHandlers(db: Db, userData: string): void {
  const backupsDir = join(userData, 'backups')
  let pendingRestore: string | null = null

  /* ----- categories & payment methods ----- */
  handle(IPC.categoriesUpdate, z.strictObject({ id: IdSchema, input: CategoryInputSchema }), ({ id, input }) => updateCategory(db, id, input))
  handle(IPC.categoriesRemove, IdSchema, (id) => deleteCategory(db, id))
  handle(IPC.paymentMethodsCreate, NameSchema, (name) => createPaymentMethod(db, name))
  handle(IPC.paymentMethodsUpdate, z.strictObject({ id: IdSchema, name: NameSchema }), ({ id, name }) => updatePaymentMethod(db, id, name))
  handle(IPC.paymentMethodsRemove, IdSchema, (id) => deletePaymentMethod(db, id))

  /* ----- reports ----- */
  handle(IPC.reportTrend, z.strictObject({ endMonth: MonthSchema, count: z.number().int().min(1).max(24) }), ({ endMonth, count }) =>
    monthlyTotals(db, endMonth, count)
  )

  /* ----- backup / restore ----- */
  handle(IPC.backupCreate, NoInput, async () => {
    const target = await chooseSavePath(`MeowLife-สำรอง-${todayIso()}.${BACKUP_EXTENSION}`, 'ไฟล์สำรอง MeowLife', [BACKUP_EXTENSION])
    if (!target) return null
    createBackup(db, target)
    return { path: target }
  })

  handle(IPC.backupPick, NoInput, async () => {
    const file = await chooseOpenPath('ไฟล์สำรอง MeowLife', [BACKUP_EXTENSION, 'db'])
    if (!file) return null
    const summary = inspectBackup(file) // throws a Thai message if the file is not usable
    pendingRestore = file
    return { fileName: basename(file), summary }
  })

  handle(IPC.backupRestore, NoInput, () => {
    if (!pendingRestore) throw new BackupError('กรุณาเลือกไฟล์สำรองก่อน')
    const file = pendingRestore
    pendingRestore = null
    return restoreFromBackup(db, file, backupsDir)
  })

  handle(IPC.backupOpenFolder, NoInput, async () => {
    mkdirSync(backupsDir, { recursive: true })
    await shell.openPath(backupsDir)
  })

  /* ----- export ----- */
  handle(IPC.exportCsv, ExportRequestSchema, async ({ scope, month }) => {
    if (scope === 'month' && (!month || !isValidMonth(month))) throw new NotFoundError('เดือนไม่ถูกต้อง')
    const today = todayIso()
    const target = await chooseSavePath(
      `MeowLife-รายการ-${scope === 'month' ? month : 'ทั้งหมด'}.csv`,
      'ไฟล์ CSV (เปิดด้วย Excel ได้)',
      ['csv']
    )
    if (!target) return null
    const items = listAllTransactions(db, today).filter((t) => scope === 'all' || monthOf(t.txnDate) === month)
    writeFileSync(target, transactionsToCsv(items), 'utf8')
    return { path: target, rows: items.length }
  })

  /* ----- import wizard ----- */
  handle(IPC.importPick, NoInput, async (): Promise<ImportSession | null> => {
    const file = await chooseOpenPath('ไฟล์ Excel หรือ CSV', ['xlsx', 'csv', 'txt'])
    if (!file) return null
    const cells = readSpreadsheetFile(file)
    const token = newSession(cells, basename(file))
    return {
      token,
      fileName: basename(file),
      totalRows: cells.length,
      columnCount: Math.min(200, cells.reduce((m, r) => Math.max(m, r.length), 0)),
      sample: cells.slice(0, 8),
      mapping: guessMapping(cells[0] ?? [])
    }
  })

  const build = (token: string, mapping: ImportMapping): ReturnType<typeof buildImportRows> => {
    assertMapped(mapping)
    return buildImportRows(getSession(token).cells, mapping, {
      existingKeys: existingKeys(db),
      maxDate: defaultMaxDate(todayIso())
    })
  }

  handle(IPC.importPreview, ImportPreviewRequestSchema, ({ token, mapping }): ImportPreview => {
    const built = build(token, mapping)
    const missing = missingCatalog(db, built.valid)
    return {
      totalRows: built.totalRows,
      validCount: built.valid.length,
      duplicateCount: built.duplicates.length,
      errorCount: built.errors.length,
      sampleValid: built.valid.slice(0, 10),
      sampleDuplicates: built.duplicates.slice(0, 5),
      errors: built.errors.slice(0, 50),
      newCategories: missing.categories.slice(0, 30),
      newMethods: missing.methods.slice(0, 30)
    }
  })

  handle(IPC.importCommit, ImportCommitRequestSchema, ({ token, mapping, includeDuplicates, createMissing }) => {
    const built = build(token, mapping)
    const rows = includeDuplicates ? [...built.valid, ...built.duplicates].sort((a, b) => a.rowNumber - b.rowNumber) : built.valid
    // A bulk import cannot be undone with one click, so keep a full copy of the data first.
    createBackup(db, join(backupsDir, `pre-import-${new Date().toISOString().replace(/[:.]/g, '-')}.db`))
    const result = commitImport(db, rows, createMissing, todayIso())
    sessions.delete(token)
    return {
      imported: result.imported,
      skippedDuplicates: includeDuplicates ? 0 : built.duplicates.length,
      errorCount: built.errors.length + result.failed.length,
      createdCategories: result.createdCategories,
      createdMethods: result.createdMethods
    }
  })

  handle(IPC.importSaveErrors, ImportPreviewRequestSchema, async ({ token, mapping }) => {
    const session = getSession(token)
    const built = build(token, mapping)
    if (built.errors.length === 0) throw new SpreadsheetError('ไม่มีแถวที่ผิดพลาด')
    const target = await chooseSavePath(`รายงานข้อผิดพลาด-${session.fileName.replace(/\.[^.]+$/, '')}.csv`, 'ไฟล์ CSV', ['csv'])
    if (!target) return null
    const header = session.cells[0] ?? []
    const rows = [
      ['แถวที่ในไฟล์', 'ปัญหา', ...header],
      ...built.errors.map((e) => [String(e.rowNumber), e.message, ...e.cells])
    ]
    writeFileSync(target, toCsv(rows), 'utf8')
    return { path: target }
  })
}

export { addMonths }
