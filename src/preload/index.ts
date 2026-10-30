import { contextBridge, ipcRenderer } from 'electron'
import { IPC, IPC_EVENTS, type MeowBridge } from '@shared/ipc'
import { portalChannel as ch } from '@shared/portalApi'
import type { UpdateStatus } from '@shared/types'

/**
 * The only door between the web page and Node. Each method maps to one whitelisted channel;
 * the main process validates every payload again.
 */
const bridge: MeowBridge = {
  app: { info: () => ipcRenderer.invoke(IPC.appInfo) },
  categories: {
    list: () => ipcRenderer.invoke(IPC.categoriesList),
    create: (input) => ipcRenderer.invoke(IPC.categoriesCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC.categoriesUpdate, { id, input }),
    remove: (id) => ipcRenderer.invoke(IPC.categoriesRemove, id)
  },
  paymentMethods: {
    list: () => ipcRenderer.invoke(IPC.paymentMethodsList),
    create: (name) => ipcRenderer.invoke(IPC.paymentMethodsCreate, name),
    update: (id, name) => ipcRenderer.invoke(IPC.paymentMethodsUpdate, { id, name }),
    remove: (id) => ipcRenderer.invoke(IPC.paymentMethodsRemove, id)
  },
  transactions: {
    list: (query) => ipcRenderer.invoke(IPC.txList, query),
    create: (input) => ipcRenderer.invoke(IPC.txCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC.txUpdate, { id, input }),
    setPaid: (id, isPaid) => ipcRenderer.invoke(IPC.txSetPaid, { id, isPaid }),
    remove: (id) => ipcRenderer.invoke(IPC.txRemove, id),
    restore: (id) => ipcRenderer.invoke(IPC.txRestore, id)
  },
  recurring: {
    list: () => ipcRenderer.invoke(IPC.recurringList),
    create: (input) => ipcRenderer.invoke(IPC.recurringCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC.recurringUpdate, { id, input }),
    remove: (id) => ipcRenderer.invoke(IPC.recurringRemove, id)
  },
  summary: { month: (month) => ipcRenderer.invoke(IPC.summaryMonth, month) },
  reports: { trend: (endMonth, count) => ipcRenderer.invoke(IPC.reportTrend, { endMonth, count }) },
  data: {
    createBackup: () => ipcRenderer.invoke(IPC.backupCreate),
    pickBackup: () => ipcRenderer.invoke(IPC.backupPick),
    restoreBackup: () => ipcRenderer.invoke(IPC.backupRestore),
    openBackupFolder: () => ipcRenderer.invoke(IPC.backupOpenFolder),
    exportCsv: (scope, month) => ipcRenderer.invoke(IPC.exportCsv, { scope, month }),
    pickImportFile: () => ipcRenderer.invoke(IPC.importPick),
    previewImport: (token, mapping) => ipcRenderer.invoke(IPC.importPreview, { token, mapping }),
    commitImport: (token, mapping, includeDuplicates, createMissing) =>
      ipcRenderer.invoke(IPC.importCommit, { token, mapping, includeDuplicates, createMissing }),
    saveImportErrors: (token, mapping) => ipcRenderer.invoke(IPC.importSaveErrors, { token, mapping })
  },
  portal: {
    tasks: {
      list: () => ipcRenderer.invoke(ch('tasks', 'list')),
      create: (input) => ipcRenderer.invoke(ch('tasks', 'create'), input),
      update: (id, input) => ipcRenderer.invoke(ch('tasks', 'update'), { id, input }),
      setDone: (id, done) => ipcRenderer.invoke(ch('tasks', 'setDone'), { id, done }),
      remove: (id) => ipcRenderer.invoke(ch('tasks', 'remove'), id),
      restore: (id) => ipcRenderer.invoke(ch('tasks', 'restore'), id)
    },
    journal: {
      list: () => ipcRenderer.invoke(ch('journal', 'list')),
      save: (input) => ipcRenderer.invoke(ch('journal', 'save'), input),
      remove: (id) => ipcRenderer.invoke(ch('journal', 'remove'), id),
      restore: (id) => ipcRenderer.invoke(ch('journal', 'restore'), id)
    },
    goals: {
      list: () => ipcRenderer.invoke(ch('goals', 'list')),
      create: (input) => ipcRenderer.invoke(ch('goals', 'create'), input),
      update: (id, input) => ipcRenderer.invoke(ch('goals', 'update'), { id, input }),
      addSaving: (id, deltaSatang) => ipcRenderer.invoke(ch('goals', 'addSaving'), { id, deltaSatang }),
      setDone: (id, done) => ipcRenderer.invoke(ch('goals', 'setDone'), { id, done }),
      remove: (id) => ipcRenderer.invoke(ch('goals', 'remove'), id),
      restore: (id) => ipcRenderer.invoke(ch('goals', 'restore'), id)
    },
    habits: {
      list: () => ipcRenderer.invoke(ch('habits', 'list')),
      create: (input) => ipcRenderer.invoke(ch('habits', 'create'), input),
      update: (id, input) => ipcRenderer.invoke(ch('habits', 'update'), { id, input }),
      check: (habitId, date, checked) => ipcRenderer.invoke(ch('habits', 'check'), { habitId, date, checked }),
      remove: (id) => ipcRenderer.invoke(ch('habits', 'remove'), id),
      restore: (id) => ipcRenderer.invoke(ch('habits', 'restore'), id)
    },
    notes: {
      list: () => ipcRenderer.invoke(ch('notes', 'list')),
      create: (input) => ipcRenderer.invoke(ch('notes', 'create'), input),
      update: (id, input) => ipcRenderer.invoke(ch('notes', 'update'), { id, input }),
      remove: (id) => ipcRenderer.invoke(ch('notes', 'remove'), id),
      restore: (id) => ipcRenderer.invoke(ch('notes', 'restore'), id)
    },
    ledger: { reorder: (ids) => ipcRenderer.invoke(ch('ledger', 'reorder'), ids) },
    cards: {
      list: () => ipcRenderer.invoke(ch('cards', 'list')),
      reorder: (ids) => ipcRenderer.invoke(ch('cards', 'reorder'), ids),
      create: (input) => ipcRenderer.invoke(ch('cards', 'create'), input),
      update: (id, input) => ipcRenderer.invoke(ch('cards', 'update'), { id, input }),
      remove: (id) => ipcRenderer.invoke(ch('cards', 'remove'), id),
      restore: (id) => ipcRenderer.invoke(ch('cards', 'restore'), id),
      overview: (month) => ipcRenderer.invoke(ch('cards', 'overview'), month),
      charges: {
        duplicates: (input, excludeId) => ipcRenderer.invoke(ch('cards', 'charges.duplicates'), { input, excludeId }),
        create: (input) => ipcRenderer.invoke(ch('cards', 'charges.create'), input),
        update: (id, input) => ipcRenderer.invoke(ch('cards', 'charges.update'), { id, input }),
        remove: (id) => ipcRenderer.invoke(ch('cards', 'charges.remove'), id),
        restore: (id) => ipcRenderer.invoke(ch('cards', 'charges.restore'), id)
      },
      plans: {
        create: (input) => ipcRenderer.invoke(ch('cards', 'plans.create'), input),
        update: (id, input) => ipcRenderer.invoke(ch('cards', 'plans.update'), { id, input }),
        remove: (id) => ipcRenderer.invoke(ch('cards', 'plans.remove'), id),
        restore: (id) => ipcRenderer.invoke(ch('cards', 'plans.restore'), id)
      },
      recurring: {
        create: (input) => ipcRenderer.invoke(ch('cards', 'recurring.create'), input),
        update: (id, input) => ipcRenderer.invoke(ch('cards', 'recurring.update'), { id, input }),
        remove: (id) => ipcRenderer.invoke(ch('cards', 'recurring.remove'), id),
        restore: (id) => ipcRenderer.invoke(ch('cards', 'recurring.restore'), id)
      },
      partnerPaid: (cardId, month, paid) => ipcRenderer.invoke(ch('cards', 'partnerPaid'), { cardId, month, paid }),
      setPaid: (cardId, month, paid) => ipcRenderer.invoke(ch('cards', 'setPaid'), { cardId, month, paid }),
      analytics: (month) => ipcRenderer.invoke(ch('cards', 'analytics'), month),
      createBill: (cardId, month) => ipcRenderer.invoke(ch('cards', 'createBill'), { cardId, month })
    },    calendar: { range: (from, to) => ipcRenderer.invoke(ch('calendar', 'range'), { from, to }) },
    reminders: { due: () => ipcRenderer.invoke(ch('reminders', 'due')) },
    insights: { activity: (month) => ipcRenderer.invoke(ch('insights', 'activity'), month) },
    companion: {
      state: () => ipcRenderer.invoke(ch('companion', 'state')),
      markSeen: (ids) => ipcRenderer.invoke(ch('companion', 'markSeen'), ids)
    },
    settings: {
      get: () => ipcRenderer.invoke(ch('settings', 'get')),
      set: (patch) => ipcRenderer.invoke(ch('settings', 'set'), patch)
    }
  },
  sync: {
    bind: (uid) => ipcRenderer.invoke(IPC.syncBind, uid),
    getCursor: (table) => ipcRenderer.invoke(IPC.syncGetCursor, table),
    setCursor: (table, value) => ipcRenderer.invoke(IPC.syncSetCursor, { table, value }),
    getDirty: (limit, exclude = []) => ipcRenderer.invoke(IPC.syncGetDirty, { limit, exclude }),
    countDirty: () => ipcRenderer.invoke(IPC.syncCountDirty),
    markClean: (items) => ipcRenderer.invoke(IPC.syncMarkClean, items),
    applyRemote: (table, docs) => ipcRenderer.invoke(IPC.syncApplyRemote, { table, docs }),
    conflicts: () => ipcRenderer.invoke(IPC.syncConflicts),
    resolveConflict: (id, action) => ipcRenderer.invoke(IPC.syncResolveConflict, { id, action })
  },
  updates: {
    getStatus: () => ipcRenderer.invoke(IPC.updateGetStatus),
    check: () => ipcRenderer.invoke(IPC.updateCheck),
    install: () => ipcRenderer.invoke(IPC.updateInstall),
    onStatus: (listener) => {
      // Pass only the payload on, never the raw IpcRendererEvent.
      const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => listener(status)
      ipcRenderer.on(IPC_EVENTS.updateStatus, handler)
      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.updateStatus, handler)
      }
    }
  }
}

contextBridge.exposeInMainWorld('meow', bridge)
