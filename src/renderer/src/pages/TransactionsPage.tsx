import { useEffect, useMemo, useRef, useState } from 'react'
import { formatThaiDate, formatThaiMonth } from '@shared/dates'
import { formatSatang, sumSatang } from '@shared/money'
import type { StatusFilter } from '@shared/schemas'
import type { TransactionView } from '@shared/types'
import { EmptyState } from '../components/EmptyState'
import { MonthPicker } from '../components/MonthPicker'
import { TransactionRow } from '../components/TransactionRow'
import { errorMessage } from '../lib/api'
import { autoScrollNear } from '../lib/dragScroll'
import { meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useLoad } from '../lib/useLoad'

type KindFilter = 'all' | 'income' | 'expense'
type SortMode = 'date' | 'priority'
const SORT_KEY = 'meowlife.ledgerSort'

function loadSortMode(): SortMode {
  try {
    return localStorage.getItem(SORT_KEY) === 'priority' ? 'priority' : 'date'
  } catch {
    return 'date'
  }
}

/** Importance order: the user's own order first (0 = most important), items never ordered after, newest first. */
function byPriority(items: TransactionView[]): TransactionView[] {
  return [...items].sort((a, b) => (a.priorityOrder ?? Number.MAX_SAFE_INTEGER) - (b.priorityOrder ?? Number.MAX_SAFE_INTEGER) || b.txnDate.localeCompare(a.txnDate) || b.createdAt.localeCompare(a.createdAt))
}

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'ทุกสถานะ' },
  { value: 'not_paid', label: 'ยังไม่จ่าย/ยังไม่ได้รับ (ทั้งหมด)' },
  { value: 'overdue', label: '! เกินกำหนด' },
  { value: 'due_soon', label: '⏰ ใกล้ครบกำหนด' },
  { value: 'paid', label: '✓ จ่ายแล้ว/ได้รับแล้ว' }
]

function groupByDate(items: TransactionView[]): Array<[string, TransactionView[]]> {
  const groups = new Map<string, TransactionView[]>()
  for (const t of items) {
    const list = groups.get(t.txnDate) ?? []
    list.push(t)
    groups.set(t.txnDate, list)
  }
  return [...groups.entries()]
}

