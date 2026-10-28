# Session Handoff

## Session 3 — 2026-10-29 (Personal Portal → v0.3.0)

### สิ่งที่ทำ
- 6 ตารางใหม่ (migration 3) + ซิงก์/Rules/สำรอง ครบ; โมดูล: ปฏิทิน, งาน, บันทึก, เป้าหมาย, นิสัย, โน้ต, สถิติ, แจ้งเตือน, แมวคู่ใจ/Badge, ตั้งค่า
- กติกากลางใน `shared/portalModel.ts`; IPC ชื่อช่อง `portal:<module>:<action>` (`portalHandlers.ts`)
- ซิงก์ทีละตาราง (`syncEngine.ts`) + `isNetworkError`; แก้ toast บังปุ่ม (มุมขวาล่าง + `pointer-events: none`)

### ข้อควรระวัง
- **อย่าแก้ migration 1–3 ที่ปล่อยไปแล้ว** (เกือบพลาดครั้งหนึ่งในเซสชันนี้ แก้คืนทันที — ตรวจด้วย `git diff -- src/main/db/migrations.ts`)
- เพิ่มตารางซิงก์ใหม่ต้องแก้พร้อมกัน: migration ใหม่, `syncModel.ts` (SYNC_TABLES/TABLE_COLUMNS/DOC_SCHEMAS), `firestore.rules`, `rules-test/` (appDocs), แล้ว Publish rules ก่อนปล่อยแอป
- `recurringItemId` ต้องใช้คีย์ `${ruleId}:${month}` เดิมเสมอ (มีรหัสนี้บนเครื่องที่ซิงก์แล้ว)
- ตั้งค่าอยู่ใน `app_settings` (ไม่ซิงก์) — ถ้าจะให้ซิงก์ ต้องออกแบบเรื่องเครื่องละค่าที่ต่างกัน (เช่น ธีม) ก่อน

### เริ่ม Session ถัดไป
1. ถามผล: Publish rules, อัปเดต 0.2.0 → 0.3.0 (อัปเดตแบบเงียบ), แจ้งเตือน Windows, ซิงก์ข้ามเครื่อง
2. ไอเดียต่อ: ลากวางในปฏิทิน, แจ้งเตือนตอนปิดแอป (ต้อง tray/startup), ซิงก์ตั้งค่า, ค้นหารวมทุกโมดูล, Code Signing

## Session 2 — 2026-10-29 (ซิงก์ Firestore + M2 + M3 → v0.2.0)

### สิ่งที่ทำ
- ซิงก์: `shared/syncModel.ts`, `shared/syncEngine.ts`, `main/db/syncRepo.ts`, migration 2, IPC `sync:*`, `lib/useSync.tsx`, `SyncPill`, ส่วนซิงก์/ข้อขัดแย้งใน `AccountCard`
- รายการประจำ: id คงที่ (`recurringItemId`) + `updated_at` epoch เพื่อไม่ซ้ำ/ไม่ฟื้นข้ามเครื่อง
- Backup/Restore (`backupRepo.ts`), สำรองรายวัน, นำเข้า (`import/xlsx.ts` อ่าน .xlsx เอง, `shared/importMap.ts`), ส่งออก (`shared/exportCsv.ts`),
  หน้า หมวดหมู่ / ข้อมูลและสำรอง / รายงาน
- Rules ใหม่ (ตรวจทุกฟิลด์) + Emulator tests (`rules-test/`, `npm run test:rules`, ติดตั้ง JDK 21 ผ่าน winget, `firebase.json`)
- `src/renderer/src/lib/firestoreRemote.ts` แยกออกมาให้ทดสอบกับ Emulator ได้

### ข้อควรระวังสำหรับ session ถัดไป
- **อย่าแก้ migration 1–2** ที่ปล่อยไปแล้ว ให้เพิ่ม migration ใหม่ (ทุกครั้งที่อัปเกรดแอปสำรอง DB ให้เอง)
- เปลี่ยนฟิลด์ของตารางที่ซิงก์ ต้องแก้ 3 ที่พร้อมกัน: `TABLE_COLUMNS`/`DOC_SCHEMAS` (`syncModel.ts`), `firestore.rules`, และเทสต์ใน `rules-test/` แล้ว Publish rules **ก่อน** ปล่อยแอป
- `npm run verify` ไม่รวม `test:rules` (ต้องใช้ Java) — รันแยก; CI มี job `rules` บน Ubuntu
- ผล `e2e/data.spec.ts` ใช้การ stub `dialog` ของ Electron — ถ้าเพิ่มหน้าต่างเลือกไฟล์ใหม่ ให้ stub แบบเดียวกัน

