import { contextBridge, ipcRenderer } from 'electron'
import { IPC, IPC_EVENTS, type MeowBridge } from '@shared/ipc'
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
  sync: {
    bind: (uid) => ipcRenderer.invoke(IPC.syncBind, uid),
    getCursor: (table) => ipcRenderer.invoke(IPC.syncGetCursor, table),
    setCursor: (table, value) => ipcRenderer.invoke(IPC.syncSetCursor, { table, value }),
    getDirty: (limit) => ipcRenderer.invoke(IPC.syncGetDirty, limit),
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
