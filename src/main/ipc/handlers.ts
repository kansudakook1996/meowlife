import { app, ipcMain } from 'electron'
import { handle } from './handle'
import { z } from 'zod'
import { todayIso } from '@shared/dates'
import { IPC } from '@shared/ipc'
import {
  CategoryInputSchema,
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
import { SYNC_TABLES } from '@shared/syncModel'
import { checkForUpdates, getUpdateStatus, installUpdate } from '../updater'
import {
  applyRemote,
  bindOwner,
  countDirty,
  getDirty,
  getState,
  listConflicts,
  markClean,
  resolveConflict,
  setState
} from '../db/syncRepo'
import { createCategory, listCategories, listPaymentMethods } from '../db/catalogRepo'
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

  const TableSchema = z.enum(SYNC_TABLES)
  const Stamp = z.string().max(40)
  handle(IPC.syncBind, z.string().min(1).max(128), (uid) => bindOwner(db, uid))
  handle(IPC.syncGetCursor, TableSchema, (t) => getState(db, `cursor:${t}`) ?? '')
  handle(IPC.syncSetCursor, z.strictObject({ table: TableSchema, value: Stamp }), ({ table, value }) =>
    setState(db, `cursor:${table}`, value)
  )
  handle(IPC.syncGetDirty, z.number().int().min(1).max(500), (limit) => getDirty(db, limit))
  handle(IPC.syncCountDirty, NoInput, () => countDirty(db))
  handle(
    IPC.syncMarkClean,
    z.array(z.strictObject({ table: TableSchema, id: z.string().max(64), updatedAt: Stamp })).max(500),
    (items) => markClean(db, items)
  )
  handle(
    IPC.syncApplyRemote,
    z.strictObject({ table: TableSchema, docs: z.array(z.unknown()).max(500) }),
    ({ table, docs }) => applyRemote(db, table, docs) // each document is validated again inside
  )
  handle(IPC.syncConflicts, NoInput, () => listConflicts(db))
  handle(
    IPC.syncResolveConflict,
    z.strictObject({ id: z.number().int().positive(), action: z.enum(['ack', 'useOther']) }),
    ({ id, action }) => resolveConflict(db, id, action)
  )

  handle(IPC.updateGetStatus, NoInput, () => getUpdateStatus())
  ipcMain.handle(IPC.updateCheck, async (): Promise<IpcResult<UpdateStatus>> => ({ ok: true, data: await checkForUpdates() }))
  handle(IPC.updateInstall, NoInput, () => installUpdate())
}
