import type { EntryKind } from '@shared/types'

/**
 * Built-in categories and payment methods.
 * IDs are fixed so two devices that sync later do not end up with duplicate defaults.
 * These are categories, not sample transactions — the app starts with no money data.
 */
export const DEFAULT_CATEGORIES: ReadonlyArray<{ id: string; kind: EntryKind; name: string; icon: string }> = [
  { id: 'c0000000-0000-4000-8000-000000000001', kind: 'expense', name: 'อาหาร', icon: '🍚' },
  { id: 'c0000000-0000-4000-8000-000000000002', kind: 'expense', name: 'ที่พัก/ค่าเช่า', icon: '🏠' },
  { id: 'c0000000-0000-4000-8000-000000000003', kind: 'expense', name: 'ค่าน้ำค่าไฟ', icon: '💡' },
  { id: 'c0000000-0000-4000-8000-000000000004', kind: 'expense', name: 'เดินทาง', icon: '🚌' },
  { id: 'c0000000-0000-4000-8000-000000000005', kind: 'expense', name: 'บัตรเครดิต', icon: '💳' },
  { id: 'c0000000-0000-4000-8000-000000000006', kind: 'expense', name: 'สมาชิก/บริการ', icon: '📺' },
  { id: 'c0000000-0000-4000-8000-000000000007', kind: 'expense', name: 'ช้อปปิ้ง', icon: '🛍️' },
  { id: 'c0000000-0000-4000-8000-000000000008', kind: 'expense', name: 'สุขภาพ', icon: '🩺' },
  { id: 'c0000000-0000-4000-8000-000000000009', kind: 'expense', name: 'อื่น ๆ', icon: '📦' },
  { id: 'c0000000-0000-4000-8000-000000000101', kind: 'income', name: 'เงินเดือน', icon: '💰' },
  { id: 'c0000000-0000-4000-8000-000000000102', kind: 'income', name: 'รายได้เสริม', icon: '✨' },
  { id: 'c0000000-0000-4000-8000-000000000103', kind: 'income', name: 'อื่น ๆ', icon: '🎁' }
]

export const DEFAULT_PAYMENT_METHODS: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'a0000000-0000-4000-8000-000000000001', name: 'เงินสด' },
  { id: 'a0000000-0000-4000-8000-000000000002', name: 'โอนธนาคาร' },
  { id: 'a0000000-0000-4000-8000-000000000003', name: 'บัตรเครดิต' },
  { id: 'a0000000-0000-4000-8000-000000000004', name: 'พร้อมเพย์/QR' },
  { id: 'a0000000-0000-4000-8000-000000000005', name: 'ตัดบัญชีอัตโนมัติ' }
]
