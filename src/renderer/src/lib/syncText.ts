import type { SyncStatus } from '@shared/syncModel'

const time = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' })

/** Short status for the sidebar: icon + text (never colour alone). */
export function syncPill(status: SyncStatus, now: number): { icon: string; text: string; tone: 'ok' | 'busy' | 'warn' | 'off' } {
  switch (status.phase) {
    case 'unconfigured':
      return { icon: '☁️', text: 'ซิงก์: ยังไม่ได้ตั้งค่า', tone: 'off' }
    case 'signed-out':
      return { icon: '☁️', text: 'ซิงก์: ยังไม่ได้เข้าสู่ระบบ', tone: 'off' }
    case 'offline':
      return { icon: '📴', text: 'ออฟไลน์ จะซิงก์เมื่อมีเน็ต', tone: 'warn' }
    case 'syncing':
      return { icon: '🔄', text: 'กำลังซิงก์…', tone: 'busy' }
    case 'idle': {
      const when = status.lastSyncAt ? ` ${time.format(new Date(status.lastSyncAt))}` : ''
      const conflicts = status.conflicts > 0 ? ` · มีข้อขัดแย้ง ${status.conflicts}` : ''
      return { icon: status.conflicts > 0 ? '⚠️' : '✓', text: `ซิงก์แล้ว${when}${conflicts}`, tone: status.conflicts > 0 ? 'warn' : 'ok' }
    }
    case 'error': {
      const secs = status.retryAt ? Math.max(0, Math.ceil((status.retryAt - now) / 1000)) : null
      return { icon: '!', text: `ซิงก์ไม่สำเร็จ${secs !== null ? ` ลองใหม่ใน ${secs} วิ` : ''}`, tone: 'warn' }
    }
    case 'owner-mismatch':
      return { icon: '!', text: 'เครื่องนี้ผูกกับบัญชีอื่น', tone: 'warn' }
  }
}
