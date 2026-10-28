import { useEffect, useState, type FormEvent } from 'react'
import { describeFirebaseError } from '@shared/firebaseErrors'
import type { SyncConflictView } from '@shared/syncModel'
import { errorMessage, meow, unwrap } from '../lib/api'
import type { AccountUser, ConnectionCheck } from '../lib/firebase'
import { isFirebaseConfigured } from '../lib/firebaseConfig'
import { usePortal } from '../lib/portal'
import { syncPill } from '../lib/syncText'
import { useSyncState } from '../lib/useSync'

type FirebaseModule = typeof import('../lib/firebase')

const ICON: Record<ConnectionCheck['state'], string> = { ok: '✓', fail: '!', warn: '⏰' }
const BADGE: Record<ConnectionCheck['state'], string> = { ok: 'badge-paid', fail: 'badge-overdue', warn: 'badge-due_soon' }

/** Online account (Firebase) — sign in / sign up and a connection + rules self-test. */
export function AccountCard(): React.JSX.Element {
  const [fb, setFb] = useState<FirebaseModule | null>(null)
  const [user, setUser] = useState<AccountUser | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured) return
    let unsubscribe: (() => void) | undefined
    let active = true
    import('../lib/firebase').then(
      (mod) => {
        if (!active) return
        setFb(mod)
        unsubscribe = mod.watchUser((u) => setUser(u))
      },
      () => setLoadError('โหลดระบบบัญชีออนไลน์ไม่สำเร็จ')
    )
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  return (
    <section className="card" aria-labelledby="account-title">
      <div className="card-title">
        <h2 id="account-title">☁️ บัญชีออนไลน์ (ทดลอง)</h2>
      </div>
      {!isFirebaseConfigured ? (
        <p className="info">ยังไม่ได้ตั้งค่า Firebase ในแอปนี้ (คู่มือ FIREBASE_SETUP_TH.md ขั้นที่ 6)</p>
      ) : loadError ? (
        <p className="alert">{loadError}</p>
      ) : !fb || user === undefined ? (
        <p className="muted">กำลังตรวจสถานะบัญชี…</p>
      ) : user ? (
        <SignedIn fb={fb} user={user} />
      ) : (
        <SignInForm fb={fb} />
      )}
      <p className="muted small" style={{ marginTop: 10 }}>
        เมื่อเข้าสู่ระบบ แอปจะสำเนาข้อมูลรายรับรายจ่ายของคุณขึ้น Firebase (เฉพาะบัญชีคุณเท่านั้นที่อ่านได้) เพื่อใช้ข้ามเครื่อง
        ถ้าไม่เข้าสู่ระบบ ข้อมูลจะอยู่ในเครื่องนี้เท่านั้น และแอปใช้ออฟไลน์ได้ตามปกติ
      </p>
    </section>
  )
}

