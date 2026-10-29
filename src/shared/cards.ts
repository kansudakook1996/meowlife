import { z } from 'zod'
import { addMonths, diffDays, monthOf, monthsBetween, recurringDateFor } from './dates'
import { MAX_SATANG, sumSatang } from './money'
import { IsoDateSchema, MonthSchema } from './schemas'
import type { PaymentStatus } from './types'

/* ---------- entities ---------- */

export interface CreditCard {
  id: string
  name: string
  issuer: string
  /** Day of month the statement closes (1–31; short months use the last day). */
  statementDay: number
  /** Day of month the payment is due. If it is after the statement day it falls in the same month, otherwise the next. */
  dueDay: number
  limitSatang: number | null
  isActive: boolean
  sortOrder: number
}

export interface CardCharge {
  id: string
  cardId: string
  chargeDate: string
  title: string
  category: string
  amountSatang: number
  note: string
  /** The part of amountSatang that the partner pays (borrowed the card / splits the cost). 0 = all ours. */
  partnerSatang: number
  /** Statement month this charge is billed in (derived from chargeDate + the card's statement day). */
  billMonth: string
}

/** Instalment plan, e.g. a phone paid in 10 monthly instalments. */
export interface CardPlan {
  id: string
  cardId: string
  title: string
  totalMonths: number
  monthlySatang: number
  /** Statement month of instalment #1. */
  startMonth: string
  /** The partner's part of every monthly instalment. 0 = all ours. */
  partnerSatang: number
  note: string
}

/**
 * A charge that repeats every month on this card (electricity, a subscription …).
 * The app creates the month's charge itself, so nothing has to be typed twice.
 */
export interface CardRecurring {
  id: string
  cardId: string
  title: string
  category: string
  amountSatang: number
  /** Day of month the charge is made (short months use the last day). */
  dayOfMonth: number
  /** First calendar month it is charged. */
  startMonth: string
  /** Last calendar month it is charged (null = keeps going). */
  endMonth: string | null
  /** The partner's part of every monthly charge. 0 = all ours. */
  partnerSatang: number
  note: string
  isActive: boolean
}

/* ---------- inputs ---------- */

const Name = z.string().trim().min(1, { error: 'กรุณาใส่ชื่อ' }).max(40, { error: 'ชื่อยาวเกิน 40 ตัวอักษร' })
const Day = z.number().int().min(1, { error: 'วันที่ต้องอยู่ระหว่าง 1–31' }).max(31, { error: 'วันที่ต้องอยู่ระหว่าง 1–31' })
const Money = z.number().int().min(1, { error: 'จำนวนเงินต้องมากกว่า 0' }).max(MAX_SATANG, { error: 'จำนวนเงินมากเกินไป' })

export const CardInputSchema = z.strictObject({
  name: Name,
  issuer: z.string().trim().max(40),
  statementDay: Day,
  dueDay: Day,
  limitSatang: Money.nullable(),
  isActive: z.boolean()
})
export type CardInput = z.infer<typeof CardInputSchema>

const PartnerShare = z.number().int().min(0, { error: 'ส่วนของแฟนต้องไม่ติดลบ' }).max(MAX_SATANG, { error: 'จำนวนเงินมากเกินไป' })
const partnerWithin = { error: 'ส่วนของแฟนต้องไม่เกินยอดทั้งหมด', path: ['partnerSatang'] }

export const ChargeInputSchema = z.strictObject({
  cardId: z.uuid(),
  chargeDate: IsoDateSchema,
  title: z.string().trim().min(1, { error: 'กรุณาใส่ชื่อรายการ' }).max(80, { error: 'ชื่อรายการยาวเกิน 80 ตัวอักษร' }),
  category: z.string().trim().max(40),
  amountSatang: Money,
  partnerSatang: PartnerShare,
  note: z.string().trim().max(500)
}).refine((v) => v.partnerSatang <= v.amountSatang, partnerWithin)
export type ChargeInput = z.infer<typeof ChargeInputSchema>

export const PlanInputSchema = z.strictObject({
  cardId: z.uuid(),
  title: z.string().trim().min(1, { error: 'กรุณาใส่ชื่อรายการผ่อน' }).max(80, { error: 'ชื่อยาวเกิน 80 ตัวอักษร' }),
  totalMonths: z.number().int().min(2, { error: 'ผ่อนอย่างน้อย 2 งวด' }).max(120, { error: 'ผ่อนได้ไม่เกิน 120 งวด' }),
  monthlySatang: Money,
  startMonth: MonthSchema,
  partnerSatang: PartnerShare,
  note: z.string().trim().max(500)
}).refine((v) => v.partnerSatang <= v.monthlySatang, partnerWithin)
export type PlanInput = z.infer<typeof PlanInputSchema>

