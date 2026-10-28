import { BrowserWindow, Notification } from 'electron'
import { todayIso } from '@shared/dates'
import { reminderText, shouldNotify } from '@shared/reminders'
import type { Db } from './db/connection'
import { dueReminders, getSettings } from './db/portalQueries'
import { getState, setState } from './db/syncRepo'

const FIRST_CHECK_MS = 20_000
const CHECK_EVERY_MS = 30 * 60_000

/**
 * Desktop reminder: at most one friendly notification a day, after the hour chosen in Settings,
 * and only when a task or bill needs attention. Runs while the app is open.
 */
export function startReminders(db: Db): void {
  const check = (): void => {
    try {
      const settings = getSettings(db)
      const now = new Date()
      const today = todayIso(now)
      const { counts } = dueReminders(db, today, settings.dueSoonDays)
      const ok = shouldNotify({
        enabled: settings.remindersEnabled,
        today,
        hour: now.getHours(),
        reminderHour: settings.reminderHour,
        lastNotifiedDate: getState(db, 'last_reminder_date'),
        counts
      })
      if (!ok || !Notification.isSupported()) return
      const n = new Notification({ title: 'MeowLife 🐱', body: reminderText(counts) })
      n.on('click', () => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) {
          if (win.isMinimized()) win.restore()
          win.show()
          win.focus()
        }
      })
      n.show()
      setState(db, 'last_reminder_date', today)
    } catch (error) {
      console.warn('[reminders] check failed:', error instanceof Error ? error.name : 'unknown')
    }
  }
  setTimeout(check, FIRST_CHECK_MS)
  setInterval(check, CHECK_EVERY_MS)
}
