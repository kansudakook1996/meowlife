import { join } from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { openDatabase, type Db } from './db/connection'
import { ensureDailyBackup } from './db/backupRepo'
import { registerDataHandlers } from './ipc/dataHandlers'
import { registerIpcHandlers } from './ipc/handlers'
import { registerPortalHandlers } from './ipc/portalHandlers'
import { getSettings } from './db/portalQueries'
import { startReminders } from './reminders'
import { setDueSoonDays } from '@shared/status'
import { startAutoUpdates } from './updater'

// Keep development data apart from real data so testing never touches the user's records.
// E2E tests point MEOWLIFE_USER_DATA at a throwaway folder. Ignored in the installed app.
// Windows shows toast notifications under this id (must match appId in electron-builder.yml).
app.setAppUserModelId('com.kansu.meowlife')

if (!app.isPackaged) {
  app.setPath('userData', process.env['MEOWLIFE_USER_DATA'] || join(app.getPath('appData'), 'MeowLife-dev'))
}

let db: Db | null = null
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'MeowLife',
    backgroundColor: '#FFF1F6',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Never open new windows inside the app; send https links to the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.focus()
  })

  void app.whenReady().then(() => {
    const userData = app.getPath('userData')
    const dbPath = join(userData, 'meowlife.db')
    try {
      db = openDatabase(dbPath)
    } catch (error) {
      dialog.showErrorBox(
        'เปิดฐานข้อมูลไม่สำเร็จ',
        `MeowLife เปิดไฟล์ข้อมูลไม่ได้\n${dbPath}\n\n${error instanceof Error ? error.message : ''}`
      )
      app.quit()
      return
    }
    registerIpcHandlers(db, userData)
    registerDataHandlers(db, userData)
    setDueSoonDays(getSettings(db).dueSoonDays)
    registerPortalHandlers(db, (s) => setDueSoonDays(s.dueSoonDays))
    try {
      ensureDailyBackup(db, join(userData, 'backups'))
    } catch (error) {
      console.warn('[backup] daily backup failed:', error instanceof Error ? error.name : 'unknown')
    }
    createWindow()
    startAutoUpdates()
    startReminders(db)
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('will-quit', () => {
    db?.close()
    db = null
  })
}