export const CardRecurringInputSchema = z
  .strictObject({
    cardId: z.uuid(),
    title: z.string().trim().min(1, { error: 'กรุณาใส่ชื่อรายการ' }).max(80, { error: 'ชื่อรายการยาวเกิน 80 ตัวอักษร' }),
    category: z.string().trim().max(40),
    amountSatang: Money,
    dayOfMonth: Day,
    startMonth: MonthSchema,
    endMonth: MonthSchema.nullable(),
    partnerSatang: PartnerShare,
    note: z.string().trim().max(500),
    isActive: z.boolean()
  })
  .refine((v) => v.endMonth === null || v.endMonth >= v.startMonth, { error: 'เดือนสิ้นสุดต้องไม่ก่อนเดือนเริ่ม', path: ['endMonth'] })
  .refine((v) => v.partnerSatang <= v.amountSatang, partnerWithin)
export type CardRecurringInput = z.infer<typeof CardRecurringInputSchema>

/** Suggestions shown as chips when adding a charge. */
export const CHARGE_CATEGORIES = ['อาหาร', 'ของใช้', 'เดินทาง', 'ช้อปปิ้ง', 'สมาชิก/บริการ', 'สุขภาพ', 'บันเทิง', 'อื่น ๆ'] as const

/* ---------- statement rules ---------- */

/** Which statement a purchase lands on: on/before the statement day → this month's, after → next month's. */
export function billMonthFor(chargeDate: string, statementDay: number): string {
  const month = monthOf(chargeDate)
  const closing = recurringDateFor(month, statementDay)
  return chargeDate <= closing ? month : addMonths(month, 1)
}

export function statementDateFor(billMonth: string, statementDay: number): string {
  return recurringDateFor(billMonth, statementDay)
}

/** Due date of the statement of `billMonth` (same month if the due day comes after the statement day, else next month). */
export function dueDateFor(billMonth: string, statementDay: number, dueDay: number): string {
  return recurringDateFor(dueDay > statementDay ? billMonth : addMonths(billMonth, 1), dueDay)
}

export type PlanState = 'upcoming' | 'active' | 'done'

export interface PlanLine {
  plan: CardPlan
  /** Instalment number in the statement month (may be <1 or >total when not active). */
  ordinal: number
  total: number
  state: PlanState
  /** Instalments still to come AFTER this statement. */
  remainingAfter: number
  /** Statement month of the last instalment. */
  endMonth: string
  amountThisMonth: number
  /** The partner's part of this month's instalment. */
  partnerThisMonth: number
  /** Money still to pay from this statement onward (including it). */
  remainingTotalSatang: number
}

export function planLine(plan: CardPlan, billMonth: string): PlanLine {
  const ordinal = monthsBetween(plan.startMonth, billMonth) + 1
  const state: PlanState = ordinal < 1 ? 'upcoming' : ordinal > plan.totalMonths ? 'done' : 'active'
  const remainingIncluding = state === 'active' ? plan.totalMonths - ordinal + 1 : state === 'upcoming' ? plan.totalMonths : 0
  return {
    plan,
    ordinal,
    total: plan.totalMonths,
    state,
    remainingAfter: state === 'active' ? plan.totalMonths - ordinal : state === 'upcoming' ? plan.totalMonths : 0,
    endMonth: addMonths(plan.startMonth, plan.totalMonths - 1),
    amountThisMonth: state === 'active' ? plan.monthlySatang : 0,
    partnerThisMonth: state === 'active' ? plan.partnerSatang : 0,
    remainingTotalSatang: plan.monthlySatang * remainingIncluding
  }
}

/** "งวดที่ 3/10 · เหลืออีก 7 งวด" / "งวดสุดท้าย" / "ผ่อนหมดแล้ว" / "เริ่มผ่อนเดือน …". */
export function planText(line: PlanLine, formatMonth: (m: string) => string): string {
  if (line.state === 'done') return 'ผ่อนหมดแล้ว'
  if (line.state === 'upcoming') return `ยังไม่เริ่ม (เริ่มงวดที่ 1 ${formatMonth(line.plan.startMonth)})`
  if (line.remainingAfter === 0) return `งวดสุดท้าย ${line.ordinal}/${line.total}`
  return `งวดที่ ${line.ordinal}/${line.total} · เหลืออีก ${line.remainingAfter} งวด · ผ่อนหมด${formatMonth(line.endMonth)}`
}

