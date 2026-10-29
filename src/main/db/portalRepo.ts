import { randomUUID } from 'node:crypto'
import { addDays } from '@shared/dates'
import {
  advanceRepeating,
  dateStreaks,
  type Goal,
  type GoalInput,
  type Habit,
  type HabitInput,
  type JournalEntry,
  type JournalInput,
  type Note,
  type NoteInput,
  type PortalTable,
  type Task,
  type TaskInput
} from '@shared/portalModel'
import type { HabitView } from '@shared/portalApi'
import { NotFoundError } from './catalogRepo'
import { inTransaction, nowIso, type Db } from './connection'
import { deterministicId } from './ids'

type Row = Record<string, unknown>
const all = (db: Db, sql: string, ...args: Array<string | number | null>): Row[] => db.prepare(sql).all(...args) as unknown as Row[]
const one = (db: Db, sql: string, ...args: Array<string | number | null>): Row | undefined => db.prepare(sql).get(...args) as unknown as Row | undefined

/* ---------- row → entity ---------- */

const bool = (v: unknown): boolean => v === 1

export const toTask = (r: Row): Task => ({
  id: r['id'] as string,
  title: r['title'] as string,
  note: r['note'] as string,
  dueDate: r['due_date'] as string | null,
  repeat: r['repeat'] as Task['repeat'],
  isDone: bool(r['is_done']),
  doneDate: r['done_date'] as string | null,
  createdAt: r['created_at'] as string,
  updatedAt: r['updated_at'] as string
})

const toJournal = (r: Row): JournalEntry => ({
  id: r['id'] as string,
  entryDate: r['entry_date'] as string,
  mood: r['mood'] as number,
  body: r['body'] as string,
  updatedAt: r['updated_at'] as string
})

const toGoal = (r: Row): Goal => ({
  id: r['id'] as string,
  title: r['title'] as string,
  kind: r['kind'] as Goal['kind'],
  targetSatang: r['target_satang'] as number | null,
  savedSatang: r['saved_satang'] as number,
  progress: r['progress'] as number,
  targetDate: r['target_date'] as string | null,
  note: r['note'] as string,
  isDone: bool(r['is_done']),
  doneDate: r['done_date'] as string | null,
  createdAt: r['created_at'] as string
})

const toHabit = (r: Row): Habit => ({
  id: r['id'] as string,
  name: r['name'] as string,
  icon: r['icon'] as string,
  sortOrder: r['sort_order'] as number
})

const toNote = (r: Row): Note => ({
  id: r['id'] as string,
  title: r['title'] as string,
  body: r['body'] as string,
  isPinned: bool(r['is_pinned']),
  createdAt: r['created_at'] as string,
  updatedAt: r['updated_at'] as string
})

/* ---------- tasks ---------- */

export function listTasks(db: Db): Task[] {
  return all(db, `SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY is_done, due_date IS NULL, due_date, created_at`).map(toTask)
}

export function getTask(db: Db, id: string): Task {
  const r = one(db, 'SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL', id)
  if (!r) throw new NotFoundError('ไม่พบงานนี้ อาจถูกลบไปแล้ว')
  return toTask(r)
}

