import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC_EVENTS } from '@shared/ipc'
import type { UpdateStatus } from '@shared/types'

/**
 * Auto-update from public GitHub Releases (see electron-builder.yml `publish`).
 * Only runs in the installed app. The user's data lives in %APPDATA%\MeowLife,
 * which the NSIS updater never touches.
 */
const CHECK_DELAY_MS = 10_000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

let status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'disabled', version: null, percent: null }

function publish(next: Partial<UpdateStatus>): void {
  status = { ...status, ...next }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_EVENTS.updateStatus, status)
  }
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return status
  if (status.state === 'checking' || status.state === 'downloading' || status.state === 'downloaded') return status
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    // The 'error' event already reported it.
  }
  return status
}

export function installUpdate(): void {
  if (status.state !== 'downloaded') return
  // isSilent = true: without it the assisted NSIS installer shows its full wizard and waits
  // for "Finish" (seen when testing 0.1.0 → 0.1.2). isForceRunAfter = true reopens the app.
  autoUpdater.quitAndInstall(true, true)
}

export function startAutoUpdates(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => publish({ state: 'checking', percent: null }))
  autoUpdater.on('update-available', (info) => publish({ state: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('update-not-available', () => publish({ state: 'up-to-date', version: null, percent: null }))
  autoUpdater.on('download-progress', (p) => publish({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => publish({ state: 'downloaded', version: info.version, percent: 100 }))
  autoUpdater.on('error', (error) => {
    // Offline is normal for this app; keep the message out of the UI and logs short.
    console.warn('[updater] check failed:', error.name)
    publish({ state: 'error', percent: null })
  })

  setTimeout(() => void checkForUpdates(), CHECK_DELAY_MS)
  setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS)
}
