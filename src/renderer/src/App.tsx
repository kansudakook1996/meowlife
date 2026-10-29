import { useCallback, useEffect, useMemo, useState } from 'react'
import { monthOf, todayIso } from '@shared/dates'
import type { Category, PaymentMethod } from '@shared/types'
import logoUrl from './assets/logo.png'
import { CatMascot } from './components/CatMascot'
import { CommandPalette, type PaletteItem } from './components/CommandPalette'
import { Icon, type IconName } from './components/Icon'
import { Modal } from './components/Modal'
import { TransactionForm } from './components/TransactionForm'
import { meow, unwrap } from './lib/api'
import { PortalProvider, usePortal, type EditorRequest } from './lib/portal'
import { SyncPill } from './components/SyncPill'
import { useLoad } from './lib/useLoad'
import { SyncProvider } from './lib/useSync'
import { useUpdateStatus } from './lib/useUpdateStatus'
import { CalendarPage } from './pages/CalendarPage'
import { CardsPage } from './pages/CardsPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { NAVIGATE_EVENT } from './lib/nav'
import { CompanionPage } from './pages/CompanionPage'
import { GoalsPage } from './pages/GoalsPage'
import { HabitsPage } from './pages/HabitsPage'
import { InsightsPage } from './pages/InsightsPage'
import { JournalPage } from './pages/JournalPage'
import { NotesPage } from './pages/NotesPage'
import { TasksPage } from './pages/TasksPage'
import { useSettings } from './lib/settings'
import { DashboardPage } from './pages/DashboardPage'
import { DataPage } from './pages/DataPage'
import { ReportsPage } from './pages/ReportsPage'
import { RecurringPage } from './pages/RecurringPage'
import { SettingsPage } from './pages/SettingsPage'
import { TransactionsPage } from './pages/TransactionsPage'

type PageId =
  | 'dashboard' | 'transactions' | 'cards' | 'recurring' | 'reports' | 'categories' | 'data'
  | 'calendar' | 'tasks' | 'journal' | 'goals' | 'habits' | 'notes' | 'insights' | 'companion' | 'settings'

const NAV: Array<{ section?: string; id: PageId; icon: IconName; label: string }> = [
  { id: 'dashboard', icon: 'home', label: 'ภาพรวม' },
  { section: 'การเงิน', id: 'transactions', icon: 'ledger', label: 'รายการรับ-จ่าย' },
  { id: 'cards', icon: 'card', label: 'บัตรเครดิต' },
  { id: 'recurring', icon: 'repeat', label: 'รายการประจำ' },
  { id: 'reports', icon: 'chart', label: 'รายงาน' },
  { id: 'categories', icon: 'tag', label: 'หมวดหมู่' },
  { id: 'data', icon: 'archive', label: 'ข้อมูลและสำรอง' },
  { section: 'ชีวิตประจำวัน', id: 'calendar', icon: 'calendar', label: 'ปฏิทิน' },
  { id: 'tasks', icon: 'tasks', label: 'สิ่งที่ต้องทำ' },
  { id: 'journal', icon: 'journal', label: 'บันทึกประจำวัน' },
  { id: 'goals', icon: 'target', label: 'เป้าหมาย' },
  { id: 'habits', icon: 'sprout', label: 'นิสัย' },
  { id: 'notes', icon: 'note', label: 'โน้ต' },
  { section: 'ภาพรวมชีวิต', id: 'insights', icon: 'bars', label: 'สถิติ' },
  { id: 'companion', icon: 'cat', label: 'แมวคู่ใจ' },
  { id: 'settings', icon: 'sliders', label: 'ตั้งค่า' }
]

const PAGE_KEY = 'meowlife.lastPage'

function loadLastPage(): PageId {
  try {
    const v = window.localStorage.getItem(PAGE_KEY)
    return NAV.some((n) => n.id === v) ? (v as PageId) : 'dashboard'
  } catch {
    return 'dashboard'
  }
}
interface Catalog {
  categories: Category[]
  paymentMethods: PaymentMethod[]
}

