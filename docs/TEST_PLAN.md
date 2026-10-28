# Test Plan

สัญลักษณ์: ✅ ทดสอบแล้วผ่าน (มีหลักฐาน) · ⏳ ยังไม่ได้ทดสอบ · ❌ ไม่ผ่าน · — ยังไม่มีฟีเจอร์

## 1. อัตโนมัติ
| ชุดทดสอบ | คำสั่ง | ครอบคลุม | ผลล่าสุด |
|---|---|---|---|
| Lint | `npm run lint` | ESLint ทั้งโปรเจกต์ | ✅ 2026-10-28 |
| Typecheck | `npm run typecheck` | main/preload/shared, renderer, e2e | ✅ 2026-10-28 |
| Unit | `npm test` | money, dates, status, repos (SQLite `:memory:`) — 53 tests | ✅ 2026-10-28 |
| Build | `npm run build` | electron-vite | ✅ 2026-10-28 |
| E2E | `npm run test:e2e` | เปิด Electron จริง, เพิ่ม/แก้/ลบ/Undo, ยอดรวม, รีสตาร์ทแล้วข้อมูลยังอยู่, รายการประจำ | ✅ 2026-10-28 (2 tests) |
| Installer | `npm run dist` | สร้าง NSIS `.exe` | ✅ 2026-10-28 สร้างไฟล์ได้ 115.8 MB |
| Packaged smoke | Playwright เปิด `dist/win-unpacked/MeowLife.exe` | แอปที่แพ็กแล้วเปิดได้, เปิด DB ใน `%APPDATA%\MeowLife`, IPC ทำงาน | ✅ 2026-10-28 (ครั้งเดียว ยังไม่ได้ทำเป็นสคริปต์) |

## 2. รายการตามข้อกำหนด
| หัวข้อ | สถานะ | หลักฐาน/หมายเหตุ |
|---|---|---|
| คำนวณยอดรายเดือน | ✅ | `repos.test.ts › monthly summary`, E2E (25,000 − 1,234.56 = 23,765.44) |
| กรณีขอบของวันที่ (31→30/28/29, ข้ามปี, leap year) | ✅ | `dates.test.ts`, `status.test.ts` |
| เปลี่ยนสถานะการชำระ + ยอดรวม | ✅ | `repos.test.ts › tracks paid date`, E2E |
| ข้อมูลไม่หายเมื่อเปิดแอปใหม่ | ✅ | E2E restart |
| Validation ข้อมูลผิด (ทศนิยม 3 ตำแหน่ง, วันที่ไม่มีจริง, ฟิลด์แปลกปลอม) | ✅ | `repos.test.ts › input validation`, E2E |
| Renderer ไม่มีสิทธิ์ Node (`require` undefined) | ✅ | E2E |
| นำเข้า Excel/CSV + กันซ้ำ | — | M2 |
| Backup/Restore | — | M2 |
| Offline → Online → Sync, Conflict, Retry | — | M4 |
| Firestore Rules ระหว่าง UID ต่างกัน | — | M4 (จะใช้ Firestore Emulator + @firebase/rules-unit-testing) |
| ติดตั้ง EXE จริงด้วยตัวติดตั้ง (double-click → Install) | ⏳ | สร้างไฟล์แล้ว ยังไม่ได้รันตัวติดตั้งบนเครื่อง |
| อัปเดตจากเวอร์ชันเก่า ข้อมูลไม่หาย | — | M5 |
| CI บน GitHub Actions | ⏳ | เขียน workflow แล้ว ยังไม่มี repo บน GitHub |
| Keyboard navigation | ⏳ บางส่วน | E2E ใช้ Ctrl+N และ Esc ผ่าน; ยังไม่ได้ไล่ Tab ทั้งหน้าด้วยมือ |
| ข้อความไทยไม่ล้นที่ 900×600 | ⏳ | ตรวจด้วยภาพหน้าจอที่ 1200×800 แล้ว ยังไม่ได้ตรวจที่ขนาดเล็กสุด |

## 3. Checklist ทดสอบด้วยมือ (ก่อนทุก Release)
- [ ] ติดตั้งจาก `MeowLife-Setup-x.y.z.exe` บนเครื่องที่ไม่เคยติดตั้ง → SmartScreen → Run anyway → เปิดได้
- [ ] เพิ่มรายรับ 1, รายจ่ายจ่ายแล้ว 1, บิลยังไม่จ่ายที่มีวันครบกำหนดพรุ่งนี้ 1 → สถานะ "อีก 1 วันครบกำหนด"
- [ ] ปิดแอป → เปิดใหม่ → ข้อมูลยังอยู่
- [ ] กดลบ → ยืนยัน → เลิกทำ → รายการกลับมา
- [ ] ย่อหน้าต่างเล็กสุด (900×600) → ไม่มีข้อความถูกตัด/ซ้อน
- [ ] ใช้แค่คีย์บอร์ด (Tab/Shift+Tab/Enter/Esc) เพิ่มและแก้รายการได้
- [ ] ถอนการติดตั้ง → `%APPDATA%\MeowLife` ยังอยู่ → ติดตั้งใหม่ → ข้อมูลกลับมา
