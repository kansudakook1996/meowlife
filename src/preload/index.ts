import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type MeowBridge } from '@shared/ipc'

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
  summary: { month: (month) => ipcRenderer.invoke(IPC.summaryMonth, month) }
}

contextBridge.exposeInMainWorld('meow', bridge)
