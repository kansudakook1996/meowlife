import type { EntryKind, PaymentStatus } from './types'

export type CalendarEventType = 'bill' | 'transaction' | 'task' | 'journal' | 'habit'

export interface CalendarEvent {
  date: string
  type: CalendarEventType
  id: string
  title: string
  kind?: EntryKind
  amountSatang?: number
  status?: PaymentStatus
  done?: boolean
  mood?: number
}

export const CALENDAR_ICONS: Record<CalendarEventType, string> = {
  bill: '🧾',
  transaction: '💸',
  task: '✅',
  journal: '📔',
  habit: '🌱'
}

/** Group events by date, keeping bills first, then tasks, then the rest. */
export function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const order: Record<CalendarEventType, number> = { bill: 0, task: 1, transaction: 2, habit: 3, journal: 4 }
  const map = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    const list = map.get(e.date) ?? []
    list.push(e)
    map.set(e.date, list)
  }
  for (const list of map.values()) list.sort((a, b) => order[a.type] - order[b.type])
  return map
}