export function createTask(db: Db, input: TaskInput): Task {
  const id = randomUUID()
  const now = nowIso()
  db.prepare(`INSERT INTO tasks (id, title, note, due_date, repeat, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id, input.title, input.note, input.dueDate, input.repeat, now, now
  )
  return getTask(db, id)
}

export function updateTask(db: Db, id: string, input: TaskInput): Task {
  getTask(db, id)
  db.prepare(`UPDATE tasks SET title = ?, note = ?, due_date = ?, repeat = ?, updated_at = ?, dirty = 1 WHERE id = ?`).run(
    input.title, input.note, input.dueDate, input.repeat, nowIso(), id
  )
  return getTask(db, id)
}

/**
 * Done / not done. A repeating task is never "finished": checking it moves it to its next date.
 * Returns the task as it is afterwards.
 */
export function setTaskDone(db: Db, id: string, done: boolean, today: string): Task {
  const t = getTask(db, id)
  const now = nowIso()
  if (done && t.repeat !== 'none') {
    db.prepare(`UPDATE tasks SET due_date = ?, done_date = ?, updated_at = ?, dirty = 1 WHERE id = ?`).run(
      advanceRepeating(t.dueDate, t.repeat, today), today, now, id
    )
  } else {
    db.prepare(`UPDATE tasks SET is_done = ?, done_date = ?, updated_at = ?, dirty = 1 WHERE id = ?`).run(done ? 1 : 0, done ? today : null, now, id)
  }
  return getTask(db, id)
}

/* ---------- journal (one page per day; same id on every device) ---------- */

export const journalId = (date: string): string => deterministicId(`journal:${date}`)

export function listJournal(db: Db, limit = 400): JournalEntry[] {
  return all(db, 'SELECT * FROM journal_entries WHERE deleted_at IS NULL ORDER BY entry_date DESC LIMIT ?', limit).map(toJournal)
}

export function saveJournal(db: Db, input: JournalInput): JournalEntry {
  const id = journalId(input.entryDate)
  const now = nowIso()
  db.prepare(
    `INSERT INTO journal_entries (id, entry_date, mood, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET mood = excluded.mood, body = excluded.body, deleted_at = NULL, updated_at = excluded.updated_at, dirty = 1`
  ).run(id, input.entryDate, input.mood, input.body, now, now)
  return toJournal(one(db, 'SELECT * FROM journal_entries WHERE id = ?', id) as Row)
}

/* ---------- goals ---------- */

export function listGoals(db: Db): Goal[] {
  return all(db, 'SELECT * FROM goals WHERE deleted_at IS NULL ORDER BY is_done, created_at').map(toGoal)
}

export function getGoal(db: Db, id: string): Goal {
  const r = one(db, 'SELECT * FROM goals WHERE id = ? AND deleted_at IS NULL', id)
  if (!r) throw new NotFoundError('ไม่พบเป้าหมายนี้')
  return toGoal(r)
}

export function createGoal(db: Db, input: GoalInput): Goal {
  const id = randomUUID()
  const now = nowIso()
  db.prepare(
    `INSERT INTO goals (id, title, kind, target_satang, saved_satang, progress, target_date, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.title, input.kind, input.targetSatang, input.savedSatang, input.progress, input.targetDate, input.note, now, now)
  return getGoal(db, id)
}

export function updateGoal(db: Db, id: string, input: GoalInput): Goal {
  getGoal(db, id)
  db.prepare(
    `UPDATE goals SET title = ?, kind = ?, target_satang = ?, saved_satang = ?, progress = ?, target_date = ?, note = ?,
       updated_at = ?, dirty = 1 WHERE id = ?`
  ).run(input.title, input.kind, input.targetSatang, input.savedSatang, input.progress, input.targetDate, input.note, nowIso(), id)
  return getGoal(db, id)
}

/** Put money towards a saving goal (negative = take some back). Reaching the target marks it achieved. */
export function addSaving(db: Db, id: string, deltaSatang: number, today: string): Goal {
  const g = getGoal(db, id)
  if (g.kind !== 'saving' || g.targetSatang === null) throw new NotFoundError('เป้าหมายนี้ไม่ใช่เป้าหมายการออม')
  const saved = Math.max(0, g.savedSatang + deltaSatang)
  const reached = saved >= g.targetSatang
  db.prepare(`UPDATE goals SET saved_satang = ?, is_done = ?, done_date = ?, updated_at = ?, dirty = 1 WHERE id = ?`).run(
    saved, reached ? 1 : 0, reached ? (g.doneDate ?? today) : null, nowIso(), id
  )
  return getGoal(db, id)
}

export function setGoalDone(db: Db, id: string, done: boolean, today: string): Goal {
  getGoal(db, id)
  db.prepare(`UPDATE goals SET is_done = ?, done_date = ?, updated_at = ?, dirty = 1 WHERE id = ?`).run(done ? 1 : 0, done ? today : null, nowIso(), id)
  return getGoal(db, id)
}

/* ---------- habits ---------- */

export function listHabits(db: Db): Habit[] {
  return all(db, 'SELECT * FROM habits WHERE deleted_at IS NULL ORDER BY sort_order, created_at').map(toHabit)
}

export function createHabit(db: Db, input: HabitInput): Habit {
  const id = randomUUID()
  const now = nowIso()
  const max = one(db, 'SELECT COALESCE(MAX(sort_order), -1) AS m FROM habits') as { m: number }
  db.prepare(`INSERT INTO habits (id, name, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id, input.name, input.icon, max.m + 1, now, now
  )
  return toHabit(one(db, 'SELECT * FROM habits WHERE id = ?', id) as Row)
}

export function updateHabit(db: Db, id: string, input: HabitInput): Habit {
  const r = db.prepare('UPDATE habits SET name = ?, icon = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL').run(
    input.name, input.icon, nowIso(), id
  )
  if (r.changes === 0) throw new NotFoundError('ไม่พบนิสัยนี้')
  return toHabit(one(db, 'SELECT * FROM habits WHERE id = ?', id) as Row)
}

export const habitCheckId = (habitId: string, date: string): string => deterministicId(`habit:${habitId}:${date}`)

/** Tick (or untick) a habit for a day. Same id for the same habit+day on every device. */
export function setHabitCheck(db: Db, habitId: string, date: string, checked: boolean): void {
  if (!one(db, 'SELECT 1 FROM habits WHERE id = ? AND deleted_at IS NULL', habitId)) throw new NotFoundError('ไม่พบนิสัยนี้')
  const id = habitCheckId(habitId, date)
  const now = nowIso()
  if (checked) {
    db.prepare(
      `INSERT INTO habit_checks (id, habit_id, check_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET deleted_at = NULL, updated_at = excluded.updated_at, dirty = 1`
    ).run(id, habitId, date, now, now)
  } else {
    db.prepare(`UPDATE habit_checks SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL`).run(now, now, id)
  }
}

export function habitViews(db: Db, today: string): HabitView[] {
  const checks = all(db, 'SELECT habit_id, check_date FROM habit_checks WHERE deleted_at IS NULL')
  const byHabit = new Map<string, Set<string>>()
  for (const c of checks) {
    const set = byHabit.get(c['habit_id'] as string) ?? new Set<string>()
    set.add(c['check_date'] as string)
    byHabit.set(c['habit_id'] as string, set)
  }
  return listHabits(db).map((h) => {
    const dates = byHabit.get(h.id) ?? new Set<string>()
    return {
      ...h,
      stats: dateStreaks(dates, today),
      recent: Array.from({ length: 14 }, (_, i): [string, boolean] => {
        const d = addDays(today, i - 13)
        return [d, dates.has(d)]
      })
    }
  })
}

/* ---------- notes ---------- */

export function listNotes(db: Db): Note[] {
  return all(db, 'SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY is_pinned DESC, updated_at DESC').map(toNote)
}

export function createNote(db: Db, input: NoteInput): Note {
  const id = randomUUID()
  const now = nowIso()
  db.prepare(`INSERT INTO notes (id, title, body, is_pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id, input.title, input.body, input.isPinned ? 1 : 0, now, now
  )
  return toNote(one(db, 'SELECT * FROM notes WHERE id = ?', id) as Row)
}

export function updateNote(db: Db, id: string, input: NoteInput): Note {
  const r = db.prepare('UPDATE notes SET title = ?, body = ?, is_pinned = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL').run(
    input.title, input.body, input.isPinned ? 1 : 0, nowIso(), id
  )
  if (r.changes === 0) throw new NotFoundError('ไม่พบโน้ตนี้')
  return toNote(one(db, 'SELECT * FROM notes WHERE id = ?', id) as Row)
}

/* ---------- generic soft delete / undo (all portal tables) ---------- */

export function removeRow(db: Db, table: PortalTable, id: string): void {
  const now = nowIso()
  inTransaction(db, () => {
    const r = db.prepare(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL`).run(now, now, id)
    if (r.changes === 0) throw new NotFoundError('ไม่พบรายการนี้ อาจถูกลบไปแล้ว')
    if (table === 'habits') {
      db.prepare(`UPDATE habit_checks SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE habit_id = ? AND deleted_at IS NULL`).run(now, now, id)
    }
    if (table === 'credit_cards') {
      for (const child of ['card_charges', 'card_plans']) {
        db.prepare(`UPDATE ${child} SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE card_id = ? AND deleted_at IS NULL`).run(now, now, id)
      }
    }
  })
}

export function restoreRow(db: Db, table: PortalTable, id: string): void {
  const now = nowIso()
  inTransaction(db, () => {
    const deletedAt = (one(db, `SELECT deleted_at FROM ${table} WHERE id = ?`, id) as { deleted_at: string | null } | undefined)?.deleted_at
    const r = db.prepare(`UPDATE ${table} SET deleted_at = NULL, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NOT NULL`).run(now, id)
    if (r.changes === 0 || !deletedAt) throw new NotFoundError('ไม่พบรายการที่จะกู้คืน')
    if (table === 'habits') {
      // Ticks that were removed together with the habit come back with it.
      db.prepare(`UPDATE habit_checks SET deleted_at = NULL, updated_at = ?, dirty = 1 WHERE habit_id = ? AND deleted_at = ?`).run(now, id, deletedAt)
    }
    if (table === 'credit_cards') {
      for (const child of ['card_charges', 'card_plans']) {
        db.prepare(`UPDATE ${child} SET deleted_at = NULL, updated_at = ?, dirty = 1 WHERE card_id = ? AND deleted_at = ?`).run(now, id, deletedAt)
      }
    }
  })
}

