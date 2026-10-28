import { describe, expect, it } from 'vitest'
import { computeStatus, statusLabel } from './status'

const today = '2026-10-28'

describe('computeStatus', () => {
  it('paid wins over any due date', () => {
    expect(computeStatus({ isPaid: true, dueDate: '2026-01-01' }, today)).toEqual({ status: 'paid', daysUntilDue: null })
  })

  it('unpaid without due date', () => {
    expect(computeStatus({ isPaid: false, dueDate: null }, today).status).toBe('unpaid')
  })

  it('overdue when due date has passed', () => {
    expect(computeStatus({ isPaid: false, dueDate: '2026-10-27' }, today)).toEqual({ status: 'overdue', daysUntilDue: -1 })
  })

  it('due soon from today up to 3 days ahead', () => {
    expect(computeStatus({ isPaid: false, dueDate: '2026-10-28' }, today)).toEqual({ status: 'due_soon', daysUntilDue: 0 })
    expect(computeStatus({ isPaid: false, dueDate: '2026-10-31' }, today)).toEqual({ status: 'due_soon', daysUntilDue: 3 })
    expect(computeStatus({ isPaid: false, dueDate: '2026-11-01' }, today)).toEqual({ status: 'unpaid', daysUntilDue: 4 })
  })

  it('works across a year boundary', () => {
    expect(computeStatus({ isPaid: false, dueDate: '2027-01-01' }, '2026-12-30').status).toBe('due_soon')
  })
})

describe('statusLabel', () => {
  it('uses kind-specific Thai wording', () => {
    expect(statusLabel('expense', { status: 'paid', daysUntilDue: null })).toBe('จ่ายแล้ว')
    expect(statusLabel('income', { status: 'paid', daysUntilDue: null })).toBe('ได้รับแล้ว')
    expect(statusLabel('income', { status: 'unpaid', daysUntilDue: null })).toBe('ยังไม่ได้รับ')
    expect(statusLabel('expense', { status: 'due_soon', daysUntilDue: 0 })).toBe('ครบกำหนดวันนี้')
    expect(statusLabel('expense', { status: 'due_soon', daysUntilDue: 2 })).toBe('อีก 2 วันครบกำหนด')
    expect(statusLabel('expense', { status: 'overdue', daysUntilDue: -5 })).toBe('เกินกำหนด 5 วัน')
  })
})
