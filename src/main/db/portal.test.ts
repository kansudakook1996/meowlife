import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runSync, type SyncLocal, type SyncRemote } from '@shared/syncEngine'
import type { SyncDoc, SyncTable } from '@shared/syncModel'
import { openDatabase, openMemoryDatabase, type Db } from './connection'
import { LATEST_SCHEMA_VERSION, getSchemaVersion, migrate } from './migrations'
import {
  addSaving,
  createGoal,
  createHabit,
  createNote,
  createTask,
  habitViews,
  journalId,
  listGoals,
  listHabits,
  listJournal,
  listNotes,
  listTasks,
  removeRow,
  restoreRow,
  saveJournal,
  setGoalDone,
  setHabitCheck,
  setTaskDone,
  updateNote,
  updateTask
} from './portalRepo'
import { activityInsights, calendarEvents, companionState, dueReminders, getSettings, markBadgesSeen, setSettings } from './portalQueries'
import { applyRemote, bindOwner, countDirty, getDirty, getState, markClean, setState } from './syncRepo'
import { createTransaction } from './transactionRepo'

const TODAY = '2026-10-29'
let db: Db

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-29T08:00:00.000Z'))
  db = openMemoryDatabase()
})
afterEach(() => vi.useRealTimers())

const task = (over: Partial<Parameters<typeof createTask>[1]> = {}) =>
  createTask(db, { title: 'ซื้อของ', note: '', dueDate: null, repeat: 'none', ...over })

describe('tasks', () => {
  it('creates, edits, completes and sorts open tasks by due date', () => {
    const a = task({ title: 'ไม่มีกำหนด' })
    const b = task({ title: 'พรุ่งนี้', dueDate: '2026-10-30' })
    const c = task({ title: 'วันนี้', dueDate: TODAY })
    expect(listTasks(db).map((t) => t.title)).toEqual(['วันนี้', 'พรุ่งนี้', 'ไม่มีกำหนด'])
    updateTask(db, a.id, { title: 'แก้ชื่อ', note: 'x', dueDate: null, repeat: 'none' })
    expect(setTaskDone(db, c.id, true, TODAY)).toMatchObject({ isDone: true, doneDate: TODAY })
    expect(listTasks(db).at(-1)?.title).toBe('วันนี้') // done tasks sink to the bottom
    expect(setTaskDone(db, c.id, false, TODAY)).toMatchObject({ isDone: false, doneDate: null })
    expect(b.dueDate).toBe('2026-10-30')
  })

  it('a repeating task moves to its next date instead of finishing', () => {
    const t = task({ title: 'รดน้ำต้นไม้', dueDate: '2026-10-25', repeat: 'weekly' })
    const done = setTaskDone(db, t.id, true, TODAY)
    expect(done).toMatchObject({ isDone: false, dueDate: '2026-11-01', doneDate: TODAY })
  })

  it('delete and undo', () => {
    const t = task()
    removeRow(db, 'tasks', t.id)
    expect(listTasks(db)).toHaveLength(0)
    expect(() => removeRow(db, 'tasks', t.id)).toThrow(/ไม่พบ/)
    restoreRow(db, 'tasks', t.id)
    expect(listTasks(db)).toHaveLength(1)
  })
})

describe('journal', () => {
  it('keeps one page per day and gives the same id on every device', () => {
    saveJournal(db, { entryDate: TODAY, mood: 3, body: 'เช้า' })
    const saved = saveJournal(db, { entryDate: TODAY, mood: 5, body: 'แก้ตอนเย็น' })
    expect(listJournal(db)).toHaveLength(1)
    expect(saved).toMatchObject({ mood: 5, body: 'แก้ตอนเย็น', id: journalId(TODAY) })
    expect(journalId(TODAY)).toBe(journalId(TODAY))
    expect(journalId('2026-10-30')).not.toBe(journalId(TODAY))
  })

  it('writing again after deleting brings the day back', () => {
    saveJournal(db, { entryDate: TODAY, mood: 3, body: 'a' })
    removeRow(db, 'journal_entries', journalId(TODAY))
    expect(listJournal(db)).toHaveLength(0)
    saveJournal(db, { entryDate: TODAY, mood: 4, body: 'b' })
    expect(listJournal(db)[0]).toMatchObject({ body: 'b' })
  })
})

