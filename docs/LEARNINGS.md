# Learning Log

บันทึกปัญหาที่เกิดขึ้นจริง สาเหตุ วิธีแก้ และวิธีป้องกัน

## 2026-10-28 — เครื่องไม่มี Node.js / Git
- **อาการ**: `node : The term 'node' is not recognized`
- **แก้**: ติดตั้งผ่าน `winget` (OpenJS.NodeJS.LTS 24.22.1, Git.Git 2.56.0) — PowerShell ที่เปิดอยู่ต้องโหลด PATH ใหม่
- **ป้องกัน**: คู่มือ `SETUP_WINDOWS_TH.md` ขั้นที่ 1–2

## 2026-10-28 — โปรเจกต์อยู่ใน OneDrive + path ภาษาไทย
- **ความเสี่ยง**: OneDrive ล็อกไฟล์ใน node_modules, เครื่องมือบางตัวไม่รองรับ path non-ASCII
- **แก้**: ย้ายไป `C:\dev\meowlife` (ADR 0004) — build NSIS ผ่านในครั้งแรก

## 2026-10-28 — เลือกเวอร์ชัน TypeScript
- **ปัญหา**: TypeScript ล่าสุดคือ 7.0.2 แต่ `typescript-eslint@8.72.1` ต้องการ `typescript <6.1.0`
- **แก้**: ใช้ TypeScript 6.0.3 (ADR 0001) — ตรวจ peerDependencies ด้วย `npm view <pkg> peerDependencies` ก่อนอัปเกรด

## 2026-10-28 — TypeScript 6 ฟ้อง import ไฟล์ `.css`
- **อาการ**: `TS2882: Cannot find module or type declarations for side-effect import of './styles/app.css'`
- **สาเหตุ**: TS 6 ตรวจ side-effect imports เป็นค่าเริ่มต้น
- **แก้**: เพิ่ม `src/renderer/src/env.d.ts` ที่มี `/// <reference types="vite/client" />`

## 2026-10-28 — Vite เตือนเรื่อง config loader
- **อาการ**: `ESM syntax in a file loaded as CommonJS (vitest.config.ts)` และ `__dirname` ใน config
- **แก้**: เปลี่ยนเป็น `vitest.config.mts` และใช้ `import.meta.dirname`
- **ยังค้าง**: `electron.vite.config.ts` อาจขึ้นคำเตือนคล้ายกันในอนาคต (ตอนนี้ build ผ่าน)

## 2026-10-28 — Test เขียนผิดเอง ไม่ใช่โค้ดผิด
- **อาการ**: `filters by kind, status and search text` ค้นคำว่า "อาหาร" เจอ 2 รายการแทน 1
- **สาเหตุ**: ฟังก์ชันสร้างข้อมูลทดสอบใส่หมวด "อาหาร" เป็นค่าเริ่มต้นให้ "ค่าไฟ" ด้วย
- **แก้**: ระบุ `categoryId: null` ให้ค่าไฟใน test (ตรวจแล้วว่าโค้ดค้นหาทำงานถูก)
- **ป้องกัน**: ก่อนแก้โค้ดให้ test ผ่าน ต้องดูให้แน่ว่า test คาดหวังถูกต้องหรือไม่

## 2026-10-28 — npm 11 ไม่รัน install scripts อัตโนมัติ
- **อาการ**: `install-scripts ... electron-winstaller ... not yet covered by allowScripts`
- **ผล**: ไม่กระทบ (เป็น dependency ของ Squirrel ที่เราไม่ได้ใช้) Electron ดาวน์โหลด binary เองเมื่อรันครั้งแรก
