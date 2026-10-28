# Project Status

อัปเดตล่าสุด: 2026-10-28 · เวอร์ชัน 0.1.0 (ยังไม่ออก Release) · **ยังไม่ใช่ Production-ready**

## Roadmap
| Milestone | เนื้อหา | สถานะ |
|---|---|---|
| **M0** โครงโปรเจกต์ | Electron + React + TS + Vite, lint/test/build, เอกสาร Context, ADR | ✅ เสร็จ |
| **M1** แกนบัญชี | SQLite + migration, รายการ CRUD/ค้นหา/กรอง, สถานะ, Dashboard, รายการประจำ, UI ไทย + แมว | ✅ เสร็จ (ดูข้อจำกัดด้านล่าง) |
| **M2** ข้อมูลเข้า-ออก | นำเข้า Excel/CSV (Preview, Validation, กันซ้ำ, รายงานข้อผิดพลาด), Export CSV, Backup/Restore, จัดการหมวดหมู่ | ⏭️ ถัดไป |
| **M3** รายงาน | รายงานรายเดือน, กราฟหมวดหมู่, แนวโน้ม 6–12 เดือน | ⏳ |
| **M4** บัญชี + Sync | Firebase Auth, Firestore sync, Retry, Conflict, Rules + Emulator tests | ⏳ (รอ Firebase project) |
| **M5** Release + Update | ไอคอนแอป, GitHub repo, CI จริง, Release จาก tag, electron-updater, ทดสอบอัปเดตข้อมูลไม่หาย | ⏳ (รอ GitHub repo) |
| **M6+** Personal Portal | Calendar, Journal, Tasks, Goals, Habits, Notes, Insights, Reminder, Cat Companion, Settings | ⏳ |

## เสร็จแล้ว (ตรวจสอบจริง)
- `npm run verify` ผ่าน (lint, typecheck 3 configs, 53 unit tests, build)
- `npm run test:e2e` ผ่าน 2 tests บน Electron จริง
- `npm run dist` สร้าง `dist/MeowLife-Setup-0.1.0.exe` ได้ และแอปที่แพ็กแล้วเปิดได้ (smoke test)

## ยังไม่ได้ทำ / ยังไม่ได้ทดสอบ
- ยังไม่ได้รันตัวติดตั้ง `.exe` จริงบนเครื่อง (สร้างไฟล์แล้วเท่านั้น)
- ยังไม่มีไอคอนแอป (ใช้ไอคอน Electron เริ่มต้น)
- ยังไม่มีหน้าจัดการหมวดหมู่/ช่องทางชำระ (มี API สร้างหมวดแล้ว แต่ยังไม่มี UI)
- ยังไม่มีการตั้งค่า (ธีม, รูปแบบวันที่, จำนวนวัน "ใกล้ครบกำหนด")
- GitHub Actions ยังไม่เคยรัน (ยังไม่มี repo)
- ยังไม่ได้ทดสอบที่หน้าต่างขนาดเล็กสุด 900×600 และการใช้คีย์บอร์ดทั้งหน้า
- Renderer bundle ~650 KB ยังไม่ได้ปรับขนาด

## ติดขัด / รอเจ้าของโปรเจกต์
1. **ภาพ/ไฟล์ Excel เดิม** — ยังไม่ได้รับ (ต้องใช้ออกแบบการนำเข้าใน M2)
2. **GitHub account + repo** — ทำตาม `GITHUB_RELEASE_TH.md` ขั้นที่ 1–3
3. **Firebase project** — ทำตาม `FIREBASE_SETUP_TH.md` ขั้นที่ 1–5
4. **อีเมลใน commit** — commit แรกใช้ Gmail ของเจ้าของ ต้องเปลี่ยนเป็น noreply ก่อน push ขึ้น Public repo
