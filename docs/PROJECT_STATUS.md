# Project Status

อัปเดตล่าสุด: 2026-10-28 · เวอร์ชันในโค้ด 0.1.4 · Release บน GitHub: v0.1.0, v0.1.2, v0.1.3, v0.1.4 (v0.1.1 build ล้ม ไม่ได้ออก) · **ยังไม่ใช่ Production-ready**

## Roadmap
| Milestone | เนื้อหา | สถานะ |
|---|---|---|
| **M0** โครงโปรเจกต์ | Electron + React + TS + Vite, lint/test/build, เอกสาร Context, ADR | ✅ เสร็จ |
| **M1** แกนบัญชี | SQLite + migration, รายการ CRUD/ค้นหา/กรอง, สถานะ, Dashboard, รายการประจำ, UI ไทย + แมว | ✅ เสร็จ |
| **M5** Release + Update | ไอคอน, GitHub repo, CI, Release จาก tag, electron-updater, สำรอง DB ก่อน migration | ✅ ส่วนใหญ่เสร็จ (ดู "ทดสอบอัปเดต" ใน TEST_PLAN) |
| **M2** ข้อมูลเข้า-ออก | นำเข้า Excel/CSV (Preview, Validation, กันซ้ำ, รายงานข้อผิดพลาด), Export CSV, Backup/Restore, จัดการหมวดหมู่ | ⏭️ ถัดไป |
| **M3** รายงาน | รายงานรายเดือน, กราฟหมวดหมู่, แนวโน้ม 6–12 เดือน | ⏳ |
| **M4** บัญชี + Sync | Firebase Auth ✅, ทดสอบการเชื่อมต่อ ✅, Firestore sync ⏳, Retry ⏳, Conflict ⏳, Rules + Emulator tests ⏳ | 🟡 บางส่วน (รอเจ้าของทดสอบล็อกอินจริง) |
| **M6+** Personal Portal | Calendar, Journal, Tasks, Goals, Habits, Notes, Insights, Reminder, Cat Companion, Settings | ⏳ |

## เสร็จแล้ว (ตรวจสอบจริง)
- `npm run verify` ผ่าน (lint, typecheck 3 configs, 55 unit tests, build)
- E2E 3 tests ผ่าน (บัญชี, รายการประจำ, เลย์เอาต์ 900×600) ทั้งในเครื่องและบน GitHub Actions
- GitHub: repo Public `kansudakook1996/meowlife`, CI ผ่าน, Release v0.1.0 สร้างอัตโนมัติจาก tag
- ติดตั้ง v0.1.0 จาก Release จริงบนเครื่องเจ้าของ (`C:\Program Files\MeowLife`) และเปิดใช้งานได้
- ฟอนต์ "Lmf_ Wanpharuehat Demo" ติดตั้งให้เฉพาะบัญชี Windows ของเจ้าของ (ไม่แจกต่อ)

## ยังไม่ได้ทำ / ข้อจำกัด
- Release v0.1.0 มี 2 อันซ้ำกัน (บั๊กของ workflow เดิม แก้แล้วใน v0.1.1+) — อันที่มีแค่ `.blockmap` ต้องลบด้วยมือ
- ตัวติดตั้งไม่ได้ Code Sign → SmartScreen เตือน
- ติดตั้งแบบเงียบ (`/S`) ลงแบบทุกผู้ใช้ (Program Files) → การอัปเดตอาจถาม UAC
- ยังไม่มีหน้าจัดการหมวดหมู่/ช่องทางชำระ, หน้าตั้งค่าธีม/รูปแบบวันที่
- ยังไม่ได้ไล่ใช้คีย์บอร์ดทั้งหน้าด้วยมือ

## ติดขัด / รอเจ้าของโปรเจกต์
1. **ภาพ/ไฟล์ Excel เดิม** — ยังไม่ได้รับ (ต้องใช้ออกแบบการนำเข้าใน M2)
2. **ลบ Release v0.1.0 ที่ซ้ำ** — อันที่มีแค่ `MeowLife-Setup-0.1.0.exe.blockmap`
3. **Firebase** — Publish `firestore.rules` เวอร์ชันล่าสุดอีกครั้ง แล้วสร้างบัญชี + กด "ทดสอบการเชื่อมต่อ" ในแอป
   (`FIREBASE_SETUP_TH.md` ขั้นที่ 5 อีกครั้ง และขั้นที่ 7)
4. **Release draft v0.1.1 ที่ค้าง** — ลบได้ที่หน้า Releases (ไม่กระทบอะไร)
