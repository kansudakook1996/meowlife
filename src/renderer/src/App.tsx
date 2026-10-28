import { useCallback, useEffect, useState } from 'react'
import { monthOf, todayIso } from '@shared/dates'
import type { Category, PaymentMethod } from '@shared/types'
import logoUrl from './assets/logo.png'
import { CatMascot } from './components/CatMascot'
import { Modal } from './components/Modal'
import { TransactionForm } from './components/TransactionForm'
import { meow, unwrap } from './lib/api'
import { PortalProvider, usePortal, type EditorRequest } from './lib/portal'
import { SyncPill } from './components/SyncPill'
import { useLoad } from './lib/useLoad'
import { SyncProvider } from './lib/useSync'
import { useUpdateStatus } from './lib/useUpdateStatus'
import { DashboardPage } from './pages/DashboardPage'
import { RecurringPage } from './pages/RecurringPage'
import { SettingsPage } from './pages/SettingsPage'
import { TransactionsPage } from './pages/TransactionsPage'

type PageId = 'dashboard' | 'transactions' | 'recurring' | 'settings'

const NAV: Array<{ id: PageId; icon: string; label: string }> = [
  { id: 'dashboard', icon: '🏠', label: 'ภาพรวม' },
  { id: 'transactions', icon: '📒', label: 'รายการรับ-จ่าย' },
  { id: 'recurring', icon: '🔁', label: 'รายการประจำ' },
  { id: 'settings', icon: '⚙️', label: 'ตั้งค่า' }
]

const COMING_SOON = [
  { icon: '📅', label: 'ปฏิทิน' },
  { icon: '📔', label: 'บันทึกประจำวัน' },
  { icon: '✅', label: 'สิ่งที่ต้องทำ' },
  { icon: '🎯', label: 'เป้าหมาย' },
  { icon: '🌱', label: 'นิสัย' },
  { icon: '🗒️', label: 'โน้ต' }
]

interface Catalog {
  categories: Category[]
  paymentMethods: PaymentMethod[]
}

export function App(): React.JSX.Element {
  const [page, setPage] = useState<PageId>('dashboard')
  const [month, setMonth] = useState(() => monthOf(todayIso()))
  const [dataVersion, setDataVersion] = useState(0)
  const [editor, setEditor] = useState<EditorRequest | null>(null)
  const [searchFocusSignal, setSearchFocusSignal] = useState(0)

  const refresh = useCallback(() => setDataVersion((v) => v + 1), [])
  const openEditor = useCallback((req: EditorRequest) => setEditor(req), [])

  // Reload categories/payment methods after local or synced changes (data from other devices).
  const { data: catalog, error: catalogError } = useLoad<Catalog>(`catalog:${dataVersion}`, async () => ({
    categories: await unwrap(meow().categories.list()),
    paymentMethods: await unwrap(meow().paymentMethods.list())
  }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || e.altKey || e.shiftKey) return
      const key = e.key.toLowerCase()
      if (key === 'n') {
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
  }, [])

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
            <img src={logoUrl} alt="" width={52} height={52} className="brand-logo" />
            <span className="brand-name">MeowLife</span>
          </div>
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className="nav-item"
              aria-current={page === n.id ? 'page' : undefined}
              onClick={() => setPage(n.id)}
            >
              <span className="nav-icon" aria-hidden="true">
                {n.icon}
              </span>
              {n.label}
            </button>
          ))}
          <div className="nav-section">เร็ว ๆ นี้</div>
          {COMING_SOON.map((n) => (
            <button key={n.label} type="button" className="nav-item" aria-disabled="true" title="กำลังพัฒนา ยังใช้งานไม่ได้" tabIndex={-1}>
              <span className="nav-icon" aria-hidden="true">
                {n.icon}
              </span>
              {n.label}
              <span className="soon">เร็ว ๆ นี้</span>
            </button>
          ))}
          <SyncPill />
        </nav>

        <main className="main">
          <UpdateBanner />
          {page === 'dashboard' && <DashboardPage />}
          {page === 'transactions' && <TransactionsPage searchFocusSignal={searchFocusSignal} />}
          {page === 'recurring' && <RecurringPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>

      <TransactionEditor request={editor} onClose={() => setEditor(null)} />
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