export function App(): React.JSX.Element {
  const [page, setPageState] = useState<PageId>(loadLastPage)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [ledgerSearch, setLedgerSearch] = useState({ text: '', nonce: 0 })
  const [taskAddSignal, setTaskAddSignal] = useState(0)
  const [cardChargeSignal, setCardChargeSignal] = useState(0)
  const [month, setMonth] = useState(() => monthOf(todayIso()))
  const [dataVersion, setDataVersion] = useState(0)
  const [editor, setEditor] = useState<EditorRequest | null>(null)
  const [searchFocusSignal, setSearchFocusSignal] = useState(0)
  const { epoch } = useSettings()

  const setPage = useCallback((id: PageId) => {
    setPageState(id)
    try {
      window.localStorage.setItem(PAGE_KEY, id)
    } catch {
      /* remembering the page is a convenience only */
    }
  }, [])
  const refresh = useCallback(() => setDataVersion((v) => v + 1), [])
  const openEditor = useCallback((req: EditorRequest) => setEditor(req), [])

  // Reload categories/payment methods after local or synced changes (data from other devices).
  const { data: catalog, error: catalogError } = useLoad<Catalog>(`catalog:${dataVersion}`, async () => ({
    categories: await unwrap(meow().categories.list()),
    paymentMethods: await unwrap(meow().paymentMethods.list())
  }))

  // Other components (e.g. the dashboard) can ask to open a page.
  useEffect(() => {
    const onNavigate = (e: Event): void => {
      const target = (e as CustomEvent<string>).detail
      if (NAV.some((n) => n.id === target)) setPage(target as PageId)
    }
    window.addEventListener(NAVIGATE_EVENT, onNavigate)
    return () => window.removeEventListener(NAVIGATE_EVENT, onNavigate)
  }, [setPage])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || e.altKey || e.shiftKey) return
      const key = e.key.toLowerCase()
      if (key === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      } else if (key === 'n') {
        e.preventDefault()
        setEditor({ mode: 'new', kind: 'expense' })
      } else if (key === 'f') {
        e.preventDefault()
        setPage('transactions')
        setSearchFocusSignal((s) => s + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPage])

  const paletteItems = useMemo<PaletteItem[]>(
    () => [
      { id: 'add-expense', label: 'เพิ่มรายจ่าย', hint: 'เพิ่ม', run: () => setEditor({ mode: 'new', kind: 'expense' }) },
      { id: 'add-income', label: 'เพิ่มรายรับ', hint: 'เพิ่ม', run: () => setEditor({ mode: 'new', kind: 'income' }) },
      { id: 'add-task', label: 'เพิ่มงานใหม่', hint: 'เพิ่ม', run: () => { setPage('tasks'); setTaskAddSignal((s) => s + 1) } },
      { id: 'add-card-charge', label: 'เพิ่มยอดใช้จ่ายบัตรเครดิต', hint: 'เพิ่ม', run: () => { setPage('cards'); setCardChargeSignal((s) => s + 1) } },
      { id: 'journal-today', label: 'จดบันทึกวันนี้', hint: 'ไปที่หน้า', run: () => setPage('journal') },
      { id: 'habits-today', label: 'ติ๊กนิสัยวันนี้', hint: 'ไปที่หน้า', run: () => setPage('habits') },
      ...NAV.map((n): PaletteItem => ({ id: `go-${n.id}`, label: n.label, hint: 'ไปที่หน้า', run: () => setPage(n.id) }))
    ],
    [setPage]
  )
  if (catalogError) {
    return (
      <div className="empty" style={{ height: '100%', justifyContent: 'center' }}>
        <CatMascot mood="worried" size={120} />
        <h2>เปิดข้อมูลไม่สำเร็จ</h2>
        <p className="muted">{catalogError}</p>
      </div>
    )
  }
  if (!catalog) return <div className="loading">กำลังเปิด MeowLife…</div>

  return (
    <SyncProvider dataVersion={dataVersion} onRemoteChange={refresh}>
    <PortalProvider
      month={month}
      setMonth={setMonth}
      categories={catalog.categories}
      paymentMethods={catalog.paymentMethods}
      dataVersion={dataVersion}
      refresh={refresh}
      onOpenEditor={openEditor}
    >
      <div className="app">
        <nav className="sidebar" aria-label="เมนูหลัก">
          <div className="brand">
            <img src={logoUrl} alt="" width={34} height={34} className="brand-logo" />
            <span className="brand-name">MeowLife</span>
          </div>
          {NAV.map((n) => (
            <div key={n.id} style={{ display: 'contents' }}>
              {n.section && <div className="nav-section">{n.section}</div>}
              <button type="button" className="nav-item" aria-current={page === n.id ? 'page' : undefined} onClick={() => setPage(n.id)}>
                <span className="nav-icon">
                  <Icon name={n.icon} />
                </span>
                {n.label}
              </button>
            </div>
          ))}          <SyncPill />
        </nav>

        <main className="main" key={epoch}>
          <UpdateBanner />
          <div className="topbar">
            <button type="button" className="btn btn-secondary" onClick={() => setPaletteOpen(true)} title="ค้นหาหน้าหรือสั่งงาน (Ctrl+K)">
              <Icon name="search" /> ค้นหา / สั่งงาน <kbd>Ctrl+K</kbd>
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setEditor({ mode: 'new', kind: 'expense' })} title="เพิ่มรายการรับ-จ่าย (Ctrl+N)">
              <Icon name="plus" /> เพิ่มรายการ <kbd>Ctrl+N</kbd>
            </button>
          </div>
          {page === 'dashboard' && <DashboardPage />}
          {page === 'transactions' && <TransactionsPage key={ledgerSearch.nonce} searchFocusSignal={searchFocusSignal} initialSearch={ledgerSearch.text} />}
          {page === 'cards' && <CardsPage key={cardChargeSignal} startAddingCharge={cardChargeSignal > 0} />}
          {page === 'recurring' && <RecurringPage />}
          {page === 'calendar' && <CalendarPage />}
          {page === 'tasks' && <TasksPage key={taskAddSignal} startAdding={taskAddSignal > 0} />}
          {page === 'journal' && <JournalPage />}
          {page === 'goals' && <GoalsPage />}
          {page === 'habits' && <HabitsPage />}
          {page === 'notes' && <NotesPage />}
          {page === 'insights' && <InsightsPage />}
          {page === 'companion' && <CompanionPage />}
          {page === 'reports' && <ReportsPage />}
          {page === 'categories' && <CategoriesPage />}
          {page === 'data' && <DataPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>

      <TransactionEditor request={editor} onClose={() => setEditor(null)} />
      <CommandPalette
        open={paletteOpen}
        items={paletteItems}
        onClose={() => setPaletteOpen(false)}
        onSearchLedger={(text) => {
          setLedgerSearch((s) => ({ text, nonce: s.nonce + 1 }))
          setPage('transactions')
        }}
      />
      <BadgeWatcher />
    </PortalProvider>
    </SyncProvider>
  )
}

