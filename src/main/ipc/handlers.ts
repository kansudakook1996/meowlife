import { app, ipcMain } from 'electron'
import { z } from 'zod'
import { todayIso } from '@shared/dates'
import { IPC } from '@shared/ipc'
import {
  CategoryInputSchema,
  describeValidationError,
  IdSchema,
  MonthSchema,
  RecurringInputSchema,
  RecurringUpdateSchema,
  SetPaidSchema,
  TransactionInputSchema,
  TransactionQuerySchema,
  TransactionUpdateSchema
} from '@shared/schemas'
import { summarizeMonth } from '@shared/summary'
import type { IpcResult, UpdateStatus } from '@shared/types'
import { checkForUpdates, getUpdateStatus, installUpdate } from '../updater'
import { createCategory, listCategories, listPaymentMethods, NotFoundError } from '../db/catalogRepo'
import type { Db } from '../db/connection'
import {
  createRecurring,
  ensureRecurringForMonth,
  listRecurring,
  removeRecurring,
  updateRecurring
} from '../db/recurringRepo'
import {
  createTransaction,
  listMonth,
  listTransactions,
  removeTransaction,
  restoreTransaction,
  setPaid,
  updateTransaction
} from '../db/transactionRepo'

/** Wrap a handler: validate input, convert errors to a safe result. Never log user data. */
function handle<S extends z.ZodType, T>(channel: string, schema: S, fn: (input: z.output<S>) => T): void {
  ipcMain.handle(channel, (_event, payload: unknown): IpcResult<T> => {
    try {
      const input = schema.parse(payload)
      return { ok: true, data: fn(input) }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { ok: false, error: { code: 'VALIDATION', message: describeValidationError(error) } }
      }
      if (error instanceof NotFoundError) {
        return { ok: false, error: { code: 'NOT_FOUND', message: error.message } }
      }
      console.error(`[ipc] ${channel} failed:`, error instanceof Error ? error.name : 'unknown error')
      return { ok: false, error: { code: 'INTERNAL', message: 'เกิดข้อผิดพลาดภายในแอป ลองใหม่อีกครั้งนะ' } }
    }
  })
}

const NoInput = z.undefined()

export function registerIpcHandlers(db: Db, dataPath: string): void {
  const today = (): string => todayIso()

  handle(IPC.appInfo, NoInput, () => ({ version: app.getVersion(), dataPath, isPackaged: app.isPackaged }))

  handle(IPC.categoriesList, NoInput, () => listCategories(db))
  handle(IPC.categoriesCreate, CategoryInputSchema, (input) => createCategory(db, input))
  handle(IPC.paymentMethodsList, NoInput, () => listPaymentMethods(db))

  handle(IPC.txList, TransactionQuerySchema, (q) => {
    ensureRecurringForMonth(db, q.month)
    return listTransactions(db, q, today())
  })
  handle(IPC.txCreate, TransactionInputSchema, (input) => createTransaction(db, input, today()))
  handle(IPC.txUpdate, TransactionUpdateSchema, ({ id, input }) => updateTransaction(db, id, input, today()))
  handle(IPC.txSetPaid, SetPaidSchema, ({ id, isPaid }) => setPaid(db, id, isPaid, today()))
  handle(IPC.txRemove, IdSchema, (id) => removeTransaction(db, id))
  handle(IPC.txRestore, IdSchema, (id) => restoreTransaction(db, id))

  handle(IPC.recurringList, NoInput, () => listRecurring(db))
  handle(IPC.recurringCreate, RecurringInputSchema, (input) => createRecurring(db, input))
  handle(IPC.recurringUpdate, RecurringUpdateSchema, ({ id, input }) => updateRecurring(db, id, input, today()))
  handle(IPC.recurringRemove, IdSchema, (id) => removeRecurring(db, id, today()))

  handle(IPC.summaryMonth, MonthSchema, (month) => {
    ensureRecurringForMonth(db, month)
    return summarizeMonth(month, listMonth(db, month, today()))
  })

  handle(IPC.updateGetStatus, NoInput, () => getUpdateStatus())
  ipcMain.handle(IPC.updateCheck, async (): Promise<IpcResult<UpdateStatus>> => ({ ok: true, data: await checkForUpdates() }))
  handle(IPC.updateInstall, NoInput, () => installUpdate())
}
