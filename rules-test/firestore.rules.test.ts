import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { openMemoryDatabase } from '../src/main/db/connection'
import { DEFAULT_CATEGORIES } from '../src/main/db/defaults'
import { createCard, createCharge, createPlan } from '../src/main/db/cardRepo'
import { createRecurring, ensureRecurringForMonth } from '../src/main/db/recurringRepo'
import { getDirty } from '../src/main/db/syncRepo'
import { createGoal, createHabit, createNote, createTask, saveJournal, setHabitCheck } from '../src/main/db/portalRepo'
import { createTransaction } from '../src/main/db/transactionRepo'
import { SYNC_TABLES, type SyncDoc } from '../src/shared/syncModel'

/**
 * Runs against the Firestore EMULATOR with the real firestore.rules (`npm run test:rules`).
 * Proves (1) users cannot read or write each other's data, (2) the app's own documents are accepted,
 * (3) malformed or oversized documents are rejected.
 */
let env: RulesTestEnvironment

const ALICE = 'alice-uid'
const BOB = 'bob-uid'

/** Documents exactly as the app produces them for sync (real SQLite rows → rowToDoc). */
function appDocs(): Array<{ table: string; doc: SyncDoc }> {
  const db = openMemoryDatabase()
  createTransaction(
    db,
    {
      kind: 'expense',
      title: 'ค่าไฟ',
      amountSatang: 123456,
      categoryId: DEFAULT_CATEGORIES[0]!.id,
      paymentMethodId: null,
      txnDate: '2026-10-10',
      dueDate: '2026-10-25',
      isPaid: false,
      note: 'หมายเหตุ',
    },
    '2026-10-28'
  )
  createRecurring(db, {
    kind: 'expense',
    title: 'ค่าเช่า',
    amountSatang: 450000,
    categoryId: null,
    paymentMethodId: null,
    dayOfMonth: 5,
    startMonth: '2026-10',
    endMonth: null,
    note: '',
    isActive: true
  })
  ensureRecurringForMonth(db, '2026-10')
  createTask(db, { title: 'งาน', note: '', dueDate: '2026-10-30', repeat: 'weekly' })
  saveJournal(db, { entryDate: '2026-10-28', mood: 4, body: 'วันนี้ดี' })
  createGoal(db, { title: 'ออม', kind: 'saving', targetSatang: 100000, savedSatang: 5000, progress: 0, targetDate: null, note: '' })
  createGoal(db, { title: 'เรียน', kind: 'life', targetSatang: null, savedSatang: 0, progress: 30, targetDate: '2027-01-01', note: 'x' })
  const habit = createHabit(db, { name: 'ดื่มน้ำ', icon: '💧' })
  setHabitCheck(db, habit.id, '2026-10-28', true)
  createNote(db, { title: 'โน้ต', body: 'เนื้อหา', isPinned: true })
  const card = createCard(db, { name: 'KTC', issuer: 'กรุงไทย', statementDay: 25, dueDay: 10, limitSatang: 5000000, isActive: true })
  createCharge(db, { cardId: card.id, chargeDate: '2026-10-05', title: 'ข้าว', category: 'อาหาร', amountSatang: 25000, note: '' })
  createPlan(db, { cardId: card.id, title: 'ผ่อนโทรศัพท์', totalMonths: 10, monthlySatang: 150000, startMonth: '2026-08', note: '' })
  // Mark everything dirty so seeded categories / payment methods are included too.
  for (const t of ['categories', 'payment_methods']) db.exec(`UPDATE ${t} SET dirty = 1`)
  return getDirty(db, 500)
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'meowlife-rules-test',
    firestore: { rules: readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 }
  })
})
afterAll(async () => {
  await env.cleanup()
})

const validTx = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => {
  const d = appDocs().find((x) => x.table === 'transactions' && x.doc['title'] === 'ค่าไฟ')!.doc
  return { ...d, id, ...extra }
}

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', ALICE, 'transactions', 't1'), validTx('t1'))
  })
})