### เริ่ม Session ถัดไป
1. อ่านผลทดสอบซิงก์จริงของเจ้าของ (แถบสถานะ/ข้อความผิดพลาด) 2. Personal Portal (M6) ตามที่เจ้าของเลือก

## Session 1 (ต่อ) — 2026-10-28 (GitHub, Release, Auto-update, ฟอนต์/สี, Firebase ขั้น 6–8)

### สิ่งที่ทำ
- อีเมล commit เป็น noreply; repo Public `kansudakook1996/meowlife`; push ครั้งแรกผ่าน Terminal ของเจ้าของ (GCM ล็อกอินเบราว์เซอร์)
- Auto-update (`src/main/updater.ts`), สำรอง DB ก่อน migration, ไอคอนแมว (`build/icon.svg` → `npm run icon`)
- Release workflow ใหม่: draft ด้วย `gh` + Release Notes ภาษาไทยจาก CHANGELOG (`scripts/release-notes.cjs`)
- ฟอนต์ IBM Plex Sans Thai, สีเข้มขึ้น, แก้เลย์เอาต์ 900×600 (+ `e2e/layout.spec.ts`)
- Firebase: config ใน `.env`, การ์ดบัญชีออนไลน์ + ปุ่มทดสอบ (`AccountCard.tsx`, `lib/firebase.ts`), rules เพิ่ม `meta`

### ผลทดสอบจริง
| สิ่งที่ทดสอบ | ผล |
|---|---|
| `npm run verify` | ✅ 58 unit tests |
| `npx playwright test` | ✅ 4/4 (บัญชี, รายการประจำ, เลย์เอาต์ 900×600, การ์ดบัญชีออนไลน์ + ไม่มี CSP error) |
| CI บน GitHub | ✅ ทุก push |
| Release v0.1.0 | ⚠️ ซ้ำ 2 อัน → ลิงก์ tag เป็น 404 (ต้องลบอันที่มีแค่ .blockmap) |
| Release v0.1.1 | ❌ build ล้ม (`-c.publish...`) — ไม่ได้ออก, เหลือ draft ค้าง |
| Release v0.1.2, v0.1.3 | ✅ Release เดียว ไฟล์ครบ ลิงก์ 200 |
| ติดตั้ง v0.1.0 จาก Release (`/S`) | ✅ `C:\Program Files\MeowLife` |
| อัปเดต 0.1.0 → 0.1.2 ในแอปจริง | ✅ เวอร์ชันเปลี่ยน ข้อมูลทดสอบอยู่ครบ (หน้าต่างติดตั้งค้างรอ Finish → แก้ใน 0.1.3, ยังไม่ได้ทดสอบซ้ำ) |
| Firestore REST แบบไม่ล็อกอิน | ✅ 403 PERMISSION_DENIED |
| ล็อกอิน Firebase จริง + ปุ่มทดสอบ | ⏳ เจ้าของต้องสร้างบัญชีเอง (agent ไม่สร้างบัญชีแทน) |

### สภาพเครื่องเจ้าของหลังจบ
- แอปติดตั้ง v0.1.2 (จะอัปเดตเองเป็นเวอร์ชันล่าสุดเมื่อเปิด)
- ข้อมูลจริง `%APPDATA%\MeowLife` ถูกคืนเป็นแบบก่อนทดสอบ (0 รายการ)
- ฟอนต์ "Lmf_ Wanpharuehat Demo" ยังติดตั้งอยู่ในบัญชี Windows (แอปไม่ใช้แล้ว ลบได้จาก Settings → Fonts)
- `picture ref/`, `Wanpharuehat.zip` อยู่ในโฟลเดอร์โปรเจกต์ แต่ ignored

