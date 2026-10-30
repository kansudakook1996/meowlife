import { z } from 'zod'
import { isValidIsoDate, isValidMonth } from './dates'
import { MAX_SATANG } from './money'

/** Every IPC payload is validated in the main process with these schemas. */

export const IdSchema = z.uuid({ error: 'รหัสรายการไม่ถูกต้อง' })

export const IsoDateSchema = z
  .string()
  .refine(isValidIsoDate, { error: 'วันที่ไม่ถูกต้อง' })

export const MonthSchema = z.string().refine(isValidMonth, { error: 'เดือนไม่ถูกต้อง' })

export const EntryKindSchema = z.enum(['income', 'expense'])

const AmountSchema = z
  .number()
  .int({ error: 'จำนวนเงินต้องเป็นสตางค์จำนวนเต็ม' })
  .positive({ error: 'จำนวนเงินต้องมากกว่า 0' })
  .max(MAX_SATANG, { error: 'จำนวนเงินมากเกินไป' })

const TitleSchema = z
  .string()
  .trim()
  .min(1, { error: 'กรุณาใส่ชื่อรายการ' })
  .max(80, { error: 'ชื่อรายการยาวเกิน 80 ตัวอักษร' })

const NoteSchema = z.string().trim().max(500, { error: 'หมายเหตุยาวเกิน 500 ตัวอักษร' })

export const TransactionInputSchema = z.strictObject({
  kind: EntryKindSchema,
  title: TitleSchema,
  amountSatang: AmountSchema,
  categoryId: IdSchema.nullable(),
  paymentMethodId: IdSchema.nullable(),
  txnDate: IsoDateSchema,
  dueDate: IsoDateSchema.nullable(),
  isPaid: z.boolean(),
  note: NoteSchema
})
export type TransactionInput = z.infer<typeof TransactionInputSchema>

export const TransactionUpdateSchema = z.strictObject({
  id: IdSchema,
  input: TransactionInputSchema
})

export const SetPaidSchema = z.strictObject({ id: IdSchema, isPaid: z.boolean() })

export const StatusFilterSchema = z.enum(['all', 'paid', 'unpaid', 'due_soon', 'overdue', 'not_paid'])
export type StatusFilter = z.infer<typeof StatusFilterSchema>

export const TransactionQuerySchema = z.strictObject({
  month: MonthSchema,
  kind: z.enum(['all', 'income', 'expense']).default('all'),
  status: StatusFilterSchema.default('all'),
  search: z.string().trim().max(100).default(''),
  categoryId: IdSchema.nullable().default(null)
})
export type TransactionQuery = z.input<typeof TransactionQuerySchema>

export const RecurringInputSchema = z
  .strictObject({
    kind: EntryKindSchema,
    title: TitleSchema,
    amountSatang: AmountSchema,
    categoryId: IdSchema.nullable(),
    paymentMethodId: IdSchema.nullable(),
    dayOfMonth: z.number().int().min(1, { error: 'วันที่ต้องอยู่ระหว่าง 1–31' }).max(31, { error: 'วันที่ต้องอยู่ระหว่าง 1–31' }),
    startMonth: MonthSchema,
    endMonth: MonthSchema.nullable(),
    note: NoteSchema,
    isActive: z.boolean()
  })
  .refine((r) => r.endMonth === null || r.endMonth >= r.startMonth, {
    error: 'เดือนสิ้นสุดต้องไม่ก่อนเดือนเริ่ม',
    path: ['endMonth']
  })
export type RecurringInput = z.infer<typeof RecurringInputSchema>

export const RecurringUpdateSchema = z.strictObject({ id: IdSchema, input: RecurringInputSchema })

export const CategoryInputSchema = z.strictObject({
  kind: EntryKindSchema,
  name: z.string().trim().min(1, { error: 'กรุณาใส่ชื่อหมวด' }).max(40, { error: 'ชื่อหมวดยาวเกิน 40 ตัวอักษร' }),
  icon: z.string().trim().min(1).max(8),
  /** Not counted as spending (savings, transfers to yourself). Left out = unchanged on update, false on create. */
  excluded: z.boolean().optional()
})
export type CategoryInput = z.infer<typeof CategoryInputSchema>

/** Turn a ZodError into one short Thai sentence for the user. */
export function describeValidationError(error: z.ZodError): string {
  const first = error.issues[0]
  return first ? first.message : 'ข้อมูลไม่ถูกต้อง'
}
