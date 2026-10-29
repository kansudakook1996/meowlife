import { z } from 'zod'
import { todayIso } from '@shared/dates'
import { portalChannel } from '@shared/portalApi'
import {
  GoalInputSchema,
  HabitInputSchema,
  JournalInputSchema,
  NoteInputSchema,
  SettingsPatchSchema,
  TaskInputSchema,
  type AppSettings
} from '@shared/portalModel'
import { IdSchema, IsoDateSchema, MonthSchema } from '@shared/schemas'
import { MAX_SATANG } from '@shared/money'
import { CardInputSchema, ChargeInputSchema, PlanInputSchema } from '@shared/cards'
import { cardsOverview, createCard, createCardBill, createCharge, createPlan, listCards, updateCard, updateCharge, updatePlan } from '../db/cardRepo'
import type { Db } from '../db/connection'
import {
  activityInsights,
  calendarEvents,
  companionState,
  dueReminders,
  getSettings,
  markBadgesSeen,
  setSettings
} from '../db/portalQueries'
import {
  addSaving,
  createGoal,
  createHabit,
  createNote,
  createTask,
  habitViews,
  listGoals,
  listJournal,
  listNotes,
  listTasks,
  removeRow,
  restoreRow,
  saveJournal,
  setGoalDone,
  setHabitCheck,
  setTaskDone,
  updateGoal,
  updateHabit,
  updateNote,
  updateTask
} from '../db/portalRepo'
import { handle } from './handle'

const NoInput = z.undefined()
const Update = <S extends z.ZodType>(input: S) => z.strictObject({ id: IdSchema, input })
const Done = z.strictObject({ id: IdSchema, done: z.boolean() })

/** All Personal Portal channels. `onSettings` lets the app react to a changed setting (e.g. reminders). */
export function registerPortalHandlers(db: Db, onSettings: (s: AppSettings) => void): void {
  const today = (): string => todayIso()
  const c = portalChannel

  const crud = (module: 'tasks' | 'journal_entries' | 'goals' | 'habits' | 'notes', name: string): void => {
    handle(c(name, 'remove'), IdSchema, (id) => removeRow(db, module, id))
    handle(c(name, 'restore'), IdSchema, (id) => restoreRow(db, module, id))
  }

  handle(c('tasks', 'list'), NoInput, () => listTasks(db))
  handle(c('tasks', 'create'), TaskInputSchema, (i) => createTask(db, i))
  handle(c('tasks', 'update'), Update(TaskInputSchema), ({ id, input }) => updateTask(db, id, input))
  handle(c('tasks', 'setDone'), Done, ({ id, done }) => setTaskDone(db, id, done, today()))
  crud('tasks', 'tasks')

  handle(c('journal', 'list'), NoInput, () => listJournal(db))
  handle(c('journal', 'save'), JournalInputSchema, (i) => saveJournal(db, i))
  crud('journal_entries', 'journal')

  handle(c('goals', 'list'), NoInput, () => listGoals(db))
  handle(c('goals', 'create'), GoalInputSchema, (i) => createGoal(db, i))
  handle(c('goals', 'update'), Update(GoalInputSchema), ({ id, input }) => updateGoal(db, id, input))
  handle(
    c('goals', 'addSaving'),
    z.strictObject({ id: IdSchema, deltaSatang: z.number().int().min(-MAX_SATANG).max(MAX_SATANG) }),
    ({ id, deltaSatang }) => addSaving(db, id, deltaSatang, today())
  )
  handle(c('goals', 'setDone'), Done, ({ id, done }) => setGoalDone(db, id, done, today()))
  crud('goals', 'goals')

  handle(c('habits', 'list'), NoInput, () => habitViews(db, today()))
  handle(c('habits', 'create'), HabitInputSchema, (i) => createHabit(db, i))
  handle(c('habits', 'update'), Update(HabitInputSchema), ({ id, input }) => updateHabit(db, id, input))
  handle(
    c('habits', 'check'),
    z.strictObject({ habitId: IdSchema, date: IsoDateSchema, checked: z.boolean() }),
    ({ habitId, date, checked }) => setHabitCheck(db, habitId, date, checked)
  )
  crud('habits', 'habits')

  handle(c('notes', 'list'), NoInput, () => listNotes(db))
  handle(c('notes', 'create'), NoteInputSchema, (i) => createNote(db, i))
  handle(c('notes', 'update'), Update(NoteInputSchema), ({ id, input }) => updateNote(db, id, input))
  crud('notes', 'notes')

  handle(c('cards', 'list'), NoInput, () => listCards(db))
  handle(c('cards', 'create'), CardInputSchema, (i) => createCard(db, i))
  handle(c('cards', 'update'), Update(CardInputSchema), ({ id, input }) => updateCard(db, id, input))
  handle(c('cards', 'remove'), IdSchema, (id) => removeRow(db, 'credit_cards', id))
  handle(c('cards', 'restore'), IdSchema, (id) => restoreRow(db, 'credit_cards', id))
  handle(c('cards', 'overview'), MonthSchema, (month) => cardsOverview(db, month, today()))
  handle(c('cards', 'charges.create'), ChargeInputSchema, (i) => createCharge(db, i))
  handle(c('cards', 'charges.update'), Update(ChargeInputSchema), ({ id, input }) => updateCharge(db, id, input))
  handle(c('cards', 'charges.remove'), IdSchema, (id) => removeRow(db, 'card_charges', id))
  handle(c('cards', 'charges.restore'), IdSchema, (id) => restoreRow(db, 'card_charges', id))
  handle(c('cards', 'plans.create'), PlanInputSchema, (i) => createPlan(db, i))
  handle(c('cards', 'plans.update'), Update(PlanInputSchema), ({ id, input }) => updatePlan(db, id, input))
  handle(c('cards', 'plans.remove'), IdSchema, (id) => removeRow(db, 'card_plans', id))
  handle(c('cards', 'plans.restore'), IdSchema, (id) => restoreRow(db, 'card_plans', id))
  handle(c('cards', 'createBill'), z.strictObject({ cardId: IdSchema, month: MonthSchema }), ({ cardId, month }) => createCardBill(db, cardId, month, today()))
  handle(c('calendar', 'range'), z.strictObject({ from: IsoDateSchema, to: IsoDateSchema }), ({ from, to }) =>
    calendarEvents(db, from, to, today())
  )
  handle(c('reminders', 'due'), NoInput, () => dueReminders(db, today(), getSettings(db).dueSoonDays))
  handle(c('insights', 'activity'), MonthSchema, (month) => activityInsights(db, month, today()))
  handle(c('companion', 'state'), NoInput, () => companionState(db, today()))
  handle(c('companion', 'markSeen'), z.array(z.string().max(40)).max(50), (ids) => markBadgesSeen(db, ids))

  handle(c('settings', 'get'), NoInput, () => getSettings(db))
  handle(c('settings', 'set'), SettingsPatchSchema, (patch) => {
    const next = setSettings(db, patch)
    onSettings(next)
    return next
  })
}
