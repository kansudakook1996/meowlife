import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'
import { meow, unwrap } from './api'

/** Current auto-update status, kept live by push events from the main process. */
export function useUpdateStatus(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    let active = true
    const unsubscribe = meow().updates.onStatus((s) => {
      if (active) setStatus(s)
    })
    unwrap(meow().updates.getStatus()).then(
      (s) => {
        if (active) setStatus((current) => current ?? s)
      },
      () => undefined
    )
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return status
}

export function describeUpdate(s: UpdateStatus): string {
  switch (s.state) {
    case 'disabled':
      return 'โหมดพัฒนา: ตรวจอัปเดตได้เฉพาะแอปที่ติดตั้งจากตัวติดตั้ง'
    case 'idle':
      return 'ยังไม่ได้ตรวจหาเวอร์ชันใหม่'
    case 'checking':
      return 'กำลังตรวจหาเวอร์ชันใหม่…'
    case 'downloading':
      return `กำลังดาวน์โหลดเวอร์ชัน ${s.version ?? ''} ${s.percent !== null ? `(${s.percent}%)` : ''}`.trim()
    case 'available':
      return `มีเวอร์ชันใหม่ ${s.version ?? ''}`
    case 'downloaded':
      return `เวอร์ชัน ${s.version ?? ''} พร้อมติดตั้งแล้ว`
    case 'up-to-date':
      return 'ใช้เวอร์ชันล่าสุดอยู่แล้ว'
    case 'error':
      return 'ตรวจอัปเดตไม่สำเร็จ (อาจไม่ได้ต่ออินเทอร์เน็ต) ลองใหม่ภายหลังได้'
  }
}
