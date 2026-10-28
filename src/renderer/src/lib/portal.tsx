import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Category, EntryKind, PaymentMethod, TransactionView } from '@shared/types'
import { Modal } from '../components/Modal'
import { errorMessage, meow, unwrap } from './api'

/* ---------- Toasts ---------- */

interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
  action?: { label: string; run: () => void }
}

/* ---------- Confirm dialog ---------- */

interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
}

/* ---------- Editor requests ---------- */

export type EditorRequest = { mode: 'new'; kind: EntryKind } | { mode: 'edit'; item: TransactionView }

interface PortalContextValue {
  month: string
  setMonth: (m: string) => void
  categories: Category[]
  paymentMethods: PaymentMethod[]
  /** Increments after every change; pages use it as part of their load key. */
  dataVersion: number
  refresh: () => void
  toast: (message: string, opts?: { tone?: Toast['tone']; action?: Toast['action'] }) => void
  confirm: (req: ConfirmRequest) => Promise<boolean>
  openEditor: (req: EditorRequest) => void
  togglePaid: (item: TransactionView) => Promise<void>
  deleteTransaction: (item: TransactionView) => Promise<void>
}

const PortalContext = createContext<PortalContextValue | null>(null)

export function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext)
  if (!ctx) throw new Error('usePortal must be used inside <PortalProvider>')
  return ctx
}

const TOAST_MS = 7000

export function PortalProvider(props: {
  month: string
  setMonth: (m: string) => void
  categories: Category[]
  paymentMethods: PaymentMethod[]
  onOpenEditor: (req: EditorRequest) => void
  dataVersion: number
  refresh: () => void
  children: ReactNode
}): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null)
  const confirmResolve = useRef<((ok: boolean) => void) | null>(null)
  const { refresh, onOpenEditor } = props

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback<PortalContextValue['toast']>(
    (message, opts) => {
      const id = nextId.current++
      setToasts((t) => [...t.slice(-1), { id, message, tone: opts?.tone ?? 'info', action: opts?.action }])
      window.setTimeout(() => dismiss(id), TOAST_MS)
    },
    [dismiss]
  )

  const confirm = useCallback<PortalContextValue['confirm']>((req) => {
    confirmResolve.current?.(false)
    setConfirmReq(req)
    return new Promise<boolean>((resolve) => {
      confirmResolve.current = resolve
    })
  }, [])

  const answer = (ok: boolean): void => {
    confirmResolve.current?.(ok)
    confirmResolve.current = null
    setConfirmReq(null)
  }

  const togglePaid = useCallback<PortalContextValue['togglePaid']>(
    async (item) => {
      try {
        await unwrap(meow().transactions.setPaid(item.id, !item.isPaid))
        refresh()
      } catch (error) {
        toast(errorMessage(error), { tone: 'error' })
      }
    },
    [refresh, toast]
  )

  const deleteTransaction = useCallback<PortalContextValue['deleteTransaction']>(
    async (item) => {
      const ok = await confirm({
        title: 'ลบรายการนี้ไหม?',
        message: `"${item.title}" จะถูกลบออกจากรายการ (กด "เลิกทำ" ได้ภายใน 8 วินาที)`,
        confirmLabel: 'ลบรายการ',
        danger: true
      })
      if (!ok) return
      try {
        await unwrap(meow().transactions.remove(item.id))
        refresh()
        toast(`ลบ "${item.title}" แล้ว`, {
          action: {
            label: 'เลิกทำ',
            run: () => {
              unwrap(meow().transactions.restore(item.id)).then(
                () => {
                  refresh()
                  toast('กู้คืนรายการแล้ว')
                },
                (error: unknown) => toast(errorMessage(error), { tone: 'error' })
              )
            }
          }
        })
      } catch (error) {
        toast(errorMessage(error), { tone: 'error' })
      }
    },
    [confirm, refresh, toast]
  )

  const value = useMemo<PortalContextValue>(
    () => ({
      month: props.month,
      setMonth: props.setMonth,
      categories: props.categories,
      paymentMethods: props.paymentMethods,
      dataVersion: props.dataVersion,
      refresh,
      toast,
      confirm,
      openEditor: onOpenEditor,
      togglePaid,
      deleteTransaction
    }),
    [props.month, props.setMonth, props.categories, props.paymentMethods, props.dataVersion, refresh, toast, confirm, onOpenEditor, togglePaid, deleteTransaction]
  )

  return (
    <PortalContext.Provider value={value}>
      {props.children}

      <Modal open={confirmReq !== null} title={confirmReq?.title ?? ''} onClose={() => answer(false)}>
        <p>{confirmReq?.message}</p>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => answer(false)} autoFocus>
            ยกเลิก
          </button>
          <button type="button" className={confirmReq?.danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={() => answer(true)}>
            {confirmReq?.confirmLabel}
          </button>
        </div>
      </Modal>

      <div className="toast-area" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={t.tone === 'error' ? 'toast toast-error' : 'toast'}>
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  t.action?.run()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="icon-btn" style={{ color: '#fff' }} aria-label="ปิดข้อความ" onClick={() => dismiss(t.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </PortalContext.Provider>
  )
}
