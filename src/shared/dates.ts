/**
 * Dates are plain local calendar dates "YYYY-MM-DD" (no time zone).
 * Months are "YYYY-MM". All math goes through UTC so DST/time zones cannot shift a day.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/
const DAY_MS = 86_400_000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
}

export function isValidIsoDate(value: string): boolean {
  const m = DATE_PATTERN.exec(value)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  return year >= 1900 && year <= 2999 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

export function isValidMonth(value: string): boolean {
  const m = MONTH_PATTERN.exec(value)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  return year >= 1900 && year <= 2999 && month >= 1 && month <= 12
}

function parseMonth(month: string): [number, number] {
  const m = MONTH_PATTERN.exec(month)
  if (!m || !isValidMonth(month)) throw new RangeError(`Invalid month: ${month}`)
  return [Number(m[1]), Number(m[2])]
}

function toUtcMs(date: string): number {
  const m = DATE_PATTERN.exec(date)
  if (!m || !isValidIsoDate(date)) throw new RangeError(`Invalid date: ${date}`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Local "today" of the given clock as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = parseMonth(month)
  const index = y * 12 + (m - 1) + delta
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`
}

export function firstDayOfMonth(month: string): string {
  parseMonth(month)
  return `${month}-01`
}

/** Exclusive end: first day of the following month. */
export function firstDayOfNextMonth(month: string): string {
  return `${addMonths(month, 1)}-01`
}

/** Date of a monthly bill: day 31 in a 30-day month becomes the 30th, Feb → 28/29. */
export function recurringDateFor(month: string, dayOfMonth: number): string {
  const [y, m] = parseMonth(month)
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new RangeError(`Invalid day of month: ${dayOfMonth}`)
  }
  return `${month}-${pad2(Math.min(dayOfMonth, daysInMonth(y, m)))}`
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS)
}

const thaiDate = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC'
})
const thaiMonth = new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** "2026-10-28" → "28 ต.ค. 2569" (Buddhist year) */
export function formatThaiDate(date: string): string {
  return thaiDate.format(new Date(toUtcMs(date)))
}

/** "2026-10" → "ตุลาคม 2569" */
export function formatThaiMonth(month: string): string {
  const [y, m] = parseMonth(month)
  return thaiMonth.format(new Date(Date.UTC(y, m - 1, 1)))
}
