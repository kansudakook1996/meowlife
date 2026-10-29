import { describe, expect, it } from 'vitest'
import { addDays, monthGrid, setBuddhistYear, formatThaiDate, startOfWeek, weekdayOf } from './dates'
import {
  advanceRepeating,
  dateStreaks,
  encouragement,
  evaluateBadges,
  GoalInputSchema,
  nextDueDate,
  savingPercent,
  SettingsPatchSchema,
  TaskInputSchema,
  type BadgeFacts
} from './portalModel'

describe('date helpers', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(addDays('2026-10-28', 0)).toBe('2026-10-28')
  })

  it('finds weekdays and the Sunday-first week start', () => {
    expect(weekdayOf('2026-10-28')).toBe(3) // Wednesday
    expect(startOfWeek('2026-10-28')).toBe('2026-10-25')
    expect(startOfWeek('2026-10-25')).toBe('2026-10-25')
  })

  it('builds whole-week month grids', () => {
    const oct = monthGrid('2026-10')
    expect(oct).toHaveLength(35)
    expect(oct[0]).toBe('2026-09-27')
    expect(oct[34]).toBe('2026-10-31')
    expect(monthGrid('2026-02')).toHaveLength(28) // Feb 2026 starts on Sunday and has 28 days
    expect(monthGrid('2027-01')).toHaveLength(42) // starts on a Friday and ends on a Sunday: 6 weeks
  })

  it('can show Christian-era years when asked', () => {
    expect(formatThaiDate('2026-10-28')).toContain('2569')
    setBuddhistYear(false)
    expect(formatThaiDate('2026-10-28')).toContain('2026')
    setBuddhistYear(true)
  })
})

describe('repeating tasks', () => {
  it('steps daily, weekly and monthly (clamped to short months)', () => {
    expect(nextDueDate('2026-10-28', 'daily')).toBe('2026-10-29')
    expect(nextDueDate('2026-10-28', 'weekly')).toBe('2026-11-04')
    expect(nextDueDate('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(nextDueDate('2027-12-15', 'monthly')).toBe('2028-01-15')
  })

  it('moves to the next occurrence after today', () => {
    expect(advanceRepeating('2026-10-28', 'daily', '2026-10-28')).toBe('2026-10-29')
    expect(advanceRepeating('2026-10-01', 'weekly', '2026-10-28')).toBe('2026-10-29') // 10-01 + 4 weeks
    expect(advanceRepeating('2026-11-10', 'weekly', '2026-10-28')).toBe('2026-11-17') // done early: one step
    expect(advanceRepeating(null, 'daily', '2026-10-28')).toBe('2026-10-29')
  })
})

describe('dateStreaks', () => {
  const today = '2026-10-28'
  it('counts the current streak, and does not break it while today is still open', () => {
    expect(dateStreaks(['2026-10-26', '2026-10-27'], today)).toMatchObject({ currentStreak: 2, doneToday: false })
    expect(dateStreaks(['2026-10-26', '2026-10-27', '2026-10-28'], today)).toMatchObject({ currentStreak: 3, doneToday: true })
    expect(dateStreaks(['2026-10-20'], today).currentStreak).toBe(0)
  })

  it('finds the best streak, 30-day count and total', () => {
    const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-27']
    expect(dateStreaks(dates, today)).toMatchObject({ bestStreak: 4, currentStreak: 1, total: 5, last30: 1 })
    expect(dateStreaks([], today)).toEqual({ currentStreak: 0, bestStreak: 0, last30: 0, total: 0, doneToday: false })
  })

  it('ignores duplicate dates', () => {
    expect(dateStreaks(['2026-10-28', '2026-10-28'], today).total).toBe(1)
  })
})

const facts = (over: Partial<BadgeFacts> = {}): BadgeFacts => ({
  transactionCount: 0,
  expenseCountThisMonth: 0,
  overdueCount: 0,
  journalBestStreak: 0,
  habitBestStreak: 0,
  doneTasks: 0,
  savingBestPercent: 0,
  noteCount: 0,
  synced: false,
  goalsDone: 0,
  ...over
})

describe('badges and companion', () => {
  it('earns badges from facts and keeps the rest locked with a hint', () => {
    const none = evaluateBadges(facts())
    expect(none.every((b) => !b.earned && b.hint.length > 0)).toBe(true)
    const some = evaluateBadges(facts({ transactionCount: 12, journalBestStreak: 3, savingBestPercent: 120, synced: true }))
    expect(some.filter((b) => b.earned).map((b) => b.id)).toEqual(['first-record', 'ten-records', 'journal-3', 'saving-half', 'synced'])
  })

  it('"bills clear" needs an expense and no overdue bills', () => {
    expect(evaluateBadges(facts({ expenseCountThisMonth: 2 })).find((b) => b.id === 'bills-clear')?.earned).toBe(true)
    expect(evaluateBadges(facts({ expenseCountThisMonth: 2, overdueCount: 1 })).find((b) => b.id === 'bills-clear')?.earned).toBe(false)
  })

  it('encourages gently: worried about bills without scolding, sleepy when empty, stable all day', () => {
    expect(encouragement('2026-10-28', facts({ overdueCount: 2 }))).toMatchObject({ mood: 'worried' })
    expect(encouragement('2026-10-28', facts({ overdueCount: 2 })).text).toContain('ไม่ต้องกังวล')
    expect(encouragement('2026-10-28', facts()).mood).toBe('sleepy')
    const a = encouragement('2026-10-28', facts({ transactionCount: 5 }))
    expect(encouragement('2026-10-28', facts({ transactionCount: 5 }))).toEqual(a)
    expect(a.text.length).toBeGreaterThan(5)
  })
})

describe('goals, tasks and settings validation', () => {
  it('saving goals need a target; percent can pass 100', () => {
    const base = { title: 'เที่ยวญี่ปุ่น', kind: 'saving' as const, targetSatang: null, savedSatang: 0, progress: 0, targetDate: null, note: '' }
    expect(GoalInputSchema.safeParse(base).success).toBe(false)
    expect(GoalInputSchema.safeParse({ ...base, targetSatang: 5000000 }).success).toBe(true)
    expect(GoalInputSchema.safeParse({ ...base, kind: 'life' }).success).toBe(true)
    expect(savingPercent({ savedSatang: 5500000, targetSatang: 5000000 })).toBe(110)
    expect(savingPercent({ savedSatang: 100, targetSatang: null })).toBe(0)
  })

  it('rejects bad tasks and unknown settings', () => {
    expect(TaskInputSchema.safeParse({ title: '', note: '', dueDate: null, repeat: 'none' }).success).toBe(false)
    expect(TaskInputSchema.safeParse({ title: 'x', note: '', dueDate: '2026-02-30', repeat: 'none' }).success).toBe(false)
    expect(TaskInputSchema.safeParse({ title: 'x', note: '', dueDate: null, repeat: 'yearly' }).success).toBe(false)
    expect(SettingsPatchSchema.safeParse({ theme: 'warm', dueSoonDays: 5 }).success).toBe(true)
    expect(SettingsPatchSchema.safeParse({ theme: 'blue' }).success).toBe(false) // old theme names are no longer valid
    expect(SettingsPatchSchema.safeParse({ dueSoonDays: 99 }).success).toBe(false)
    expect(SettingsPatchSchema.safeParse({ hack: true }).success).toBe(false)
  })
})
