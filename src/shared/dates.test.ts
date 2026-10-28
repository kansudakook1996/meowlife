import { describe, expect, it } from 'vitest'
import {
  addMonths,
  daysInMonth,
  diffDays,
  firstDayOfNextMonth,
  formatThaiDate,
  formatThaiMonth,
  isValidIsoDate,
  isValidMonth,
  recurringDateFor,
  todayIso
} from './dates'

describe('validation', () => {
  it('accepts real dates only', () => {
    expect(isValidIsoDate('2026-10-28')).toBe(true)
    expect(isValidIsoDate('2028-02-29')).toBe(true)
    expect(isValidIsoDate('2027-02-29')).toBe(false)
    expect(isValidIsoDate('2026-04-31')).toBe(false)
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('2026-1-01')).toBe(false)
    expect(isValidIsoDate('')).toBe(false)
  })

  it('validates months', () => {
    expect(isValidMonth('2026-12')).toBe(true)
    expect(isValidMonth('2026-00')).toBe(false)
    expect(isValidMonth('2026-10-01')).toBe(false)
  })
})

describe('month math', () => {
  it('knows month lengths and leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2100, 2)).toBe(28)
    expect(daysInMonth(2000, 2)).toBe(29)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 12)).toBe(31)
  })

  it('adds months across year boundaries', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-10', 15)).toBe('2028-01')
    expect(firstDayOfNextMonth('2026-12')).toBe('2027-01-01')
  })

  it('clamps recurring day to month end', () => {
    expect(recurringDateFor('2026-10', 31)).toBe('2026-10-31')
    expect(recurringDateFor('2026-11', 31)).toBe('2026-11-30')
    expect(recurringDateFor('2027-02', 30)).toBe('2027-02-28')
    expect(recurringDateFor('2028-02', 31)).toBe('2028-02-29')
    expect(recurringDateFor('2026-10', 5)).toBe('2026-10-05')
    expect(() => recurringDateFor('2026-10', 0)).toThrow()
    expect(() => recurringDateFor('2026-10', 32)).toThrow()
  })

  it('diffs days across month/year ends', () => {
    expect(diffDays('2026-10-28', '2026-10-28')).toBe(0)
    expect(diffDays('2026-10-28', '2026-11-01')).toBe(4)
    expect(diffDays('2026-12-31', '2027-01-01')).toBe(1)
    expect(diffDays('2028-02-28', '2028-03-01')).toBe(2)
    expect(diffDays('2026-11-01', '2026-10-28')).toBe(-4)
  })

  it('uses the local calendar date for today', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('Thai formatting', () => {
  it('shows Buddhist years', () => {
    expect(formatThaiDate('2026-10-28')).toBe('28 ต.ค. 2569')
    expect(formatThaiMonth('2026-10')).toBe('ตุลาคม 2569')
    expect(formatThaiMonth('2027-01')).toBe('มกราคม 2570')
  })
})