describe('goals', () => {
  it('saving goals track money and finish when the target is reached', () => {
    const g = createGoal(db, { title: 'เที่ยวญี่ปุ่น', kind: 'saving', targetSatang: 5_000_000, savedSatang: 0, progress: 0, targetDate: '2027-03-01', note: '' })
    expect(addSaving(db, g.id, 2_000_000, TODAY)).toMatchObject({ savedSatang: 2_000_000, isDone: false })
    expect(addSaving(db, g.id, 3_500_000, TODAY)).toMatchObject({ savedSatang: 5_500_000, isDone: true, doneDate: TODAY })
    expect(addSaving(db, g.id, -9_000_000, TODAY)).toMatchObject({ savedSatang: 0, isDone: false }) // never below zero
  })

  it('life goals use manual progress and can be ticked off', () => {
    const g = createGoal(db, { title: 'เรียนภาษา', kind: 'life', targetSatang: null, savedSatang: 0, progress: 40, targetDate: null, note: '' })
    expect(() => addSaving(db, g.id, 100, TODAY)).toThrow(/ไม่ใช่เป้าหมายการออม/)
    expect(setGoalDone(db, g.id, true, TODAY).isDone).toBe(true)
    expect(listGoals(db)[0]?.progress).toBe(40)
  })
})

describe('habits', () => {
  it('ticks per day, computes streaks, and undoes', () => {
    const h = createHabit(db, { name: 'ดื่มน้ำ', icon: '💧' })
    for (const d of ['2026-10-27', '2026-10-28', '2026-10-29']) setHabitCheck(db, h.id, d, true)
    setHabitCheck(db, h.id, '2026-10-29', true) // ticking twice is harmless
    let view = habitViews(db, TODAY)[0]!
    expect(view.stats).toMatchObject({ currentStreak: 3, bestStreak: 3, doneToday: true, total: 3 })
    expect(view.recent.slice(-3).map((r) => r[1])).toEqual([true, true, true])
    setHabitCheck(db, h.id, '2026-10-29', false)
    view = habitViews(db, TODAY)[0]!
    expect(view.stats).toMatchObject({ currentStreak: 2, doneToday: false })
    expect(() => setHabitCheck(db, 'missing', TODAY, true)).toThrow(/ไม่พบ/)
  })

  it('deleting a habit hides its ticks and restoring brings them back', () => {
    const h = createHabit(db, { name: 'เดิน', icon: '🚶' })
    setHabitCheck(db, h.id, TODAY, true)
    removeRow(db, 'habits', h.id)
    expect(listHabits(db)).toHaveLength(0)
    restoreRow(db, 'habits', h.id)
    expect(habitViews(db, TODAY)[0]?.stats.total).toBe(1)
  })
})

describe('notes', () => {
  it('pins to the top and edits', () => {
    createNote(db, { title: 'เก่า', body: 'a', isPinned: false })
    const pinned = createNote(db, { title: 'ปักหมุด', body: 'b', isPinned: true })
    createNote(db, { title: 'ใหม่', body: 'c', isPinned: false })
    expect(listNotes(db)[0]?.title).toBe('ปักหมุด')
    expect(updateNote(db, pinned.id, { title: 'ปักหมุด 2', body: 'bb', isPinned: false }).title).toBe('ปักหมุด 2')
    expect(() => updateNote(db, 'nope', { title: 'x', body: '', isPinned: false })).toThrow(/ไม่พบ/)
  })
})

describe('settings', () => {
  it('has defaults, saves changes, and ignores damaged stored values', () => {
    expect(getSettings(db)).toMatchObject({ theme: 'fresh', dueSoonDays: 3, remindersEnabled: true, reminderHour: 9 })
    expect(setSettings(db, { theme: 'warm', dueSoonDays: 5 })).toMatchObject({ theme: 'warm', dueSoonDays: 5 })
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('dueSoonDays', '999'), ('theme', '{broken')").run()
    expect(getSettings(db)).toMatchObject({ theme: 'fresh', dueSoonDays: 3 })
  })
})

