import { z } from 'zod'
import { addDays, addMonths, monthOf, recurringDateFor } from './dates'
import { MAX_SATANG } from './money'
import { IsoDateSchema } from './schemas'

/* ---------- entities (what the UI sees) ---------- */

export type TaskRepeat = 'none' | 'daily' | 'weekly' | 'monthly'

export interface Task {
  id: string
  title: string
  note: string
  dueDate: string | null
  repeat: TaskRepeat
  isDone: boolean
  doneDate: string | null
  createdAt: string
  updatedAt: string
}

export interface JournalEntry {
  id: string
  entryDate: string
  /** 1 (rough) … 5 (great) */
  mood: number
  body: string
  updatedAt: string
}

export type GoalKind = 'life' | 'saving'

export interface Goal {
  id: string
  title: string
  kind: GoalKind
  targetSatang: number | null
  savedSatang: number
  /** 0–100, used by life goals */
  progress: number
  targetDate: string | null
  note: string
  isDone: boolean
  doneDate: string | null
  createdAt: string
}

export interface Habit {
  id: string
  name: string
  icon: string
  sortOrder: number
}

export interface Note {
  id: string
  title: string
  body: string
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

export const MOODS = [
  { value: 1, icon: '😣', label: 'แย่' },
  { value: 2, icon: '😕', label: 'ไม่ค่อยดี' },
  { value: 3, icon: '😐', label: 'เฉย ๆ' },
  { value: 4, icon: '🙂', label: 'ดี' },
  { value: 5, icon: '😄', label: 'ดีมาก' }
] as const

/* ---------- inputs (validated in the main process) ---------- */

const Title = z.string().trim().min(1, { error: 'กรุณาใส่ชื่อ' }).max(80, { error: 'ชื่อยาวเกิน 80 ตัวอักษร' })
const NoteText = z.string().trim().max(500, { error: 'หมายเหตุยาวเกิน 500 ตัวอักษร' })
const LongText = z.string().max(5000, { error: 'ข้อความยาวเกิน 5,000 ตัวอักษร' })

export const TaskInputSchema = z.strictObject({
  title: Title,
  note: NoteText,
  dueDate: IsoDateSchema.nullable(),
  repeat: z.enum(['none', 'daily', 'weekly', 'monthly'])
})
export type TaskInput = z.infer<typeof TaskInputSchema>

export const JournalInputSchema = z.strictObject({
  entryDate: IsoDateSchema,
  mood: z.number().int().min(1).max(5),
  body: LongText
})
export type JournalInput = z.infer<typeof JournalInputSchema>

export const GoalInputSchema = z
  .strictObject({
    title: Title,
    kind: z.enum(['life', 'saving']),
    targetSatang: z.number().int().min(1).max(MAX_SATANG).nullable(),
    savedSatang: z.number().int().min(0).max(MAX_SATANG),
    progress: z.number().int().min(0).max(100),
    targetDate: IsoDateSchema.nullable(),
    note: NoteText
  })
  .refine((g) => g.kind !== 'saving' || g.targetSatang !== null, { error: 'เป้าหมายการออมต้องระบุจำนวนเงินเป้าหมาย', path: ['targetSatang'] })
export type GoalInput = z.infer<typeof GoalInputSchema>

export const HabitInputSchema = z.strictObject({
  name: z.string().trim().min(1, { error: 'กรุณาใส่ชื่อนิสัย' }).max(40, { error: 'ชื่อยาวเกิน 40 ตัวอักษร' }),
  icon: z.string().trim().min(1).max(8)
})
export type HabitInput = z.infer<typeof HabitInputSchema>

export const NoteInputSchema = z.strictObject({
  title: Title,
  body: LongText,
  isPinned: z.boolean()
})
export type NoteInput = z.infer<typeof NoteInputSchema>

/** Tables managed by the generic create/update/remove channels, and the schema that guards each. */
export const PORTAL_TABLES = ['tasks', 'journal_entries', 'goals', 'habits', 'notes', 'credit_cards', 'card_charges', 'card_plans'] as const
export type PortalTable = (typeof PORTAL_TABLES)[number]

/* ---------- settings ---------- */

export type ThemeName = 'fresh' | 'warm'

export interface AppSettings {
  theme: ThemeName
  /** A bill due within this many days counts as "due soon". */
  dueSoonDays: number
  yearStyle: 'be' | 'ce'
  moneyStyle: 'symbol' | 'word'
  remindersEnabled: boolean
  /** Local hour (0–23) after which the daily reminder may appear. */
  reminderHour: number
  /** Sync automatically when signed in (otherwise only the "ซิงก์ตอนนี้" button). */
  autoSync: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'fresh',
  dueSoonDays: 3,
  yearStyle: 'be',
  moneyStyle: 'symbol',
  remindersEnabled: true,
  reminderHour: 9,
  autoSync: true
}

export const SettingsPatchSchema = z
  .strictObject({
    theme: z.enum(['fresh', 'warm']),
    dueSoonDays: z.number().int().min(1).max(14),
    yearStyle: z.enum(['be', 'ce']),
    moneyStyle: z.enum(['symbol', 'word']),
    remindersEnabled: z.boolean(),
    reminderHour: z.number().int().min(0).max(23),
    autoSync: z.boolean()
  })
  .partial()
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

/* ---------- tasks ---------- */

/** One step of a repeating task. Monthly repeats keep the day number, clamped to short months. */
export function nextDueDate(due: string, repeat: Exclude<TaskRepeat, 'none'>): string {
  if (repeat === 'daily') return addDays(due, 1)
  if (repeat === 'weekly') return addDays(due, 7)
  return recurringDateFor(addMonths(monthOf(due), 1), Number(due.slice(8, 10)))
}

/**
 * New due date after completing a repeating task: the next occurrence that is after today
 * (an overdue "weekly" task done today is due again next week, not tomorrow).
 */
export function advanceRepeating(due: string | null, repeat: Exclude<TaskRepeat, 'none'>, today: string): string {
  let next = due ?? today
  for (let i = 0; i < 500; i++) {
    next = nextDueDate(next, repeat)
    if (next > today) return next
  }
  return next
}

/* ---------- streaks (habits and journal) ---------- */

export interface StreakStats {
  /** Consecutive days up to today — or up to yesterday while today is not yet done (no pressure). */
  currentStreak: number
  bestStreak: number
  /** Days done in the last 30 days (including today). */
  last30: number
  total: number
  doneToday: boolean
}

export function dateStreaks(dates: Iterable<string>, today: string): StreakStats {
  const set = new Set(dates)
  const doneToday = set.has(today)
  let current = 0
  for (let d = doneToday ? today : addDays(today, -1); set.has(d); d = addDays(d, -1)) current++

  const sorted = [...set].sort()
  let best = 0
  let run = 0
  let prev: string | null = null
  for (const d of sorted) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  const from = addDays(today, -29)
  let last30 = 0
  for (const d of set) if (d >= from && d <= today) last30++
  return { currentStreak: current, bestStreak: best, last30, total: set.size, doneToday }
}

/* ---------- companion: badges and encouragement ---------- */

export interface BadgeFacts {
  transactionCount: number
  expenseCountThisMonth: number
  overdueCount: number
  journalBestStreak: number
  habitBestStreak: number
  doneTasks: number
  /** Best progress among saving goals, in percent (can exceed 100). */
  savingBestPercent: number
  noteCount: number
  synced: boolean
  goalsDone: number
}

export interface Badge {
  id: string
  icon: string
  title: string
  /** What to do to earn it (shown while locked). */
  hint: string
  earned: boolean
}

const BADGE_DEFS: Array<Omit<Badge, 'earned'> & { test: (f: BadgeFacts) => boolean }> = [
  { id: 'first-record', icon: '🌱', title: 'เริ่มต้นแล้ว', hint: 'จดรายการแรก', test: (f) => f.transactionCount >= 1 },
  { id: 'ten-records', icon: '📒', title: 'นักจดมือใหม่', hint: 'จดครบ 10 รายการ', test: (f) => f.transactionCount >= 10 },
  { id: 'hundred-records', icon: '🏅', title: 'นักจดตัวจริง', hint: 'จดครบ 100 รายการ', test: (f) => f.transactionCount >= 100 },
  { id: 'bills-clear', icon: '🧾', title: 'บิลเคลียร์', hint: 'เดือนนี้มีรายจ่ายและไม่มีบิลเกินกำหนด', test: (f) => f.expenseCountThisMonth >= 1 && f.overdueCount === 0 },
  { id: 'journal-3', icon: '📔', title: 'เล่าให้แมวฟัง', hint: 'เขียนบันทึกต่อเนื่อง 3 วัน', test: (f) => f.journalBestStreak >= 3 },
  { id: 'journal-7', icon: '📚', title: 'นักเขียนประจำ', hint: 'เขียนบันทึกต่อเนื่อง 7 วัน', test: (f) => f.journalBestStreak >= 7 },
  { id: 'habit-7', icon: '🌟', title: 'นิสัยดีต่อเนื่อง', hint: 'ทำนิสัยเดียวต่อเนื่อง 7 วัน', test: (f) => f.habitBestStreak >= 7 },
  { id: 'tasks-10', icon: '✅', title: 'ลุยงานเสร็จ', hint: 'ทำงานเสร็จ 10 รายการ', test: (f) => f.doneTasks >= 10 },
  { id: 'saving-half', icon: '🐷', title: 'ออมได้ครึ่งทาง', hint: 'เป้าหมายการออมถึง 50%', test: (f) => f.savingBestPercent >= 50 },
  { id: 'goal-done', icon: '🎯', title: 'ถึงเป้าหมาย', hint: 'ทำเป้าหมายสำเร็จ 1 ข้อ', test: (f) => f.goalsDone >= 1 },
  { id: 'notes-5', icon: '🗒️', title: 'นักจดโน้ต', hint: 'มีโน้ต 5 รายการ', test: (f) => f.noteCount >= 5 },
  { id: 'synced', icon: '☁️', title: 'ข้อมูลปลอดภัย', hint: 'เข้าสู่ระบบและซิงก์ข้อมูลขึ้นออนไลน์', test: (f) => f.synced }
]

export function evaluateBadges(facts: BadgeFacts): Badge[] {
  return BADGE_DEFS.map(({ test, ...badge }) => ({ ...badge, earned: test(facts) }))
}

const GENTLE_MESSAGES = [
  'วันนี้ค่อย ๆ ไปทีละอย่างนะ เจ๊หมีกับอาจารย์ส้มเชียร์อยู่ตรงนี้',
  'จดนิดหน่อยก็นับว่าเก่งแล้ว',
  'พักบ้างก็ได้นะ ไม่ต้องรีบ',
  'เมื่อวานจะเป็นยังไงก็ช่าง วันนี้เริ่มใหม่ได้เสมอ',
  'ดื่มน้ำสักแก้วไหม? 💧',
  'เก็บเงินเล็ก ๆ ทุกวัน สุดท้ายก็กองโตได้',
  'ทำไม่ครบทุกอย่างก็ไม่เป็นไร เลือกทำข้อที่สำคัญที่สุดก่อน',
  'ขอบคุณที่ดูแลตัวเองและเงินของตัวเองนะ'
]

/** Same message all day (chosen from the date), and never scolding. */
export function encouragement(today: string, facts: BadgeFacts): { mood: 'happy' | 'sleepy' | 'cheer' | 'worried'; text: string } {
  if (facts.overdueCount > 0) {
    return { mood: 'worried', text: `มีบิลเกินกำหนด ${facts.overdueCount} รายการ ค่อย ๆ จัดการทีละบิลนะ ไม่ต้องกังวล` }
  }
  if (facts.transactionCount === 0) return { mood: 'sleepy', text: 'ยังไม่มีรายการเลย เริ่มจดรายการแรกเมื่อพร้อมได้เลยนะ' }
  const n = Number(today.replace(/-/g, '')) % GENTLE_MESSAGES.length
  const earned = evaluateBadges(facts).filter((b) => b.earned).length
  return { mood: earned >= 3 ? 'cheer' : 'happy', text: GENTLE_MESSAGES[n] as string }
}

/** Saving goal progress in percent (not capped, so "110%" is visible). */
export function savingPercent(goal: Pick<Goal, 'savedSatang' | 'targetSatang'>): number {
  if (!goal.targetSatang) return 0
  return Math.floor((goal.savedSatang / goal.targetSatang) * 100)
}