const as = (uid: string) => env.authenticatedContext(uid).firestore()

describe('owner access', () => {
  it("accepts every kind of document the app really produces (so sync works)", async () => {
    const docs = appDocs()
    expect(new Set(docs.map((d) => d.table))).toEqual(new Set(SYNC_TABLES)) // every synced table is covered
    const db = as(ALICE)
    for (const { table, doc: d } of docs) {
      await assertSucceeds(setDoc(doc(db, 'users', ALICE, table, String(d['id'])), d))
    }
  })

  it('lets the owner read, query, update and delete their own data', async () => {
    const db = as(ALICE)
    await assertSucceeds(getDoc(doc(db, 'users', ALICE, 'transactions', 't1')))
    await assertSucceeds(getDocs(query(collection(db, 'users', ALICE, 'transactions'), where('updatedAt', '>=', ''))))
    await assertSucceeds(setDoc(doc(db, 'users', ALICE, 'transactions', 't1'), validTx('t1', { title: 'แก้แล้ว', updatedAt: '2026-10-29T10:00:00.000Z' })))
    await assertSucceeds(setDoc(doc(db, 'users', ALICE, 'meta', 'connection'), { id: 'connection', updatedAt: '2026-10-28T10:00:00.000Z', kind: 'connection-test' }))
    await assertSucceeds(deleteDoc(doc(db, 'users', ALICE, 'transactions', 't1')))
  })
})

describe('other users and strangers', () => {
  it("blocks another signed-in user from reading, listing, writing or deleting someone else's data", async () => {
    const bob = as(BOB)
    await assertFails(getDoc(doc(bob, 'users', ALICE, 'transactions', 't1')))
    await assertFails(getDocs(collection(bob, 'users', ALICE, 'transactions')))
    await assertFails(setDoc(doc(bob, 'users', ALICE, 'transactions', 't9'), validTx('t9')))
    await assertFails(setDoc(doc(bob, 'users', ALICE, 'transactions', 't1'), validTx('t1', { title: 'ถูกแก้โดย Bob' })))
    await assertFails(deleteDoc(doc(bob, 'users', ALICE, 'transactions', 't1')))
  })

  it("Bob's own space still works for Bob", async () => {
    await assertSucceeds(setDoc(doc(as(BOB), 'users', BOB, 'transactions', 'b1'), validTx('b1')))
  })

  it('blocks everything when not signed in', async () => {
    const anon = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anon, 'users', ALICE, 'transactions', 't1')))
    await assertFails(getDocs(collection(anon, 'users', ALICE, 'transactions')))
    await assertFails(setDoc(doc(anon, 'users', ALICE, 'transactions', 't9'), validTx('t9')))
  })

  it('has no way in outside users/{uid}/<known collection>', async () => {
    const alice = as(ALICE)
    await assertFails(setDoc(doc(alice, 'public', 'x'), { a: 1 }))
    await assertFails(getDoc(doc(alice, 'users', ALICE)))
    await assertFails(setDoc(doc(alice, 'users', ALICE), { a: 1 }))
    await assertFails(setDoc(doc(alice, 'users', ALICE, 'secrets', 'x'), validTx('x')))
  })
})

describe('Credit card documents', () => {
  const put = (table: string, d: Record<string, unknown>): Promise<void> => setDoc(doc(as(ALICE), 'users', ALICE, table, String(d['id'])), d)
  const docOf = (table: string): Record<string, unknown> => appDocs().find((x) => x.table === table)!.doc

  it('accepts what the app writes and rejects bad values', async () => {
    await assertSucceeds(put('credit_cards', docOf('credit_cards')))
    await assertSucceeds(put('card_charges', docOf('card_charges')))
    await assertSucceeds(put('card_plans', docOf('card_plans')))
    await assertFails(put('credit_cards', { ...docOf('credit_cards'), statementDay: 32 }))
    await assertFails(put('card_charges', { ...docOf('card_charges'), amountSatang: 0 }))
    await assertFails(put('card_plans', { ...docOf('card_plans'), totalMonths: 1 }))
    await assertFails(put('card_plans', { ...docOf('card_plans'), extra: 'x' }))
  })

  it('keeps card data private', async () => {
    await assertSucceeds(put('credit_cards', docOf('credit_cards')))
    await assertFails(getDoc(doc(as(BOB), 'users', ALICE, 'credit_cards', String(docOf('credit_cards')['id']))))
  })
})

