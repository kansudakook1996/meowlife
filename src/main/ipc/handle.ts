import { ipcMain } from 'electron'
import { z } from 'zod'
import { describeValidationError } from '@shared/schemas'
import type { IpcResult } from '@shared/types'
import { BackupError } from '../db/backupRepo'
import { NotFoundError } from '../db/catalogRepo'
import { SpreadsheetError } from '../import/spreadsheet'

/**
 * Register one IPC channel: validate the payload with zod, run the handler (sync or async) and turn
 * every error into a safe result. Never logs user data.
 */
export function handle<S extends z.ZodType, T>(channel: string, schema: S, fn: (input: z.output<S>) => T | Promise<T>): void {
  ipcMain.handle(channel, async (_event, payload: unknown): Promise<IpcResult<T>> => {
    try {
      const input = schema.parse(payload)
      return { ok: true, data: await fn(input) }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { ok: false, error: { code: 'VALIDATION', message: describeValidationError(error) } }
      }
      if (error instanceof NotFoundError) {
        return { ok: false, error: { code: 'NOT_FOUND', message: error.message } }
      }
      if (error instanceof BackupError || error instanceof SpreadsheetError) {
        return { ok: false, error: { code: 'VALIDATION', message: error.message } }
      }
      console.error(`[ipc] ${channel} failed:`, error instanceof Error ? error.name : 'unknown error')
      return { ok: false, error: { code: 'INTERNAL', message: 'เกิดข้อผิดพลาดภายในแอป ลองใหม่อีกครั้งนะ' } }
    }
  })
}
