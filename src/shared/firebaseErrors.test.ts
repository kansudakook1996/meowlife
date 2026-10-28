import { describe, expect, it } from 'vitest'
import { describeFirebaseError, firebaseErrorCode } from './firebaseErrors'

describe('firebase errors', () => {
  it('reads codes from Firebase error objects', () => {
    expect(firebaseErrorCode({ code: 'auth/invalid-email' })).toBe('auth/invalid-email')
    expect(firebaseErrorCode({ code: 'firestore/permission-denied' })).toBe('permission-denied')
    expect(firebaseErrorCode(new Error('x'))).toBe('unknown')
    expect(firebaseErrorCode(null)).toBe('unknown')
  })

  it('gives Thai messages that point at the setup guide', () => {
    expect(describeFirebaseError({ code: 'permission-denied' })).toMatch(/ขั้นที่ 5/)
    expect(describeFirebaseError({ code: 'auth/operation-not-allowed' })).toMatch(/ขั้นที่ 3/)
    expect(describeFirebaseError({ code: 'not-found' })).toMatch(/ขั้นที่ 4/)
    expect(describeFirebaseError({ code: 'auth/weak-password' })).toMatch(/6 ตัวอักษร/)
  })

  it('falls back to showing the raw code', () => {
    expect(describeFirebaseError({ code: 'something-new' })).toContain('something-new')
  })
})
