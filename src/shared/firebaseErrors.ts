/**
 * Turn Firebase Auth / Firestore error codes into short Thai messages with a hint
 * pointing at the step in docs/FIREBASE_SETUP_TH.md that fixes it.
 */
const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง',
  'auth/missing-password': 'กรุณาใส่รหัสผ่าน',
  'auth/weak-password': 'รหัสผ่านสั้นเกินไป ต้องมีอย่างน้อย 6 ตัวอักษร',
  'auth/email-already-in-use': 'อีเมลนี้มีบัญชีอยู่แล้ว ลองกด "เข้าสู่ระบบ" แทนนะ',
  'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'auth/wrong-password': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'auth/user-not-found': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'auth/user-disabled': 'บัญชีนี้ถูกปิดใช้งานใน Firebase Console',
  'auth/too-many-requests': 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่นะ',
  'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ตรวจการเชื่อมต่อแล้วลองใหม่',
  'auth/operation-not-allowed': 'ยังไม่ได้เปิดการล็อกอินด้วยอีเมล/รหัสผ่าน (คู่มือ Firebase ขั้นที่ 3)',
  'auth/admin-restricted-operation': 'ปิดการสร้างบัญชีใหม่ไว้ใน Firebase Console (คู่มือ Firebase ขั้นที่ 3)',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'API key ไม่ถูกต้อง ตรวจค่าในไฟล์ .env (คู่มือ Firebase ขั้นที่ 6)',
  'auth/invalid-api-key': 'API key ไม่ถูกต้อง ตรวจค่าในไฟล์ .env (คู่มือ Firebase ขั้นที่ 6)',
  'permission-denied': 'ถูกปฏิเสธสิทธิ์ (permission-denied) — ตรวจว่า Publish Security Rules แล้ว (คู่มือ Firebase ขั้นที่ 5, 8)',
  unauthenticated: 'ยังไม่ได้เข้าสู่ระบบ',
  unavailable: 'เชื่อมต่อฐานข้อมูลออนไลน์ไม่ได้ (ออฟไลน์?) ลองใหม่ภายหลัง',
  'not-found': 'ไม่พบฐานข้อมูล Firestore — สร้าง Firestore Database แล้วหรือยัง (คู่มือ Firebase ขั้นที่ 4)',
  'failed-precondition': 'Firestore ยังไม่พร้อมใช้งาน — ตรวจว่าสร้าง Database แล้ว (คู่มือ Firebase ขั้นที่ 4)',
  'deadline-exceeded': 'ฐานข้อมูลออนไลน์ตอบช้าเกินไป ลองใหม่อีกครั้ง'
}

export function firebaseErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string') return code.replace(/^firestore\//, '')
  }
  return 'unknown'
}

export function describeFirebaseError(error: unknown): string {
  const code = firebaseErrorCode(error)
  return MESSAGES[code] ?? `เกิดข้อผิดพลาดจาก Firebase (${code})`
}
