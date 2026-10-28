import type {
  AppInfo,
  Category,
  IpcResult,
  MonthSummary,
  PaymentMethod,
  RecurringRule,
  TransactionView
} from './types'
import type { CategoryInput, RecurringInput, TransactionInput, TransactionQuery } from './schemas'

/** The only IPC channels the renderer may call. Preload exposes exactly these. */
export const IPC = {
  appInfo: 'app:info',
  categoriesList: 'categories:list',
  categoriesCreate: 'categories:create',
  paymentMethodsList: 'paymentMethods:list',
  txList: 'tx:list',
  txCreate: 'tx:create',
  txUpdate: 'tx:update',
  txSetPaid: 'tx:setPaid',
  txRemove: 'tx:remove',
  txRestore: 'tx:restore',
  recurringList: 'recurring:list',
  recurringCreate: 'recurring:create',
  recurringUpdate: 'recurring:update',
  recurringRemove: 'recurring:remove',
  summaryMonth: 'summary:month'
} as const

type R<T> = Promise<IpcResult<T>>

/** Shape of `window.meow` in the renderer. */
export interface MeowBridge {
  app: { info(): R<AppInfo> }
  categories: {
    list(): R<Category[]>
    create(input: CategoryInput): R<Category>
  }
  paymentMethods: { list(): R<PaymentMethod[]> }
  transactions: {
    list(query: TransactionQuery): R<TransactionView[]>
    create(input: TransactionInput): R<TransactionView>
    update(id: string, input: TransactionInput): R<TransactionView>
    setPaid(id: string, isPaid: boolean): R<TransactionView>
    remove(id: string): R<void>
    restore(id: string): R<void>
  }
  recurring: {
    list(): R<RecurringRule[]>
    create(input: RecurringInput): R<RecurringRule>
    update(id: string, input: RecurringInput): R<RecurringRule>
    remove(id: string): R<void>
  }
  summary: { month(month: string): R<MonthSummary> }
}
