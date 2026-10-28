import { describe, expect, it } from 'vitest'
import { groupByDate, type CalendarEvent } from './calendar'
import { reminderText, shouldNotify, totalReminders, type NotifyContext } from './reminders'

const counts = { overdueTasks: 0, todayTasks: 0, overdueBills: 0, soonBills: 0 }
const ctx = (over: Partial<NotifyContext> = {}): NotifyContext => ({
  enabled: true,
  today: '2026-10-29',
  hour: 10,
  reminderHour: 9,
  lastNotifiedDate: null,
  counts: { ...counts, todayTasks: 2 },
  ...over
})

describe('reminders', () => {
  it('writes a friendly sentence', () => {
    expect(reminderText({ ...counts, todayTasks: 2, overdueTasks: 1, soonBills: 1 })).toBe('วันนี้มีงานที่ต้องทำ 3 รายการ · บิลใกล้ครบกำหนด 1 รายการ ค่อย ๆ ทำไปทีละอย่างนะ')
    expect(reminderText({ ...counts, overdueBills: 2 })).toContain('บิลเลยกำหนด 2 รายการ')
    expect(reminderText(counts)).toContain('ไม่มีอะไรค้าง')
    expect(totalReminders({ overdueTasks: 1, todayTasks: 2, overdueBills: 3, soonBills: 4 })).toBe(10)
  })

  it('notifies once a day, after the chosen hour, only when something is due', () => {
    expect(shouldNotify(ctx())).toBe(true)
    expect(shouldNotify(ctx({ hour: 8 }))).toBe(false) // too early
    expect(shouldNotify(ctx({ hour: 9 }))).toBe(true)
    expect(shouldNotify(ctx({ lastNotifiedDate: '2026-10-29' }))).toBe(false) // already told today
    expect(shouldNotify(ctx({ lastNotifiedDate: '2026-10-28' }))).toBe(true)
    expect(shouldNotify(ctx({ enabled: false }))).toBe(false)
    expect(shouldNotify(ctx({ counts }))).toBe(false) // nothing due
  })
})

describe('calendar grouping', () => {
  it('groups by day with bills first', () => {
    const e = (date: string, type: CalendarEvent['type'], id: string): CalendarEvent => ({ date, type, id, title: id })
    const map = groupByDate([e('2026-10-29', 'journal', 'j'), e('2026-10-29', 'bill', 'b'), e('2026-10-29', 'task', 't'), e('2026-10-30', 'task', 't2')])
    expect(map.get('2026-10-29')?.map((x) => x.id)).toEqual(['b', 't', 'j'])
    expect(map.get('2026-10-30')).toHaveLength(1)
  })
})
