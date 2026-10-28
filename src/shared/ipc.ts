import type {
  AppInfo,
  Category,
  IpcResult,
  MonthSummary,
  PaymentMethod,
  RecurringRule,
  TransactionView,
  UpdateStatus
} from './types'
import type { CategoryInput, RecurringInput, TransactionInput, TransactionQuery } from './schemas'
import type { ApplyResult, SyncConflictView, SyncDoc, SyncTable } from './syncModel'

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
  summaryMonth: 'summary:month',
  syncBind: 'sync:bind',
  syncGetCursor: 'sync:getCursor',
  syncSetCursor: 'sync:setCursor',
  syncGetDirty: 'sync:getDirty',
  syncCountDirty: 'sync:countDirty',
  syncMarkClean: 'sync:markClean',
  syncApplyRemote: 'sync:applyRemote',
  syncConflicts: 'sync:conflicts',
  syncResolveConflict: 'sync:resolveConflict',
  updateGetStatus: 'update:getStatus',
  updateCheck: 'update:check',
  updateInstall: 'update:install'
} as const

/** Main → renderer push events (the only ones preload lets through). */
export const IPC_EVENTS = {
  updateStatus: 'update:status'
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
  /** Local half of the sync; the renderer talks to Firestore and hands data to these calls. */
  sync: {
    bind(uid: string): R<{ mismatch: boolean }>
    getCursor(table: SyncTable): R<string>
    setCursor(table: SyncTable, value: string): R<void>
    getDirty(limit: number): R<Array<{ table: SyncTable; doc: SyncDoc }>>
    countDirty(): R<number>
    markClean(items: Array<{ table: SyncTable; id: string; updatedAt: string }>): R<void>
    applyRemote(table: SyncTable, docs: SyncDoc[]): R<ApplyResult>
    conflicts(): R<SyncConflictView[]>
    resolveConflict(id: number, action: 'ack' | 'useOther'): R<void>
  }
  updates: {
    getStatus(): R<UpdateStatus>
    check(): R<UpdateStatus>
    /** Quit and install a downloaded update. */
    install(): R<void>
    /** Subscribe to status changes; returns an unsubscribe function. */
    onStatus(listener: (status: UpdateStatus) => void): () => void
  }
}
