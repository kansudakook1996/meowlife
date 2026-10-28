import { addDays, diffDays, firstDayOfMonth, firstDayOfNextMonth } from '@shared/dates'
import type { CalendarEvent } from '@shared/calendar'
import {
  dateStreaks,
  DEFAULT_SETTINGS,
  encouragement,
  evaluateBadges,
  savingPercent,
  SettingsPatchSchema,
  type AppSettings,
  type BadgeFacts,
  type SettingsPatch
} from '@shared/portalModel'
import type { ActivityInsights, CompanionState, DueReminders } from '@shared/portalApi'
import type { TransactionView } from '@shared/types'
import type { Db } from './connection'
import { getState, setState } from './syncRepo'
import { listGoals, toTask } from './portalRepo'
import { listDueBills, listForRange } from './transactionRepo'

type Row = Record<string, unknown>
const all = (db: Db, sql: string, ...args: Array<string | number | null>): Row[] => db.prepare(sql).all(...args) as unknown as Row[]
const count = (db: Db, sql: string, ...args: Array<string | number | null>): number => (db.prepare(sql).get(...args) as { n: number }).n

/* ---------- settings (stored on this device only) ---------- */

export function getSettings(db: Db): AppSettings {
  const stored: Record<string, unknown> = {}
  for (const r of all(db, 'SELECT key, value FROM app_settings')) {
    try {
      stored[r['key'] as string] = JSON.parse(r['value'] as string)
    } catch {
      /* ignore a damaged value; the default is used */
    }
  }
  // Accept only the keys/values that validate; anything else falls back to the default.
  const valid: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(stored)) if (SettingsPatchSchema.safeParse({ [k]: v }).success) valid[k] = v
  return { ...DEFAULT_SETTINGS, ...(valid as SettingsPatch) }
}

export function setSettings(db: Db, patch: SettingsPatch): AppSettings {
  const up = db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) up.run(k, JSON.stringify(v))
  return getSettings(db)
}

/* ---------- calendar ---------- */

export function calendarEvents(db: Db, from: string, to: string, today: string): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const { byDate, bills } = listForRange(db, from, to, today)
  const txEvent = (t: TransactionView, date: string, type: 'bill' | 'transaction'): CalendarEvent => ({
    date, type, id: t.id, title: t.title, kind: t.kind, amountSatang: t.amountSatang, status: t.status, done: t.isPaid
  })
  for (const t of byDate) if (t.isPaid || !t.dueDate) events.push(txEvent(t, t.txnDate, 'transaction'))
  for (const t of bills) events.push(txEvent(t, t.dueDate as string, 'bill'))

  for (const r of all(db, 'SELECT * FROM tasks WHERE deleted_at IS NULL AND due_date >= ? AND due_date <= ?', from, to)) {
    const t = toTask(r)
    events.push({ date: t.dueDate as string, type: 'task', id: t.id, title: t.title, done: t.isDone })
  }
  for (const r of all(db, 'SELECT id, entry_date, mood FROM journal_entries WHERE deleted_at IS NULL AND entry_date >= ? AND entry_date <= ?', from, to)) {
    events.push({ date: r['entry_date'] as string, type: 'journal', id: r['id'] as string, title: 'บันทึกประจำวัน', mood: r['mood'] as number })
  }
  for (const r of all(db, 'SELECT check_date, COUNT(*) AS n FROM habit_checks WHERE deleted_at IS NULL AND check_date >= ? AND check_date <= ? GROUP BY check_date', from, to)) {
    events.push({ date: r['check_date'] as string, type: 'habit', id: `habit-${r['check_date'] as string}`, title: `ทำนิสัยแล้ว ${r['n'] as number} อย่าง` })
  }
  return events
}

/* ---------- reminders ---------- */

export function dueReminders(db: Db, today: string, dueSoonDays: number): DueReminders {
  const tasks = all(db, 'SELECT * FROM tasks WHERE deleted_at IS NULL AND is_done = 0 AND due_date IS NOT NULL AND due_date <= ? ORDER BY due_date', today).map(toTask)
  const bills = listDueBills(db, addDays(today, dueSoonDays), today)
  return {
    tasks,
    bills,
    counts: {
      overdueTasks: tasks.filter((t) => (t.dueDate as string) < today).length,
      todayTasks: tasks.filter((t) => t.dueDate === today).length,
      overdueBills: bills.filter((b) => b.status === 'overdue').length,
      soonBills: bills.filter((b) => b.status === 'due_soon').length
    }
  }
}