describe('calendar, reminders, insights, companion', () => {
  beforeEach(() => {
    task({ title: 'ส่งงาน', dueDate: TODAY })
    task({ title: 'งานเลยกำหนด', dueDate: '2026-10-27' })
    task({ title: 'งานอนาคต', dueDate: '2026-11-20' })
    createTransaction(db, { kind: 'expense', title: 'ค่าไฟ', amountSatang: 120000, categoryId: null, paymentMethodId: null, txnDate: '2026-10-20', dueDate: '2026-10-31', isPaid: false, note: '' }, TODAY)
    createTransaction(db, { kind: 'expense', title: 'ค่าเน็ต', amountSatang: 59900, categoryId: null, paymentMethodId: null, txnDate: '2026-10-01', dueDate: '2026-10-10', isPaid: false, note: '' }, TODAY)
    createTransaction(db, { kind: 'income', title: 'เงินเดือน', amountSatang: 2500000, categoryId: null, paymentMethodId: null, txnDate: '2026-10-25', dueDate: null, isPaid: true, note: '' }, TODAY)
    saveJournal(db, { entryDate: '2026-10-28', mood: 4, body: 'ok' })
    const h = createHabit(db, { name: 'ดื่มน้ำ', icon: '💧' })
    setHabitCheck(db, h.id, '2026-10-28', true)
    setHabitCheck(db, h.id, TODAY, true)
  })

  it('calendar lists bills on their due date and the rest on their own date', () => {
    const ev = calendarEvents(db, '2026-10-01', '2026-10-31', TODAY)
    const on = (date: string) => ev.filter((e) => e.date === date).map((e) => `${e.type}:${e.title}`)
    expect(on('2026-10-31')).toEqual(['bill:ค่าไฟ'])
    expect(on('2026-10-10')).toEqual(['bill:ค่าเน็ต'])
    expect(on('2026-10-25')).toEqual(['transaction:เงินเดือน'])
    expect(on('2026-10-28').sort()).toEqual(['habit:ทำนิสัยแล้ว 1 อย่าง', 'journal:บันทึกประจำวัน'])
    expect(on(TODAY).sort()).toContain('task:ส่งงาน')
    expect(calendarEvents(db, '2026-11-01', '2026-11-30', TODAY).map((e) => e.title)).toEqual(['งานอนาคต'])
  })

  it('reminders count today/overdue tasks and overdue/soon bills', () => {
    const r = dueReminders(db, TODAY, 3)
    expect(r.counts).toEqual({ overdueTasks: 1, todayTasks: 1, overdueBills: 1, soonBills: 1 })
    expect(r.tasks.map((t) => t.title)).toEqual(['งานเลยกำหนด', 'ส่งงาน'])
    expect(dueReminders(db, TODAY, 1).counts.soonBills).toBe(0) // due in 2 days is outside a 1-day window
  })

  it('activity insights summarise the month', () => {
    setTaskDone(db, listTasks(db).find((t) => t.title === 'ส่งงาน')!.id, true, TODAY)
    const a = activityInsights(db, '2026-10', TODAY)
    expect(a).toMatchObject({ tasksDone: 1, tasksOpen: 2, tasksOverdue: 1, journalDays: 1, averageMood: 4 })
    expect(a.habits[0]).toMatchObject({ name: 'ดื่มน้ำ', doneDays: 2, daysCounted: 29 })
    expect(activityInsights(db, '2026-11', TODAY).habits[0]).toMatchObject({ doneDays: 0, daysCounted: 0 })
  })

  it('companion: badges from real data, new ones announced once', () => {
    const first = companionState(db, TODAY)
    expect(first.badges.find((b) => b.id === 'first-record')?.earned).toBe(true)
    expect(first.newBadgeIds).toContain('first-record')
    expect(first.message.mood).toBe('worried') // an overdue bill exists, and the text stays kind
    markBadgesSeen(db, first.newBadgeIds)
    expect(companionState(db, TODAY).newBadgeIds).toEqual([])
    bindOwner(db, 'uid-1')
    expect(companionState(db, TODAY).newBadgeIds).toEqual(['synced'])
  })
})

/* ---------- the new tables sync like the old ones ---------- */

class FakeRemote implements SyncRemote {
  store = new Map<SyncTable, Map<string, SyncDoc>>()
  private t(table: SyncTable): Map<string, SyncDoc> {
    let m = this.store.get(table)
    if (!m) this.store.set(table, (m = new Map()))
    return m
  }
  async pull(table: SyncTable, since: string, limit: number): Promise<SyncDoc[]> {
    return [...this.t(table).values()].filter((d) => String(d['updatedAt']) >= since).sort((a, b) => String(a['updatedAt']).localeCompare(String(b['updatedAt']))).slice(0, limit).map((d) => ({ ...d }))
  }
  async push(table: SyncTable, docs: SyncDoc[]): Promise<void> {
    for (const d of docs) this.t(table).set(String(d['id']), { ...d })
  }
}
const localFor = (d: Db): SyncLocal => ({
  bind: async (uid) => bindOwner(d, uid),
  getCursor: async (t) => getState(d, `cursor:${t}`) ?? '',
  setCursor: async (t, v) => setState(d, `cursor:${t}`, v),
  getDirty: async (l, ex) => getDirty(d, l, ex),
  markClean: async (i) => markClean(d, i),
  applyRemote: async (t, docs) => applyRemote(d, t, docs)
})

