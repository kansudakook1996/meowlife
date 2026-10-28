# Architecture

## ภาพรวม

```
┌─────────────── Renderer (React, sandboxed, ไม่มี Node) ───────────────┐
│ pages/  components/  hooks/          เรียก window.meow.*               │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ contextBridge (preload/index.ts)
                                │ เปิดเฉพาะเมธอดที่ประกาศใน shared/ipc.ts
┌───────────────────────────────▼──────────────────────────────────────┐
│ Main Process (Node 24 ใน Electron 44)                                 │
│  ipc/handlers.ts ── zod validate (shared/schemas.ts)                  │
│        │                                                              │
│  db/repositories ── db/migrations ── node:sqlite (DatabaseSync)       │
│        │                         ไฟล์: %APPDATA%/MeowLife/meowlife.db │
│  sync/ (M4) ── Firebase Auth + Firestore                              │
│  updater (M5) ── electron-updater ← GitHub Releases                   │
└──────────────────────────────────────────────────────────────────────┘
          shared/  ← money, dates, status, summary, types (pure, tested)
```

## โฟลเดอร์
| Path | หน้าที่ |
|---|---|
| `src/main/index.ts` | สร้างหน้าต่าง, ตั้งค่าความปลอดภัย, เปิดฐานข้อมูล, ลงทะเบียน IPC |
| `src/main/db/connection.ts` | เปิด/ปิด SQLite, PRAGMA (WAL, foreign_keys) |
| `src/main/db/migrations.ts` | Migration แบบมีเลขเวอร์ชัน (`PRAGMA user_version`) |
| `src/main/db/*Repo.ts` | SQL ของแต่ละตาราง รับ `DatabaseSync` เป็นพารามิเตอร์ |
| `src/main/ipc/handlers.ts` | แปลง IPC → validate → repository |
| `src/preload/index.ts` | `contextBridge.exposeInMainWorld('meow', api)` |
| `src/renderer/` | React UI |
| `src/shared/` | โค้ดที่ไม่ขึ้นกับ Electron ใช้ได้ทั้ง main และ renderer |

## Data flow: เพิ่มรายการ
1. ผู้ใช้กรอกฟอร์ม → renderer แปลง "1,250.50" เป็น `125050` สตางค์ด้วย `parseBahtToSatang`
2. `window.meow.transactions.create(input)` → `ipcRenderer.invoke('tx:create', input)`
3. Main: `TransactionInputSchema.parse(input)` (ปฏิเสธฟิลด์แปลกปลอม/ค่าไม่ถูกต้อง)
4. `transactionRepo.create(db, input)` → INSERT พร้อม `dirty = 1` (รอซิงก์)
5. ส่งผลกลับ renderer → โหลดรายการ/สรุปใหม่

## Data flow: รายการประจำ
- `recurring_rules` เก็บแม่แบบ (วันที่ของเดือน 1–31, เดือนเริ่ม, เดือนสิ้นสุด)
- เมื่อเปิดดูเดือนใด main จะเรียก `ensureRecurringForMonth(db, 'YYYY-MM')`
  สร้างรายการของเดือนนั้นแบบ idempotent (UNIQUE `recurring_rule_id + recurring_period`)
- วันที่ 31 ในเดือนที่มี 30 วัน → ใช้วันสุดท้ายของเดือน
- ถ้าผู้ใช้ลบรายการที่สร้างอัตโนมัติ แถวยังอยู่แบบ soft delete จึงไม่ถูกสร้างซ้ำ

## ความปลอดภัย
ดู `.claude/rules/security.md` — สรุป: sandbox + contextIsolation, CSP, IPC whitelist + zod,
ฐานข้อมูลใน userData

**ความปลอดภัยของฐานข้อมูลในเครื่อง (ตามจริง):** ไฟล์ SQLite *ไม่ได้เข้ารหัส*
ใครที่เข้าถึงบัญชี Windows ของคุณได้ก็เปิดอ่านไฟล์ได้ การป้องกันหลักคือรหัสผ่าน Windows
และ BitLocker/Device Encryption ของเครื่อง การเข้ารหัสฐานข้อมูลอาจพิจารณาในอนาคต (ต้องมี ADR)

## Sync (ออกแบบไว้ ทำใน M4)
- Local-first: SQLite คือแหล่งความจริงในเครื่อง ทุกการแก้ไขตั้ง `dirty = 1`, `updated_at = now`
- Push: ส่งแถว dirty ไป `users/{uid}/{collection}/{id}` แล้วล้าง dirty
- Pull: ดึงเอกสารที่ `updated_at` > `last_pulled_at`
- Conflict: ถ้าแถวในเครื่อง dirty และฝั่ง cloud ใหม่กว่า → เก็บเวอร์ชันที่แพ้ไว้ในตาราง
  `sync_conflicts` และแจ้งผู้ใช้ ไม่ทิ้งเงียบ ๆ
- Retry: exponential backoff (5s, 15s, 60s, 5m) และแสดงสถานะ "ออฟไลน์ / กำลังซิงก์ / ล่าสุดเมื่อ…"

## Auto-update (`src/main/updater.ts`)
- ทำงานเฉพาะแอปที่ติดตั้งแล้ว (`app.isPackaged`); โหมดพัฒนาแสดงสถานะ `disabled`
- แหล่งอัปเดต: GitHub Releases แบบ Public ของ `kansudakook1996/meowlife` (ตั้งใน `electron-builder.yml → publish`)
  ไม่ต้องมี Token ในแอป
- ตรวจหลังเปิดแอป 10 วินาที และทุก 6 ชั่วโมง → ดาวน์โหลดเบื้องหลัง → ส่งสถานะผ่าน event `update:status`
  → renderer แสดงแถบ "รีสตาร์ทเพื่ออัปเดต" (หรือติดตั้งเองตอนปิดแอป)
- ข้อมูลผู้ใช้อยู่ `%APPDATA%\MeowLife` ซึ่งตัวอัปเดต NSIS ไม่แตะ
- เมื่อเวอร์ชันใหม่มี migration: `openDatabase` ทำสำเนา `backups/pre-migration-v{N}-{เวลา}.db` ด้วย
  `VACUUM INTO` ก่อน migrate เสมอ

## Build
- `electron-vite` build 3 ส่วน → `out/main`, `out/preload`, `out/renderer`
- `electron-builder` (NSIS) → `dist/MeowLife-Setup-x.y.z.exe`
- แพ็กเกจที่ใช้เฉพาะ renderer อยู่ใน devDependencies (Vite รวมไว้แล้ว) เพื่อให้ตัวติดตั้งเล็ก