/** Appears only once an update has finished downloading. */
function UpdateBanner(): React.JSX.Element | null {
  const status = useUpdateStatus()
  if (status?.state !== 'downloaded') return null
  return (
    <div className="update-banner" role="status">
      <CatMascot mood="cheer" size={40} />
      <span>MeowLife เวอร์ชัน {status.version} พร้อมติดตั้งแล้ว ข้อมูลของคุณจะอยู่ครบ</span>
      <button type="button" className="btn btn-primary" onClick={() => void meow().updates.install()}>
        รีสตาร์ทเพื่ออัปเดต
      </button>
    </div>
  )
}

/** Add/edit dialog shared by every page (opened with the buttons or Ctrl+N). */
function TransactionEditor({ request, onClose }: { request: EditorRequest | null; onClose: () => void }): React.JSX.Element {
  const { month, setMonth, categories, paymentMethods, refresh, toast } = usePortal()
  const today = todayIso()
  const defaultDate = monthOf(today) === month ? today : `${month}-01`

  return (
    <Modal open={request !== null} title={request?.mode === 'edit' ? 'แก้ไขรายการ' : 'เพิ่มรายการ'} onClose={onClose}>
      {request && (
        <TransactionForm
          key={request.mode === 'edit' ? request.item.id : `new-${request.kind}`}
          initial={request.mode === 'edit' ? request.item : undefined}
          defaultKind={request.mode === 'new' ? request.kind : request.item.kind}
          defaultDate={defaultDate}
          categories={categories}
          paymentMethods={paymentMethods}
          onCancel={onClose}
          onSaved={(item, isNew) => {
            onClose()
            if (monthOf(item.txnDate) !== month) setMonth(monthOf(item.txnDate))
            refresh()
            toast(isNew ? `เพิ่ม "${item.title}" แล้ว` : 'บันทึกการแก้ไขแล้ว')
          }}
        />
      )}
    </Modal>
  )
}

/** Tells the user once when a new badge is earned (gently; checked after data changes). */
function BadgeWatcher(): null {
  const { dataVersion, toast } = usePortal()
  useEffect(() => {
    const id = window.setTimeout(() => {
      unwrap(meow().portal.companion.state()).then(
        (state) => {
          if (state.newBadgeIds.length === 0) return
          const names = state.badges.filter((b) => state.newBadgeIds.includes(b.id)).map((b) => `${b.icon} ${b.title}`)
          toast(`ได้ Badge ใหม่: ${names.join(', ')}`)
          void meow().portal.companion.markSeen(state.newBadgeIds)
        },
        () => undefined
      )
    }, 2500)
    return () => window.clearTimeout(id)
  }, [dataVersion, toast])
  return null
}