describe('sync of Portal data between two devices', () => {
  it('tasks, journal, goals, habits (with ticks), notes all arrive; edits and deletes follow', async () => {
    const remote = new FakeRemote()
    const b = openMemoryDatabase()
    const t = task({ title: 'งานจาก A', dueDate: TODAY })
    saveJournal(db, { entryDate: TODAY, mood: 5, body: 'สุขสันต์' })
    createGoal(db, { title: 'ออมเงิน', kind: 'saving', targetSatang: 100000, savedSatang: 25000, progress: 0, targetDate: null, note: '' })
    const h = createHabit(db, { name: 'อ่านหนังสือ', icon: '📚' })
    setHabitCheck(db, h.id, TODAY, true)
    createNote(db, { title: 'โน้ต', body: 'เนื้อหา', isPinned: true })
    await runSync(localFor(db), remote, 'u')
    expect(countDirty(db)).toBe(0)

    const first = await runSync(localFor(b), remote, 'u')
    expect(first.skipped).toBe(0)
    expect(listTasks(b).map((x) => x.title)).toEqual(['งานจาก A'])
    expect(listJournal(b)[0]).toMatchObject({ body: 'สุขสันต์', mood: 5 })
    expect(listGoals(b)[0]).toMatchObject({ savedSatang: 25000 })
    expect(habitViews(b, TODAY)[0]?.stats.total).toBe(1)
    expect(listNotes(b)[0]).toMatchObject({ title: 'โน้ต', isPinned: true })

    vi.setSystemTime(new Date('2026-10-29T09:00:00.000Z'))
    setTaskDone(b, t.id, true, TODAY)
    setHabitCheck(b, h.id, TODAY, false)
    removeRow(b, 'notes', listNotes(b)[0]!.id)
    await runSync(localFor(b), remote, 'u')
    await runSync(localFor(db), remote, 'u')
    expect(listTasks(db)[0]?.isDone).toBe(true)
    expect(habitViews(db, TODAY)[0]?.stats.total).toBe(0)
    expect(listNotes(db)).toHaveLength(0)
  })

  it('the same journal day written on two devices is one document, newest edit wins', async () => {
    const remote = new FakeRemote()
    const b = openMemoryDatabase()
    saveJournal(db, { entryDate: TODAY, mood: 3, body: 'จาก A' })
    vi.setSystemTime(new Date('2026-10-29T09:00:00.000Z'))
    saveJournal(b, { entryDate: TODAY, mood: 4, body: 'จาก B (ใหม่กว่า)' })
    await runSync(localFor(db), remote, 'u')
    await runSync(localFor(b), remote, 'u')
    await runSync(localFor(db), remote, 'u')
    expect(remote.store.get('journal_entries')?.size).toBe(1)
    expect(listJournal(db)).toHaveLength(1)
    expect(listJournal(db)[0]?.body).toBe('จาก B (ใหม่กว่า)')
  })
})

describe('upgrade from an installed v2 database', () => {
  it('backs up, adds the Portal tables, keeps existing money data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'meowlife-v2-'))
    try {
      const file = join(dir, 'meowlife.db')
      const old = new DatabaseSync(file)
      migrate(old, 2)
      old.prepare(`INSERT INTO transactions (id, kind, title, amount_satang, txn_date, created_at, updated_at, dirty) VALUES ('t1', 'expense', 'เดิม', 500, '2026-10-01', 'x', 'x', 0)`).run()
      expect(getSchemaVersion(old)).toBe(2)
      old.close()

      const up = openDatabase(file)
      expect(getSchemaVersion(up)).toBe(LATEST_SCHEMA_VERSION)
      expect(up.prepare('SELECT title FROM transactions').get()).toEqual({ title: 'เดิม' })
      for (const t of ['tasks', 'journal_entries', 'goals', 'habits', 'habit_checks', 'notes', 'app_settings']) {
        expect(up.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()).toEqual({ n: 0 })
      }
      expect(readdirSync(join(dir, 'backups')).some((f) => f.startsWith('pre-migration-v2-'))).toBe(true)
      up.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
