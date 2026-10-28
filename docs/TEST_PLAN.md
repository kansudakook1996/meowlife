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
| ติดตั้ง EXE จาก GitHub Release | ✅ 2026-10-28 | ดาวน์โหลด v0.1.0 จาก Release (sha512 ตรงกับ `latest.yml`) → `/S` → ลงที่ `C:\Program Files\MeowLife` → เปิดได้ (ทดสอบด้วยการติดตั้งเงียบ ยังไม่ได้ทดสอบดับเบิลคลิกผ่านหน้าจอติดตั้ง) |
| อัปเดตจากเวอร์ชันเก่า ข้อมูลไม่หาย | ✅ 2026-10-28 | v0.1.0 ที่ติดตั้งแล้ว + รายการทดสอบ ฿99.50 → แอปตรวจพบ v0.1.2 → ดาวน์โหลด → "รีสตาร์ทเพื่ออัปเดต" → exe/registry เป็น 0.1.2 → รายการทดสอบยังอยู่ครบ. **พบปัญหา**: หน้าต่างติดตั้งเต็มรูปแบบโผล่และรอให้กด Finish → แก้ใน 0.1.3 (`quitAndInstall(true, true)`) ยังไม่ได้ทดสอบอัปเดตแบบเงียบ |
| CI บน GitHub Actions | ✅ 2026-10-28 | CI ผ่านทุก push; Release v0.1.2 ผ่าน (draft → upload → publish, ไม่ซ้ำ) |
| Firebase: สร้างบัญชี + ล็อกอิน + ปุ่ม "ทดสอบการเชื่อมต่อ" | ✅ 2026-10-28 | เจ้าของทดสอบเองในแอป v0.1.4 ที่ติดตั้งจริง: ผ่านครบ 4 ข้อ (เข้าสู่ระบบ, บันทึก, อ่าน, กันคนอื่นอ่าน) + REST probe แบบไม่ล็อกอินได้ 403 |
| Firestore Rules ระหว่าง UID ต่างกัน (อัตโนมัติ) | ⏳ | ตรวจด้วยปุ่มในแอปแล้ว แต่ยังไม่มีเทสต์อัตโนมัติด้วย Emulator (ต้องติดตั้ง Java) |
| Offline → บันทึก → Online → Sync | ✅ (จำลอง) | `src/main/db/sync.test.ts` — Firestore จำลองในหน่วยความจำ + SQLite จริง; **ยังไม่ได้ทดสอบกับ Firestore จริงบน 2 เครื่อง** |
| Conflict (2 เครื่องแก้พร้อมกัน, ผู้ชนะทั้งสองทาง, ใช้อีกเวอร์ชัน) และไม่เกิดซ้ำ | ✅ (จำลอง) | `sync.test.ts › conflicts` |
| Retry (backoff 5s/15s/60s/5min) | ✅ (ตรรกะ) | `retryDelayMs` ผ่านเทสต์; ตัวจับเวลาใน UI ยังไม่ได้ทดสอบอัตโนมัติ |
| รายการประจำบน 2 เครื่องไม่ซ้ำ ไม่ฟื้นของที่จ่ายแล้ว | ✅ (จำลอง) | `sync.test.ts › recurring items` |
| เครื่องผูกกับบัญชีอื่นไม่ซิงก์ / เอกสารจากคลาวด์ไม่ถูกต้องถูกข้าม | ✅ | `sync.test.ts › safety` |
| อัปเกรดฐานข้อมูล v1 → v2 (สำรองก่อน ข้อมูลครบ) | ✅ | `connection.test.ts › upgrade` |
| Backup/Restore (ไฟล์เสีย/เวอร์ชันใหม่กว่าถูกปฏิเสธ, สำรองก่อนกู้, กู้ไฟล์ v1 ได้, สำรองรายวัน) | ✅ | `backupRepo.test.ts` + E2E `data.spec.ts` |
| นำเข้า CSV/Excel (preview, ผิดพลาด, ซ้ำ, สร้างหมวด, ส่งออกแล้วนำเข้ากลับได้) | ✅ | `importMap.test.ts`, `spreadsheet.test.ts` (สร้างไฟล์ .xlsx จริงในเทสต์), `data.test.ts`, E2E; **ยังไม่ได้ลองกับไฟล์ Excel จริงของเจ้าของ** |
| รายงาน/แนวโน้ม | ✅ | `trend.test.ts`, `data.test.ts › monthlyTotals`, E2E |
| Keyboard navigation | ⏳ บางส่วน | E2E ใช้ Ctrl+N และ Esc ผ่าน; ยังไม่ได้ไล่ Tab ทั้งหน้าด้วยมือ |
| ข้อความไทยไม่ล้นที่ 900×600 | ✅ 2026-10-28 | `e2e/layout.spec.ts` ตรวจทุกหน้า + ภาพหน้าจอ |

## 3. Checklist ทดสอบด้วยมือ (ก่อนทุก Release)
- [ ] ติดตั้งจาก `MeowLife-Setup-x.y.z.exe` บนเครื่องที่ไม่เคยติดตั้ง → SmartScreen → Run anyway → เปิดได้
- [ ] เพิ่มรายรับ 1, รายจ่ายจ่ายแล้ว 1, บิลยังไม่จ่ายที่มีวันครบกำหนดพรุ่งนี้ 1 → สถานะ "อีก 1 วันครบกำหนด"
- [ ] ปิดแอป → เปิดใหม่ → ข้อมูลยังอยู่
- [ ] กดลบ → ยืนยัน → เลิกทำ → รายการกลับมา
- [ ] ย่อหน้าต่างเล็กสุด (900×600) → ไม่มีข้อความถูกตัด/ซ้อน
- [ ] ใช้แค่คีย์บอร์ด (Tab/Shift+Tab/Enter/Esc) เพิ่มและแก้รายการได้
- [ ] ถอนการติดตั้ง → `%APPDATA%\MeowLife` ยังอยู่ → ติดตั้งใหม่ → ข้อมูลกลับมา
