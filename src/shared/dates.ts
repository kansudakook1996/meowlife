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

let useBuddhistYear = true

/** Settings → "แสดงปี": true = พ.ศ. (default), false = ค.ศ. */
export function setBuddhistYear(value: boolean): void {
  useBuddhistYear = value
}

const fmtDate = {
  be: new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
  ce: new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
const fmtMonth = {
  be: new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  ce: new Intl.DateTimeFormat('th-TH-u-ca-gregory', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** "2026-10-28" → "28 ต.ค. 2569" (or 2026 when the setting is ค.ศ.) */
export function formatThaiDate(date: string): string {
  return fmtDate[useBuddhistYear ? 'be' : 'ce'].format(new Date(toUtcMs(date)))
}

/** "2026-10" → "ตุลาคม 2569" */
export function formatThaiMonth(month: string): string {
  const [y, m] = parseMonth(month)
  return fmtMonth[useBuddhistYear ? 'be' : 'ce'].format(new Date(Date.UTC(y, m - 1, 1)))
}

/** Add (or subtract) whole days: addDays('2026-12-31', 1) → '2027-01-01'. */
export function addDays(date: string, delta: number): string {
  const d = new Date(toUtcMs(date) + delta * DAY_MS)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(date: string): number {
  return new Date(toUtcMs(date)).getUTCDay()
}

/** The Sunday on or before `date` (Thai calendars start the week on Sunday). */
export function startOfWeek(date: string): string {
  return addDays(date, -weekdayOf(date))
}

export const THAI_WEEKDAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'] as const
export const THAI_WEEKDAYS_LONG = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'] as const

/** Cells of a month grid (Sunday-first): leading/trailing days from neighbouring months fill whole weeks. */
export function monthGrid(month: string): string[] {
  const first = firstDayOfMonth(month)
  const start = startOfWeek(first)
  const last = addDays(firstDayOfNextMonth(month), -1)
  const weeks = Math.ceil((diffDays(start, last) + 1) / 7)
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
}