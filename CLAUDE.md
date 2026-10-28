# MeowLife — กติกาหลักของโปรเจกต์

MeowLife คือ Personal Portal บน Windows Desktop (Electron + React + TypeScript + SQLite + Firebase)
เริ่มจากระบบบัญชีรายรับรายจ่าย แล้วค่อยขยายเป็น Calendar / Journal / Tasks / Goals ฯลฯ

## ทุกครั้งที่เริ่ม Session
1. อ่านไฟล์นี้, `.claude/rules/*.md` ที่เกี่ยวข้อง, `docs/PROJECT_STATUS.md`, `docs/SESSION_HANDOFF.md`
2. รัน `git status` และดูไฟล์จริงก่อนแก้ ห้ามเชื่อเอกสารอย่างเดียว
3. ตรวจว่า `node -v` ≥ 24 และ `npm ci` ผ่าน (ถ้า node_modules หาย)

## ภาษา
- คุยกับเจ้าของโปรเจกต์เป็นภาษาไทย สุภาพ อธิบายศัพท์เทคนิค
- ข้อความที่ผู้ใช้เห็นในแอปทั้งหมดเป็นภาษาไทย
- ชื่อไฟล์ ตัวแปร ฟังก์ชัน และ commit message เป็นภาษาอังกฤษ

## คำสั่งหลัก
| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm run dev` | เปิดแอปโหมดพัฒนา (Hot reload) |
| `npm run lint` | ตรวจรูปแบบโค้ด (ESLint) |
| `npm run typecheck` | ตรวจ TypeScript ทั้ง main/preload/renderer |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Build โค้ดไปที่ `out/` |
| `npm run dist` | สร้าง Windows Installer (`dist/*.exe`) |
| `npm run verify` | lint + typecheck + test + build ในครั้งเดียว |

## โครงสร้าง
- `src/main/` — Main Process (Node): ฐานข้อมูล, IPC handlers, หน้าต่าง, updater
- `src/preload/` — สะพานระหว่าง main และ renderer เปิดเฉพาะ API ที่อนุญาต
- `src/renderer/` — React UI (ไม่มีสิทธิ์ Node)
- `src/shared/` — Types, schema (zod), ฟังก์ชันคำนวณเงิน/วันที่/สถานะ ใช้ร่วมกันและทดสอบง่าย
- `docs/` — เอกสารผลิตภัณฑ์ สถาปัตยกรรม คู่มือ และ ADR

## กติกาที่ห้ามละเมิด
- เงินเก็บเป็น **สตางค์ (integer)** เสมอ ห้ามใช้ float คำนวณเงิน → `src/shared/money.ts`
- วันที่เก็บเป็นสตริง `YYYY-MM-DD` (วันท้องถิ่น ไม่มี timezone)
- ลบข้อมูลแบบ soft delete (`deleted_at`) เพื่อรองรับ Undo และ Sync
- ทุก IPC ต้องผ่าน zod schema ใน `src/shared/schemas.ts` ก่อนถึงฐานข้อมูล
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` ห้ามปิด
- ห้าม commit Secret, Token, `.env.local`, ไฟล์ฐานข้อมูล หรือข้อมูลการเงินจริง
- ห้ามรายงานว่าทดสอบผ่านถ้ายังไม่ได้รันจริง ให้แนบคำสั่งและผลลัพธ์
- เปลี่ยนเทคโนโลยีหลักต้องเขียน ADR ใน `docs/decisions/`

## เมื่อจบ Milestone
อัปเดต `docs/PROJECT_STATUS.md`, `docs/SESSION_HANDOFF.md`, `docs/LEARNINGS.md`, `CHANGELOG.md`
