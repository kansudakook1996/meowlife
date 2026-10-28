import { diffDays } from './dates'
import type { EntryKind, PaymentStatus } from './types'

/** A bill due within this many days (including today) counts as "due soon". */
export const DUE_SOON_DAYS = 3
let dueSoonSetting = DUE_SOON_DAYS

/** Settings → "ใกล้ครบกำหนดภายใน N วัน" (applies to every status computed afterwards). */
export function setDueSoonDays(days: number): void {
  dueSoonSetting = Math.min(14, Math.max(1, Math.round(days)))
}

export interface StatusInfo {
  status: PaymentStatus
  daysUntilDue: number | null
}

export function computeStatus(
  item: { isPaid: boolean; dueDate: string | null },
  today: string,
  dueSoonDays: number = dueSoonSetting
): StatusInfo {
  if (item.isPaid) return { status: 'paid', daysUntilDue: null }
  if (!item.dueDate) return { status: 'unpaid', daysUntilDue: null }
  const days = diffDays(today, item.dueDate)
  if (days < 0) return { status: 'overdue', daysUntilDue: days }
  if (days <= dueSoonDays) return { status: 'due_soon', daysUntilDue: days }
  return { status: 'unpaid', daysUntilDue: days }
}

/** Short Thai label shown next to the status icon. */
export function statusLabel(kind: EntryKind, info: StatusInfo): string {
  switch (info.status) {
    case 'paid':
      return kind === 'income' ? 'ได้รับแล้ว' : 'จ่ายแล้ว'
    case 'unpaid':
      return kind === 'income' ? 'ยังไม่ได้รับ' : 'ยังไม่จ่าย'
    case 'due_soon':
      return info.daysUntilDue === 0 ? 'ครบกำหนดวันนี้' : `อีก ${info.daysUntilDue} วันครบกำหนด`
    case 'overdue':
      return `เกินกำหนด ${Math.abs(info.daysUntilDue ?? 0)} วัน`
  }
}
