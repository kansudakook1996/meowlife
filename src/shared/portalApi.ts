import type { CalendarEvent } from './calendar'
import type { CardCharge, CardInput, CardPlan, CardRecurring, CardRecurringInput, CardsOverview, PartnerPaymentInfo, SetCardPaidResult, ChargeInput, CreateBillResult, CreditCard, PlanInput } from './cards'
import type { CardAnalytics } from './analytics'
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
  ledger: {
    /** Save the importance order of ledger items (most important first). */
    reorder(ids: string[]): R<number>
  }
  cards: {
    list(): R<CreditCard[]>
    /** Save the order of the cards (first = shown first). */
    reorder(ids: string[]): R<number>
    create(input: CardInput): R<CreditCard>
    update(id: string, input: CardInput): R<CreditCard>
    remove(id: string): R<void>
    restore(id: string): R<void>
    /** Every active card's statement for a statement month, with totals and the linked ledger bill. */
    overview(month: string): R<CardsOverview>
    charges: {
      create(input: ChargeInput): R<CardCharge>
      update(id: string, input: ChargeInput): R<CardCharge>
      remove(id: string): R<void>
      restore(id: string): R<void>
    }
    plans: {
      create(input: PlanInput): R<CardPlan>
      update(id: string, input: PlanInput): R<CardPlan>
      remove(id: string): R<void>
      restore(id: string): R<void>
    }
    recurring: {
      create(input: CardRecurringInput): R<CardRecurring>
      update(id: string, input: CardRecurringInput): R<CardRecurring>
      remove(id: string): R<void>
      restore(id: string): R<void>
    }
    /** Record (paid = true) or undo that the partner has repaid their part of a statement. */
    partnerPaid(cardId: string, month: string, paid: boolean): R<PartnerPaymentInfo | null>
    /** Mark the statement's bill paid/unpaid in the ledger (creating the bill first if needed). */
    setPaid(cardId: string, month: string, paid: boolean): R<SetCardPaidResult>
    /** Spending split by category (partner's share removed) and the partner's transfers by month. */
    analytics(month: string): R<CardAnalytics>
    /** Create/update the unpaid ledger bill of a statement (a paid bill is left as it is). */
    createBill(cardId: string, month: string): R<CreateBillResult>
  }
  calendar: { range(from: string, to: string): R<CalendarEvent[]> }
  reminders: { due(): R<DueReminders> }
  insights: { activity(month: string): R<ActivityInsights> }
  companion: { state(): R<CompanionState>; markSeen(ids: string[]): R<void> }
  settings: { get(): R<AppSettings>; set(patch: SettingsPatch): R<AppSettings> }
}