### เริ่ม Session ถัดไป
1. ถามผลขั้นที่ 7 (ทดสอบการเชื่อมต่อ) จากเจ้าของ
2. M2 (Backup/Restore, Export, จัดการหมวด, นำเข้า Excel — ยังรอไฟล์ตัวอย่าง) หรือ M4 sync จริง

## Session 1 — 2026-10-28 (M0 + M1)

### สิ่งที่ทำ
1. ตรวจ Environment: โฟลเดอร์เดิมว่าง, ไม่มี Node/Git, มี winget, Windows 10 Pro x64, พื้นที่ว่าง ~19.5 GB
2. ติดตั้ง Node.js 24.22.1 และ Git 2.56.0 ผ่าน winget (เจ้าของอนุญาต)
3. ย้ายโปรเจกต์ไป `C:\dev\meowlife` (เจ้าของเลือก, ADR 0004)
4. ทดลอง `node:sqlite` ใน Electron 44 → ใช้งานได้ (ADR 0002)
5. สร้างโครงโปรเจกต์ + ระบบบัญชี M1 + E2E + ตัวติดตั้ง + เอกสารทั้งหมด

### ไฟล์หลักที่สร้าง
- Config: `package.json`, `electron.vite.config.ts`, `vitest.config.mts`, `playwright.config.ts`, `tsconfig*.json`,
  `eslint.config.mjs`, `electron-builder.yml`, `.gitignore`, `.env.example`, `firestore.rules`, `.github/workflows/*`
- Main: `src/main/index.ts`, `src/main/db/{connection,migrations,defaults,catalogRepo,transactionRepo,recurringRepo}.ts`,
  `src/main/ipc/handlers.ts`
- Preload: `src/preload/index.ts`, `index.d.ts`
- Shared: `src/shared/{money,dates,status,summary,types,schemas,ipc}.ts` + tests
- Renderer: `App.tsx`, `pages/*`, `components/*`, `lib/*`, `styles/*`
- Tests: `src/**/*.test.ts`, `e2e/accounting.spec.ts`
- Docs: `CLAUDE.md`, `.claude/rules/*`, `docs/*`, `CHANGELOG.md`, `README.md`

### คำสั่งที่รันและผลจริง
| คำสั่ง | ผล |
|---|---|
| `npm run verify` | ✅ lint ผ่าน, typecheck ผ่าน, 53/53 unit tests ผ่าน, build ผ่าน |
| `npx playwright test` | ✅ 2/2 ผ่าน (6.3s) |
| `npm run dist` | ✅ `dist/MeowLife-Setup-0.1.0.exe` 115.8 MB (ไม่ได้ sign, ไอคอน default) |
| Playwright เปิด `dist/win-unpacked/MeowLife.exe` | ✅ เปิดได้, `isPackaged: true`, ข้อมูลที่ `%APPDATA%\MeowLife`, หมวดหมู่ 12 รายการ |

หมายเหตุ: smoke test ของแอปที่แพ็กแล้วสร้างไฟล์ฐานข้อมูลเปล่า (มีแค่หมวดหมู่เริ่มต้น) ไว้ที่ `%APPDATA%\MeowLife`

### เริ่ม Session ถัดไป
1. อ่าน `CLAUDE.md`, `docs/PROJECT_STATUS.md`, ไฟล์นี้ → `git status` → `npm ci` (ถ้าจำเป็น) → `npm run verify`
2. งานถัดไป **M2**: หน้าจัดการหมวดหมู่, Export CSV, Backup/Restore (ไฟล์ `.meowbackup` = สำเนา SQLite ผ่าน
   `VACUUM INTO` + ตรวจ schema ก่อน restore + สำรองอัตโนมัติก่อนเขียนทับ), นำเข้า CSV/Excel (รอไฟล์ตัวอย่างจากเจ้าของ;
   ไลบรารีที่พิจารณา: `exceljs` สำหรับ .xlsx และ `papaparse` สำหรับ CSV — npm `xlsx@0.18.5` เก่าและมีช่องโหว่ที่รู้จัก ไม่ใช้)
3. ระหว่างนั้นเจ้าของทำ: สร้าง GitHub repo + Firebase project ตามคู่มือ
