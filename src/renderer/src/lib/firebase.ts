/**
 * Firebase Auth + Firestore, used from the renderer (see ADR 0005 for why).
 * This module is loaded lazily with `import()` so the SDK only downloads when the account card opens.
 * Never log passwords, tokens or user data from here.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocsFromServer,
  getFirestore,
  limit as limitTo,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore
} from 'firebase/firestore'
import { firebaseErrorCode } from '@shared/firebaseErrors'
import type { SyncRemote } from '@shared/syncEngine'
import type { SyncDoc } from '@shared/syncModel'
import { firebaseConfig } from './firebaseConfig'

export interface AccountUser {
  uid: string
  email: string | null
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

function services(): { auth: Auth; db: Firestore } {
  if (!app) {
    app = initializeApp(firebaseConfig)
    // IndexedDB persistence keeps the user signed in across app restarts.
    auth = initializeAuth(app, { persistence: indexedDBLocalPersistence })
    db = getFirestore(app)
  }
  return { auth: auth as Auth, db: db as Firestore }
}

export function watchUser(listener: (user: AccountUser | null) => void): () => void {
  return onAuthStateChanged(services().auth, (u) => listener(u ? { uid: u.uid, email: u.email } : null))
}

export async function signUp(email: string, password: string): Promise<void> {
  await createUserWithEmailAndPassword(services().auth, email, password)
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(services().auth, email, password)
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(services().auth, email)
}

export async function logOut(): Promise<void> {
  await signOut(services().auth)
}

const NETWORK_TIMEOUT_MS = 20_000

/** Offline Firestore calls can wait forever; turn that into an error so sync can retry later. */
function withTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject({ code: 'deadline-exceeded' }), NETWORK_TIMEOUT_MS)
    work.then(
      (v) => {
        window.clearTimeout(timer)
        resolve(v)
      },
      (e: unknown) => {
        window.clearTimeout(timer)
        reject(e)
      }
    )
  })
}

const PUSH_CHUNK = 400 // Firestore allows 500 writes per batch

/** Firestore side of the sync: users/{uid}/{table}/{id}. Security Rules restrict it to the owner. */
export function remoteFor(uid: string): SyncRemote {
  const { db } = services()
  return {
    async pull(table, sinceIso, limit) {
      const q = query(collection(db, 'users', uid, table), where('updatedAt', '>=', sinceIso), orderBy('updatedAt'), limitTo(limit))
      const snap = await withTimeout(getDocsFromServer(q))
      return snap.docs.map((d) => d.data() as SyncDoc)
    },
    async push(table, docs) {
      for (let i = 0; i < docs.length; i += PUSH_CHUNK) {
        const batch = writeBatch(db)
        for (const d of docs.slice(i, i + PUSH_CHUNK)) batch.set(doc(db, 'users', uid, table, String(d['id'])), d)
        await withTimeout(batch.commit())
      }
    }
  }
}

export type CheckState = 'ok' | 'fail' | 'warn'

export interface ConnectionCheck {
  label: string
  state: CheckState
  detail: string
  /** Raw Firebase error code, if any (for the troubleshooting table). */
  code?: string
}

/** A uid that can never belong to a real Firebase user (real uids have no hyphens). */
const PROBE_OTHER_UID = 'rules-probe-not-a-real-user'

/**
 * Step 7/8 of the Firebase guide, automated:
 * 1. write my own users/{uid}/meta/connection   → must succeed
 * 2. read it back                              → must match
 * 3. read another user's document              → must be permission-denied (rules work)
 */
export async function testConnection(): Promise<ConnectionCheck[]> {
  const { auth, db } = services()
  const user = auth.currentUser
  if (!user) return [{ label: 'เข้าสู่ระบบ', state: 'fail', detail: 'ยังไม่ได้เข้าสู่ระบบ', code: 'unauthenticated' }]

  const checks: ConnectionCheck[] = [{ label: 'เข้าสู่ระบบ', state: 'ok', detail: 'เชื่อมต่อ Firebase Authentication ได้' }]
  const mine = doc(db, 'users', user.uid, 'meta', 'connection')
  const stamp = new Date().toISOString()

  try {
    await setDoc(mine, { id: 'connection', updatedAt: stamp, kind: 'connection-test' })
    checks.push({ label: 'บันทึกข้อมูลของฉัน', state: 'ok', detail: 'เขียนข้อมูลทดสอบลง Firestore ได้' })
  } catch (error) {
    checks.push({ label: 'บันทึกข้อมูลของฉัน', state: 'fail', detail: 'เขียนข้อมูลไม่ได้', code: firebaseErrorCode(error) })
    return checks
  }

  try {
    const snap = await getDoc(mine)
    const same = snap.exists() && snap.data()['updatedAt'] === stamp
    checks.push(
      same
        ? { label: 'อ่านข้อมูลของฉัน', state: 'ok', detail: 'อ่านกลับมาได้ตรงกัน' }
        : { label: 'อ่านข้อมูลของฉัน', state: 'fail', detail: 'อ่านได้แต่ข้อมูลไม่ตรงกัน' }
    )
  } catch (error) {
    checks.push({ label: 'อ่านข้อมูลของฉัน', state: 'fail', detail: 'อ่านข้อมูลไม่ได้', code: firebaseErrorCode(error) })
  }

  try {
    await getDoc(doc(db, 'users', PROBE_OTHER_UID, 'meta', 'connection'))
    checks.push({
      label: 'กันคนอื่นอ่านข้อมูล',
      state: 'fail',
      detail: 'อันตราย! อ่านข้อมูลของผู้ใช้อื่นได้ แปลว่า Security Rules เปิดกว้างเกินไป (คู่มือขั้นที่ 5)'
    })
  } catch (error) {
    const code = firebaseErrorCode(error)
    checks.push(
      code === 'permission-denied'
        ? { label: 'กันคนอื่นอ่านข้อมูล', state: 'ok', detail: 'Security Rules ปฏิเสธการอ่านข้อมูลของผู้ใช้อื่นถูกต้อง' }
        : { label: 'กันคนอื่นอ่านข้อมูล', state: 'warn', detail: 'ตรวจไม่ได้ในตอนนี้', code }
    )
  }
  return checks
}
