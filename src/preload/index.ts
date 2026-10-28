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
    create: (input) => ipcRenderer.invoke(IPC.categoriesCreate, input)
  },
  paymentMethods: { list: () => ipcRenderer.invoke(IPC.paymentMethodsList) },
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
