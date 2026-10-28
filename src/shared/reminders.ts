/** What needs attention today (tasks and bills). */
export interface ReminderCounts {
  overdueTasks: number
  todayTasks: number
  overdueBills: number
  soonBills: number
}

export const totalReminders = (c: ReminderCounts): number => c.overdueTasks + c.todayTasks + c.overdueBills + c.soonBills

/** Friendly one-line text for the desktop notification (never scolding). */
export function reminderText(c: ReminderCounts): string {
  const parts: string[] = []
  const tasks = c.overdueTasks + c.todayTasks
  if (tasks > 0) parts.push(`งานที่ต้องทำ ${tasks} รายการ`)
  if (c.overdueBills > 0) parts.push(`บิลเลยกำหนด ${c.overdueBills} รายการ`)
  if (c.soonBills > 0) parts.push(`บิลใกล้ครบกำหนด ${c.soonBills} รายการ`)
  return parts.length === 0 ? 'วันนี้ไม่มีอะไรค้างเลย สบายใจได้ 🐱' : `วันนี้มี${parts.join(' · ')} ค่อย ๆ ทำไปทีละอย่างนะ`
}

export interface NotifyContext {
  enabled: boolean
  /** Local date "YYYY-MM-DD" and hour 0–23 of "now". */
  today: string
  hour: number
  reminderHour: number
  /** Date of the last notification we showed. */
  lastNotifiedDate: string | null
  counts: ReminderCounts
}

/** At most one desktop notification per day, only after the chosen hour, and only when something is due. */
export function shouldNotify(ctx: NotifyContext): boolean {
  return ctx.enabled && ctx.hour >= ctx.reminderHour && ctx.lastNotifiedDate !== ctx.today && totalReminders(ctx.counts) > 0
}
