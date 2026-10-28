import { csvText, toCsv } from './csv'
import { satangToInput } from './money'
import { statusLabel } from './status'
import type { TransactionView } from './types'

export const EXPORT_HEADER = [
  'วันที่',
  'ประเภท',
  'ชื่อรายการ',
  'หมวดหมู่',
  'จำนวนเงิน',
  'ช่องทางชำระ',
  'วันครบกำหนด',
  'สถานะ',
  'หมายเหตุ'
]

/**
 * Items → CSV that Excel opens correctly (UTF-8 BOM) and that MeowLife can import again:
 * dates are YYYY-MM-DD, amounts are plain numbers like 1234.50 with a separate type column.
 */
export function transactionsToCsv(items: TransactionView[]): string {
  const rows = items.map((t) => [
    t.txnDate,
    t.kind === 'income' ? 'รายรับ' : 'รายจ่าย',
    csvText(t.title),
    csvText(t.categoryName ?? ''),
    satangToInput(t.amountSatang),
    csvText(t.paymentMethodName ?? ''),
    t.dueDate ?? '',
    statusLabel(t.kind, { status: t.status, daysUntilDue: t.daysUntilDue }),
    csvText(t.note)
  ])
  return toCsv([EXPORT_HEADER, ...rows])
}