/* ---------- insights (activity side; finance numbers come from the summary/trend calls) ---------- */

export function activityInsights(db: Db, month: string, today: string): ActivityInsights {
  const from = firstDayOfMonth(month)
  const next = firstDayOfNextMonth(month)
  const last = addDays(next, -1)
  const upTo = today < last ? (today < from ? addDays(from, -1) : today) : last
  const daysCounted = Math.max(0, diffDays(from, upTo) + 1)

  const moods = all(db, 'SELECT mood FROM journal_entries WHERE deleted_at IS NULL AND entry_date >= ? AND entry_date < ?', from, next)
  const habits = all(db, 'SELECT id, name, icon FROM habits WHERE deleted_at IS NULL ORDER BY sort_order, created_at').map((h) => ({
    id: h['id'] as string,
    name: h['name'] as string,
    icon: h['icon'] as string,
    daysCounted,
    doneDays: count(db, 'SELECT COUNT(*) AS n FROM habit_checks WHERE deleted_at IS NULL AND habit_id = ? AND check_date >= ? AND check_date < ?', h['id'] as string, from, next)
  }))
  return {
    month,
    tasksDone: count(db, 'SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL AND done_date >= ? AND done_date < ?', from, next),
    tasksOpen: count(db, 'SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL AND is_done = 0'),
    tasksOverdue: count(db, 'SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL AND is_done = 0 AND due_date < ?', today),
    journalDays: moods.length,
    averageMood: moods.length === 0 ? null : Math.round((moods.reduce((s, m) => s + (m['mood'] as number), 0) / moods.length) * 10) / 10,
    habits,
    goals: listGoals(db).map((g) => ({
      id: g.id,
      title: g.title,
      kind: g.kind,
      percent: g.kind === 'saving' ? savingPercent(g) : g.progress,
      isDone: g.isDone
    }))
  }
}

/* ---------- companion ---------- */

export function companionFacts(db: Db, today: string): BadgeFacts {
  const month = today.slice(0, 7)
  const journalDates = all(db, 'SELECT entry_date FROM journal_entries WHERE deleted_at IS NULL').map((r) => r['entry_date'] as string)
  let habitBest = 0
  const checks = new Map<string, string[]>()
  for (const r of all(db, 'SELECT habit_id, check_date FROM habit_checks WHERE deleted_at IS NULL')) {
    const list = checks.get(r['habit_id'] as string) ?? []
    list.push(r['check_date'] as string)
    checks.set(r['habit_id'] as string, list)
  }
  for (const dates of checks.values()) habitBest = Math.max(habitBest, dateStreaks(dates, today).bestStreak)

  const goals = listGoals(db)
  return {
    transactionCount: count(db, 'SELECT COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL'),
    expenseCountThisMonth: count(db, "SELECT COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL AND kind = 'expense' AND txn_date >= ? AND txn_date < ?", firstDayOfMonth(month), firstDayOfNextMonth(month)),
    overdueCount: count(db, "SELECT COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL AND kind = 'expense' AND is_paid = 0 AND due_date < ?", today),
    journalBestStreak: dateStreaks(journalDates, today).bestStreak,
    habitBestStreak: habitBest,
    doneTasks: count(db, 'SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL AND done_date IS NOT NULL'),
    savingBestPercent: Math.max(0, ...goals.filter((g) => g.kind === 'saving').map((g) => savingPercent(g))),
    noteCount: count(db, 'SELECT COUNT(*) AS n FROM notes WHERE deleted_at IS NULL'),
    synced: getState(db, 'owner_uid') !== null,
    goalsDone: goals.filter((g) => g.isDone).length
  }
}

export function companionState(db: Db, today: string): CompanionState {
  const facts = companionFacts(db, today)
  const badges = evaluateBadges(facts)
  const seen = new Set<string>(safeJsonArray(getState(db, 'badges_seen')))
  return {
    badges,
    message: encouragement(today, facts),
    newBadgeIds: badges.filter((b) => b.earned && !seen.has(b.id)).map((b) => b.id)
  }
}

export function markBadgesSeen(db: Db, ids: string[]): void {
  const seen = new Set<string>(safeJsonArray(getState(db, 'badges_seen')))
  for (const id of ids) seen.add(id)
  setState(db, 'badges_seen', JSON.stringify([...seen]))
}

function safeJsonArray(text: string | null): string[] {
  try {
    const v: unknown = JSON.parse(text ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
