import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { describeFirebaseError } from '@shared/firebaseErrors'
import { retryDelayMs, runSync } from '@shared/syncEngine'
import type { SyncStatus } from '@shared/syncModel'
import { meow, unwrap } from './api'
import type { AccountUser } from './firebase'
import { isFirebaseConfigured } from './firebaseConfig'
import { useSettings } from './settings'
import { syncLocal } from './syncClient'

type FirebaseModule = typeof import('./firebase')

interface SyncContextValue {
  status: SyncStatus
  syncNow: () => void
}

const INITIAL: SyncStatus = {
  phase: isFirebaseConfigured ? 'signed-out' : 'unconfigured',
  email: null,
  lastSyncAt: null,
  retryAt: null,
  message: null,
  conflicts: 0
}

const SyncContext = createContext<SyncContextValue>({ status: INITIAL, syncNow: () => undefined })

export function useSyncState(): SyncContextValue {
  return useContext(SyncContext)
}

const PERIODIC_MS = 2 * 60_000
const AFTER_EDIT_MS = 4_000

/**
 * Keeps the local database and Firestore in step while someone is signed in:
 * on sign-in, after every local change (debounced), every 2 minutes, and when the network returns.
 * Failures retry with backoff (5s, 15s, 1min, 5min) and never lose local data.
 */
export function SyncProvider(props: { dataVersion: number; onRemoteChange: () => void; children: ReactNode }): React.JSX.Element {
  const { dataVersion, onRemoteChange } = props
  const [fb, setFb] = useState<FirebaseModule | null>(null)
  const [user, setUser] = useState<AccountUser | null>(null)
  const [status, setStatus] = useState<SyncStatus>(INITIAL)
  const { autoSync } = useSettings().settings

  const running = useRef(false)
  const again = useRef(false)
  const failures = useRef(0)
  const retryTimer = useRef<number | undefined>(undefined)
  const userRef = useRef<AccountUser | null>(null)
  const fbRef = useRef<FirebaseModule | null>(null)
  const onChangeRef = useRef(onRemoteChange)
  useEffect(() => {
    onChangeRef.current = onRemoteChange
  }, [onRemoteChange])

  // Load Firebase after the first paint so the app opens fast.
  useEffect(() => {
    if (!isFirebaseConfigured) return
    let unsubscribe: (() => void) | undefined
    let active = true
    const start = (): void => {
      import('./firebase').then(
        (mod) => {
          if (!active) return
          fbRef.current = mod
          setFb(mod)
          unsubscribe = mod.watchUser((u) => {
            userRef.current = u
            setUser(u)
            if (!u) setStatus((s) => ({ ...s, phase: 'signed-out', email: null, retryAt: null, message: null }))
          })
        },
        () => setStatus((s) => ({ ...s, phase: 'error', message: 'โหลดระบบซิงก์ไม่สำเร็จ' }))
      )
    }
    const id = window.setTimeout(start, 300)
    return () => {
      active = false
      window.clearTimeout(id)
      unsubscribe?.()
    }
  }, [])

  const runRef = useRef<() => Promise<void>>(async () => undefined)
  const run = useCallback(async (): Promise<void> => {
    const mod = fbRef.current
    const u = userRef.current
    if (!mod || !u) return
    if (!navigator.onLine) {
      setStatus((s) => ({ ...s, phase: 'offline', email: u.email, retryAt: null }))
      return
    }
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    window.clearTimeout(retryTimer.current)
    setStatus((s) => ({ ...s, phase: 'syncing', email: u.email, retryAt: null, message: null }))
    try {
      const result = await runSync(syncLocal, mod.remoteFor(u.uid), u.uid)
      if (result.status === 'owner-mismatch') {
        setStatus((s) => ({ ...s, phase: 'owner-mismatch', email: u.email, retryAt: null, message: null }))
        return
      }
      failures.current = 0
      const conflicts = (await unwrap(meow().sync.conflicts())).length
      setStatus({
        phase: 'idle',
        email: u.email,
        lastSyncAt: new Date().toISOString(),
        retryAt: null,
        message: result.skipped > 0 ? `ข้ามข้อมูลที่อ่านไม่ได้ ${result.skipped} รายการ` : null,
        conflicts
      })
      if (result.changed > 0) onChangeRef.current()
    } catch (error) {
      failures.current += 1
      const delay = retryDelayMs(failures.current)
      const message = describeFirebaseError(error)
      setStatus((s) => ({ ...s, phase: 'error', email: u.email, retryAt: Date.now() + delay, message }))
      retryTimer.current = window.setTimeout(() => void runRef.current(), delay)
    } finally {
      running.current = false
      if (again.current) {
        again.current = false
        void runRef.current()
      }
    }
  }, [])

  useEffect(() => {
    runRef.current = run
  }, [run])

  // On sign-in, then every 2 minutes.
  useEffect(() => {
    if (!fb || !user || !autoSync) return
    void run()
    const id = window.setInterval(() => void run(), PERIODIC_MS)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(retryTimer.current)
    }
  }, [fb, user, run, autoSync])

  // After the user changes something locally.
  const firstVersion = useRef(dataVersion)
  useEffect(() => {
    if (dataVersion === firstVersion.current || !user || !autoSync) return
    const id = window.setTimeout(() => void run(), AFTER_EDIT_MS)
    return () => window.clearTimeout(id)
  }, [dataVersion, user, run, autoSync])

  // Network coming and going.
  useEffect(() => {
    const online = (): void => {
      if (autoSync) void run()
    }
    const offline = (): void => setStatus((s) => (userRef.current ? { ...s, phase: 'offline', retryAt: null } : s))
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [run, autoSync])

  const syncNow = useCallback(() => {
    failures.current = 0
    void run()
  }, [run])

  return <SyncContext.Provider value={{ status, syncNow }}>{props.children}</SyncContext.Provider>
}