export interface CardStatement {
  card: CreditCard
  month: string
  /** The card's monthly repeating charges (all of them, for the management list). */
  recurring: CardRecurring[]
  statementDate: string
  dueDate: string
  charges: CardCharge[]
  /** Instalments that bill in this month. */
  installments: PlanLine[]
  /** Every plan of the card (including finished and upcoming) for the management list. */
  allPlans: PlanLine[]
  chargesTotal: number
  installmentsTotal: number
  /** Everything the bank bills for this statement. */
  total: number
  /** The partner's part of it (borrowed card / split costs). */
  partnerTotal: number
  /** Our own part = total - partnerTotal. This is what goes into the ledger as an expense. */
  mineTotal: number
  /** Money still to come from instalments after this statement. */
  futureInstallmentsTotal: number
}

export function buildStatement(
  card: CreditCard,
  charges: CardCharge[],
  plans: CardPlan[],
  month: string,
  recurring: CardRecurring[] = []
): CardStatement {
  const mine = charges.filter((c) => c.cardId === card.id && c.billMonth === month).sort((a, b) => a.chargeDate.localeCompare(b.chargeDate))
  const lines = plans.filter((p) => p.cardId === card.id).map((p) => planLine(p, month))
  const installments = lines.filter((l) => l.state === 'active')
  const chargesTotal = sumSatang(mine.map((c) => c.amountSatang))
  const installmentsTotal = sumSatang(installments.map((l) => l.amountThisMonth))
  const partnerTotal = sumSatang(mine.map((c) => c.partnerSatang)) + sumSatang(installments.map((l) => l.partnerThisMonth))
  return {
    card,
    month,
    recurring: recurring.filter((r) => r.cardId === card.id),
    statementDate: statementDateFor(month, card.statementDay),
    dueDate: dueDateFor(month, card.statementDay, card.dueDay),
    charges: mine,
    installments,
    allPlans: lines,
    chargesTotal,
    installmentsTotal,
    total: chargesTotal + installmentsTotal,
    partnerTotal,
    mineTotal: chargesTotal + installmentsTotal - partnerTotal,
    futureInstallmentsTotal: sumSatang(lines.map((l) => l.plan.monthlySatang * l.remainingAfter))
  }
}

/** Link between a statement and the bill the user created in the ledger. */
export interface CardBillInfo {
  transactionId: string
  isPaid: boolean
  amountSatang: number
  status: PaymentStatus
}

/** The partner's repayment for a statement (recorded when they transfer the money back). */
export interface PartnerPaymentInfo {
  amountSatang: number
  paidDate: string
}

export interface CardStatementView extends CardStatement {
  bill: CardBillInfo | null
  /** null = the partner has not paid this statement's part yet. */
  partnerPayment: PartnerPaymentInfo | null
  /** Days until the due date (negative = past) — null once the bill is paid. */
  daysToDue: number | null
}

export interface CardsOverview {
  month: string
  cards: CardStatementView[]
  totalDue: number
  /** Our own part of every statement / the partner's part. */
  totalMine: number
  totalPartner: number
  chargesTotal: number
  installmentsTotal: number
}

export function overviewOf(month: string, cards: Array<Omit<CardStatementView, 'daysToDue'>>, today: string): CardsOverview {
  const views: CardStatementView[] = cards.map((c) => ({
    ...c,
    daysToDue: c.bill?.isPaid ? null : diffDays(today, c.dueDate)
  }))
  return {
    month,
    cards: views,
    totalDue: sumSatang(views.map((v) => v.total)),
    totalMine: sumSatang(views.map((v) => v.mineTotal)),
    totalPartner: sumSatang(views.map((v) => v.partnerTotal)),
    chargesTotal: sumSatang(views.map((v) => v.chargesTotal)),
    installmentsTotal: sumSatang(views.map((v) => v.installmentsTotal))
  }
}

/** Title of the ledger bill created for a statement. */
export function billTitle(cardName: string, month: string, formatMonth: (m: string) => string): string {
  return `ชำระบัตร ${cardName} (${formatMonth(month)})`
}

/** Result of putting a statement into the ledger as a bill. */
export type CreateBillResult = { action: 'created' | 'updated' | 'paid'; transactionId: string; amountSatang: number }
