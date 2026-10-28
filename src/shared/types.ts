export type EntryKind = 'income' | 'expense'

export type PaymentStatus = 'paid' | 'unpaid' | 'due_soon' | 'overdue'

export interface Category {
  id: string
  kind: EntryKind
  name: string
  icon: string
  sortOrder: number
}

export interface PaymentMethod {
  id: string
  name: string
  sortOrder: number
}

export interface Transaction {
  id: string
  kind: EntryKind
  title: string
  amountSatang: number
  categoryId: string | null
  paymentMethodId: string | null
  txnDate: string
  dueDate: string | null
  isPaid: boolean
  paidDate: string | null
  note: string
  recurringRuleId: string | null
  createdAt: string
  updatedAt: string
}

/** Transaction plus display data joined/derived in the main process. */
export interface TransactionView extends Transaction {
  categoryName: string | null
  categoryIcon: string | null
  paymentMethodName: string | null
  status: PaymentStatus
  /** Days until due (negative = overdue). Null when there is no due date or it is paid. */
  daysUntilDue: number | null
}

export interface RecurringRule {
  id: string
  kind: EntryKind
  title: string
  amountSatang: number
  categoryId: string | null
  paymentMethodId: string | null
  dayOfMonth: number
  startMonth: string
  endMonth: string | null
  note: string
  isActive: boolean
}

export interface CategoryTotal {
  categoryId: string | null
  name: string
  icon: string
  totalSatang: number
}

export interface MonthSummary {
  month: string
  incomeTotal: number
  incomeReceived: number
  expenseTotal: number
  expensePaid: number
  balance: number
  outstanding: number
  overdueCount: number
  dueSoonCount: number
  itemCount: number
  expenseByCategory: CategoryTotal[]
}

export interface AppInfo {
  version: string
  dataPath: string
  isPackaged: boolean
}

export type UpdateState =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'

export interface UpdateStatus {
  state: UpdateState
  /** Version being offered, when known. */
  version: string | null
  /** Download progress 0–100 while downloading. */
  percent: number | null
}

export type IpcErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'INTERNAL'

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: IpcErrorCode; message: string } }