describe('Portal documents', () => {
  const taskDoc = (): Record<string, unknown> => appDocs().find((x) => x.table === 'tasks')!.doc
  const noteDoc = (): Record<string, unknown> => appDocs().find((x) => x.table === 'notes')!.doc
  const put = (table: string, d: Record<string, unknown>): Promise<void> => setDoc(doc(as(ALICE), 'users', ALICE, table, String(d['id'])), d)

  it('rejects bad values in tasks, notes and journal pages', async () => {
    await assertSucceeds(put('tasks', taskDoc()))
    await assertFails(put('tasks', { ...taskDoc(), repeat: 'yearly' }))
    await assertFails(put('tasks', { ...taskDoc(), title: 'ก'.repeat(81) }))
    await assertFails(put('notes', { ...noteDoc(), body: 'x'.repeat(5001) }))
    await assertSucceeds(put('notes', { ...noteDoc(), body: 'x'.repeat(5000) }))
    const j = appDocs().find((x) => x.table === 'journal_entries')!.doc
    await assertFails(put('journal_entries', { ...j, mood: 6 }))
    await assertFails(put('journal_entries', { ...j, extra: 1 }))
  })

  it("keeps Portal data private too", async () => {
    await assertSucceeds(put('notes', noteDoc()))
    const bob = as(BOB)
    await assertFails(getDoc(doc(bob, 'users', ALICE, 'notes', String(noteDoc()['id']))))
    await assertFails(setDoc(doc(bob, 'users', ALICE, 'tasks', String(taskDoc()['id'])), taskDoc()))
  })
})

describe('document shape', () => {
  const write = (id: string, data: Record<string, unknown>): Promise<void> => setDoc(doc(as(ALICE), 'users', ALICE, 'transactions', id), data)

  it('rejects an id that does not match the path, or a missing/odd updatedAt', async () => {
    await assertFails(write('t5', validTx('other')))
    await assertFails(write('t6', validTx('t6', { updatedAt: 12345 })))
    const withoutStamp = validTx('t7')
    delete withoutStamp['updatedAt']
    await assertFails(write('t7', withoutStamp))
  })

  it('rejects unknown fields and missing fields', async () => {
    await assertFails(write('t8', validTx('t8', { evil: 'x' })))
    const withoutNote = validTx('t9')
    delete withoutNote['note']
    await assertFails(write('t9', withoutNote))
  })

  it('rejects wrong types and out-of-range values', async () => {
    await assertFails(write('t10', validTx('t10', { amountSatang: '1000' })))
    await assertFails(write('t11', validTx('t11', { amountSatang: 0 })))
    await assertFails(write('t12', validTx('t12', { amountSatang: 1.5 })))
    await assertFails(write('t13', validTx('t13', { kind: 'transfer' })))
    await assertFails(write('t14', validTx('t14', { isPaid: true })))
  })

  it('bounds text size: long titles and notes are rejected (rules cannot measure bytes, so each field is capped)', async () => {
    await assertFails(write('t15', validTx('t15', { title: 'ก'.repeat(81) })))
    await assertFails(write('t16', validTx('t16', { note: 'x'.repeat(501) })))
    await assertFails(write('t17', validTx('t17', { title: '' })))
    await assertSucceeds(write('t18', validTx('t18', { title: 'ก'.repeat(80), note: 'x'.repeat(500) })))
  })
})