export function TransactionsPage({ searchFocusSignal, initialSearch = '' }: { searchFocusSignal: number; initialSearch?: string }): React.JSX.Element {
  const { month, setMonth, dataVersion, openEditor, categories, refresh, toast } = usePortal()
  const [sortMode, setSortModeState] = useState<SortMode>(loadSortMode)
  const [dragId, setDragId] = useState<string | null>(null)
  /** The order shown while a row is being dragged (the saved order only changes when it is dropped). */
  const [liveIds, setLiveIds] = useState<string[] | null>(null)
  const [kind, setKind] = useState<KindFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [categoryId, setCategoryId] = useState('')
  const [search, setSearch] = useState(initialSearch)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchFocusSignal > 0) searchRef.current?.focus()
  }, [searchFocusSignal])

  const query = { month, kind, status, search: search.trim(), categoryId: categoryId || null }
  const { data, error } = useLoad(`${JSON.stringify(query)}:${dataVersion}`, () => unwrap(meow().transactions.list(query)))

  const setSortMode = (mode: SortMode): void => {
    setSortModeState(mode)
    try {
      localStorage.setItem(SORT_KEY, mode)
    } catch {
      /* remembering the choice is a convenience only */
    }
  }
  const saved = useMemo(() => (data ? byPriority(data) : []), [data])
  const ordered = useMemo(() => {
    if (!liveIds) return saved
    const byId = new Map(saved.map((t) => [t.id, t]))
    const live = liveIds.map((id) => byId.get(id)).filter((t): t is TransactionView => t !== undefined)
    return live.length === saved.length ? live : saved
  }, [saved, liveIds])

  const filtered = kind !== 'all' || status !== 'all' || categoryId !== '' || search.trim() !== ''
  const income = data ? sumSatang(data.filter((t) => t.kind === 'income').map((t) => t.amountSatang)) : 0
  const expense = data ? sumSatang(data.filter((t) => t.kind === 'expense').map((t) => t.amountSatang)) : 0

  const canReorder = sortMode === 'priority' && !filtered
  const saveOrder = async (ids: string[]): Promise<void> => {
    try {
      await unwrap(meow().portal.ledger.reorder(ids))
      refresh()
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    }
  }
  const moveBy = (id: string, delta: number): void => {
    const ids = ordered.map((t) => t.id)
    const from = ids.indexOf(id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to]!, ids[from]!]
    void saveOrder(ids)
  }
  /** Click a row and drag it up or down; the rows shuffle live and the new order is saved when you let go. */
  const startDrag = (e: React.PointerEvent<HTMLLIElement>, id: string): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, select, textarea')) return
    e.preventDefault()
    const start = ordered.map((t) => t.id)
    let current = start
    setDragId(id)
    setLiveIds(start)
    const onMove = (ev: PointerEvent): void => {
      const hit = document.elementFromPoint(ev.clientX, ev.clientY)
      autoScrollNear(hit, ev.clientY)
      const row = hit?.closest<HTMLElement>('li[data-txid]')
      const over = row?.dataset['txid']
      if (!row || !over || over === id) return
      const from = current.indexOf(id)
      const to = current.indexOf(over)
      const rect = row.getBoundingClientRect()
      // swap only once the pointer has crossed the middle of the row it is over, so the rows do not flicker
      if ((to > from && ev.clientY < rect.top + rect.height / 2) || (to < from && ev.clientY > rect.top + rect.height / 2)) return
      const next = current.filter((x) => x !== id)
      next.splice(to, 0, id)
      current = next
      setLiveIds(next)
    }
    const onEnd = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      setDragId(null)
      if (current.some((x, i) => x !== start[i])) void saveOrder(current).finally(() => setLiveIds(null))
      else setLiveIds(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }
  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>รายการรับ-จ่าย</h1>
          <p className="muted">{formatThaiMonth(month)}</p>
        </div>
        <div className="toolbar">
          <MonthPicker month={month} onChange={setMonth} />
          <button type="button" className="btn btn-primary" title="Ctrl+N" onClick={() => openEditor({ mode: 'new', kind: kind === 'income' ? 'income' : 'expense' })}>
            ＋ เพิ่มรายการ
          </button>
        </div>
      </header>

      <section className="toolbar" aria-label="ตัวกรอง">
        <div className="segmented" role="group" aria-label="ประเภท">
          {(
            [
              ['all', 'ทั้งหมด'],
              ['income', 'รายรับ'],
              ['expense', 'รายจ่าย']
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="การเรียงลำดับ">
          <button type="button" aria-pressed={sortMode === 'date'} onClick={() => setSortMode('date')}>เรียงตามวันที่</button>
          <button type="button" aria-pressed={sortMode === 'priority'} onClick={() => setSortMode('priority')}>เรียงตามความสำคัญ</button>
        </div>
        <label className="visually-hidden" htmlFor="filter-status">
          สถานะ
        </label>
        <select id="filter-status" className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="visually-hidden" htmlFor="filter-category">
          หมวดหมู่
        </label>
        <select id="filter-category" className="input" style={{ width: 'auto' }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">ทุกหมวด</option>
          {categories
            .filter((c) => kind === 'all' || c.kind === kind)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
                {kind === 'all' ? (c.kind === 'income' ? ' (รับ)' : ' (จ่าย)') : ''}
              </option>
            ))}
        </select>
        <label className="visually-hidden" htmlFor="filter-search">
          ค้นหา
        </label>
        <input
          id="filter-search"
          ref={searchRef}
          className="input"
          style={{ flex: '1 1 200px', width: 'auto' }}
          type="search"
          placeholder="🔍 ค้นหาชื่อ หมวด หรือหมายเหตุ (Ctrl+F)"
          value={search}
          maxLength={100}
          onChange={(e) => setSearch(e.target.value)}
        />
      </section>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {!data && !error && <div className="loading">กำลังโหลด…</div>}

      {data && data.length > 0 && (
        <p className="muted small" aria-live="polite">
          {data.length} รายการ · รายรับ {formatSatang(income)} · รายจ่าย {formatSatang(expense)}
        </p>
      )}

      {data && data.length === 0 && (
        <div className="card">
          {filtered ? (
            <EmptyState
              title="ไม่พบรายการที่ตรงกับตัวกรอง"
              hint="ลองเปลี่ยนคำค้นหาหรือตัวกรองดูนะ"
              action={
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setKind('all')
                    setStatus('all')
                    setCategoryId('')
                    setSearch('')
                  }}
                >
                  ล้างตัวกรอง
                </button>
              }
            />
          ) : (
            <EmptyState
              title="ยังไม่มีรายการในเดือนนี้"
              hint="กด “เพิ่มรายการ” เพื่อจดรายรับหรือรายจ่าย"
              action={
                <button type="button" className="btn btn-primary" onClick={() => openEditor({ mode: 'new', kind: 'expense' })}>
                  ＋ เพิ่มรายการ
                </button>
              }
            />
          )}
        </div>
      )}

      {data && sortMode === 'priority' && data.length > 0 && (
        <>
          <p className="muted small">
            {canReorder ? 'จัดลำดับความสำคัญ: คลิกที่รายการแล้วลากขึ้น-ลง (รายการบนสุด = สำคัญที่สุด) · ใช้คีย์บอร์ด: เลือกรายการแล้วกด Alt + ↑ / ↓ รายการใหม่จะไปอยู่ท้ายสุด' : 'ล้างตัวกรองก่อน ถึงจะจัดลำดับความสำคัญได้'}
          </p>
          <ul className="tx-list">
            {ordered.map((t) => (
              <TransactionRow
                key={t.id}
                item={t}
                showDate
                order={canReorder ? { onMove: (d) => moveBy(t.id, d), dragging: dragId === t.id, onPointerDown: (e) => startDrag(e, t.id) } : undefined}
              />
            ))}
          </ul>
        </>
      )}

      {data &&
        sortMode === 'date' &&
        groupByDate(data).map(([date, items]) => (
          <section key={date} className="date-group" aria-label={formatThaiDate(date)}>
            <h3 className="date-heading">{formatThaiDate(date)}</h3>
            <ul className="tx-list">
              {items.map((t) => (
                <TransactionRow key={t.id} item={t} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  )
}