function SignInForm({ fb }: { fb: FirebaseModule }): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'alert' | 'info'; text: string } | null>(null)

  const run = async (action: 'in' | 'up' | 'reset'): Promise<void> => {
    if (!email.trim()) return setMessage({ tone: 'alert', text: 'กรุณาใส่อีเมล' })
    if (action !== 'reset' && !password) return setMessage({ tone: 'alert', text: 'กรุณาใส่รหัสผ่าน' })
    setBusy(true)
    setMessage(null)
    try {
      if (action === 'in') await fb.signIn(email.trim(), password)
      if (action === 'up') await fb.signUp(email.trim(), password)
      if (action === 'reset') {
        await fb.resetPassword(email.trim())
        setMessage({ tone: 'info', text: 'ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว (ถ้ามีบัญชีนี้อยู่)' })
      }
    } catch (error) {
      setMessage({ tone: 'alert', text: describeFirebaseError(error) })
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    void run('in')
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      {message && (
        <p className={message.tone} role={message.tone === 'alert' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      <div className="field-row">
        <div className="field">
          <label htmlFor="acc-email">อีเมล</label>
          <input id="acc-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="acc-password">รหัสผ่าน (อย่างน้อย 6 ตัว)</label>
          <input
            id="acc-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>
      <div className="toolbar">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          เข้าสู่ระบบ
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run('up')}>
          สร้างบัญชีใหม่
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run('reset')}>
          ลืมรหัสผ่าน
        </button>
      </div>
    </form>
  )
}

const TABLE_LABEL: Record<string, string> = {
  transactions: 'รายการรับ-จ่าย',
  recurring_rules: 'รายการประจำ',
  categories: 'หมวดหมู่',
  payment_methods: 'ช่องทางชำระ'
}

/** Items edited on two devices at once: the newer edit was kept, the other is shown here so nothing is lost silently. */
function ConflictList(): React.JSX.Element | null {
  const { status, syncNow } = useSyncState()
  const { toast, refresh } = usePortal()
  const [items, setItems] = useState<SyncConflictView[]>([])

  useEffect(() => {
    let active = true
    unwrap(meow().sync.conflicts()).then(
      (list) => {
        if (active) setItems(list)
      },
      () => undefined
    )
    return () => {
      active = false
    }
  }, [status.lastSyncAt, status.conflicts])

  const resolve = async (id: number, action: 'ack' | 'useOther'): Promise<void> => {
    try {
      await unwrap(meow().sync.resolveConflict(id, action))
      setItems((list) => list.filter((c) => c.id !== id))
      if (action === 'useOther') {
        refresh()
        syncNow()
        toast('เปลี่ยนไปใช้อีกเวอร์ชันแล้ว')
      }
    } catch (error) {
      toast(errorMessage(error), { tone: 'error' })
    }
  }

  if (items.length === 0) return null
  return (
    <div className="form">
      <h3>⚠️ ข้อมูลที่ถูกแก้จาก 2 เครื่องพร้อมกัน</h3>
      <p className="muted small">แอปเก็บเวอร์ชันที่แก้ล่าสุดไว้ให้ และเก็บอีกเวอร์ชันไว้ที่นี่ ไม่มีข้อมูลหาย</p>
      {items.map((c) => (
        <div key={c.id} className="conflict-item">
          <span className="conflict-text">
            {TABLE_LABEL[c.table] ?? c.table}: <strong>{c.title}</strong> — เก็บเวอร์ชันจาก{c.winner === 'local' ? 'เครื่องนี้' : 'เครื่องอื่น'}ไว้
          </span>
          <button type="button" className="btn btn-secondary" onClick={() => void resolve(c.id, 'useOther')}>
            ใช้อีกเวอร์ชันแทน
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void resolve(c.id, 'ack')}>
            รับทราบ
          </button>
        </div>
      ))}
    </div>
  )
}

function SyncSection(): React.JSX.Element {
  const { status, syncNow } = useSyncState()
  const pill = syncPill(status, status.retryAt ?? 0) // the live countdown is shown in the sidebar pill
  return (
    <div className="form">
      <p aria-live="polite">
        <strong>สถานะซิงก์:</strong> {pill.icon} {pill.text}
      </p>
      {status.message && <p className={status.phase === 'error' ? 'alert' : 'info'}>{status.message}</p>}
      {status.phase === 'owner-mismatch' && (
        <p className="alert" role="alert">
          ข้อมูลในเครื่องนี้ผูกกับบัญชีออนไลน์อื่นอยู่ จึงไม่ซิงก์ให้เพื่อไม่ให้ข้อมูลปนกัน ออกจากระบบแล้วเข้าด้วยบัญชีเดิม
          หรือใช้แอปในเครื่องอื่น/ติดตั้งใหม่สำหรับบัญชีนี้
        </p>
      )}
      <div className="toolbar">
        <button
          type="button"
          className="btn btn-primary"
          disabled={status.phase === 'syncing' || status.phase === 'owner-mismatch'}
          onClick={syncNow}
        >
          {status.phase === 'syncing' ? 'กำลังซิงก์…' : 'ซิงก์ตอนนี้'}
        </button>
      </div>
      <ConflictList />
    </div>
  )
}

function SignedIn({ fb, user }: { fb: FirebaseModule; user: AccountUser }): React.JSX.Element {
  const [checks, setChecks] = useState<ConnectionCheck[] | null>(null)
  const [busy, setBusy] = useState(false)

  const test = async (): Promise<void> => {
    setBusy(true)
    setChecks(null)
    try {
      setChecks(await fb.testConnection())
    } catch (error) {
      setChecks([{ label: 'ทดสอบ', state: 'fail', detail: describeFirebaseError(error) }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form">
      <p>
        เข้าสู่ระบบเป็น <strong>{user.email}</strong>
      </p>
      <SyncSection />
      <div className="toolbar">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void test()}>
          {busy ? 'กำลังทดสอบ…' : 'ทดสอบการเชื่อมต่อ'}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void fb.logOut()}>
          ออกจากระบบ
        </button>
      </div>
      {checks && (
        <ul className="bar-list" aria-label="ผลการทดสอบ" aria-live="polite">
          {checks.map((c) => (
            <li key={c.label}>
              <span className={`badge ${BADGE[c.state]}`}>
                <span aria-hidden="true">{ICON[c.state]}</span> {c.label}
              </span>{' '}
              {c.detail}
              {c.code && <span className="muted small"> — {describeFirebaseError({ code: c.code })}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
