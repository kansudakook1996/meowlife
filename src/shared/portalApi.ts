import type { CalendarEvent } from './calendar'
import type {
  AppSettings,
  Badge,
  Goal,
  GoalInput,
  Habit,
  HabitInput,
  JournalEntry,
  JournalInput,
  Note,
  NoteInput,
  SettingsPatch,
  StreakStats,
  Task,
  TaskInput
} from './portalModel'
import type { ReminderCounts } from './reminders'
import type { IpcResult, TransactionView } from './types'

type R<T> = Promise<IpcResult<T>>

export interface HabitView extends Habit {
  stats: StreakStats
  /** Last 14 days, oldest first: [date, done]. */
  recent: Array<[string, boolean]>
}

export interface DueReminders {
  tasks: Task[]
  bills: TransactionView[]
  counts: ReminderCounts
}

export interface ActivityInsights {
  month: string
  tasksDone: number
  tasksOpen: number
  tasksOverdue: number
  journalDays: number
  averageMood: number | null
  habits: Array<{ id: string; name: string; icon: string; doneDays: number; daysCounted: number }>
  goals: Array<{ id: string; title: string; kind: Goal['kind']; percent: number; isDone: boolean }>
}

export interface CompanionState {
  badges: Badge[]
  message: { mood: 'happy' | 'sleepy' | 'cheer' | 'worried'; text: string }
  /** Earned badges the user has not been told about yet. */
  newBadgeIds: string[]
}

/** Channel name of one Portal call, e.g. portalChannel('tasks', 'create') → "portal:tasks:create". */
export const portalChannel = (module: string, action: string): string => `portal:${module}:${action}`

/** The `window.meow.portal` part of the bridge. */
export interface PortalBridge {
  tasks: {
    list(): R<Task[]>
    create(input: TaskInput): R<Task>
    update(id: string, input: TaskInput): R<Task>
    setDone(id: string, done: boolean): R<Task>
    remove(id: string): R<void>
    restore(id: string): R<void>
  }
  journal: {
    list(): R<JournalEntry[]>
    save(input: JournalInput): R<JournalEntry>
    remove(id: string): R<void>
    restore(id: string): R<void>
  }
  goals: {
    list(): R<Goal[]>
    create(input: GoalInput): R<Goal>
    update(id: string, input: GoalInput): R<Goal>
    addSaving(id: string, deltaSatang: number): R<Goal>
    setDone(id: string, done: boolean): R<Goal>
    remove(id: string): R<void>
    restore(id: string): R<void>
  }
  habits: {
    list(): R<HabitView[]>
    create(input: HabitInput): R<Habit>
    update(id: string, input: HabitInput): R<Habit>
    check(habitId: string, date: string, checked: boolean): R<void>
    remove(id: string): R<void>
    restore(id: string): R<void>
  }
  notes: {
    list(): R<Note[]>
    create(input: NoteInput): R<Note>
    update(id: string, input: NoteInput): R<Note>
    remove(id: string): R<void>
    restore(id: string): R<void>
  }
  calendar: { range(from: string, to: string): R<CalendarEvent[]> }
  reminders: { due(): R<DueReminders> }
  insights: { activity(month: string): R<ActivityInsights> }
  companion: { state(): R<CompanionState>; markSeen(ids: string[]): R<void> }
  settings: { get(): R<AppSettings>; set(patch: SettingsPatch): R<AppSettings> }
}
