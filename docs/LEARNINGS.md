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

## 2026-10-28 — Agent push เองไม่ได้ (ต้องล็อกอิน GitHub)
- **อาการ**: `fatal: Cannot prompt because user interactivity has been disabled`
- **สาเหตุ**: shell ของ agent เปิดหน้าต่าง Git Credential Manager ไม่ได้
- **แก้**: รัน `git push` ครั้งแรกใน Terminal panel ของผู้ใช้ → ผู้ใช้ล็อกอินผ่านเบราว์เซอร์ → GCM จำไว้ใน
  Windows Credential Manager ครั้งต่อไป push จาก agent ได้เลย (ไม่มี Token อยู่ในโปรเจกต์)

## 2026-10-28 — ภาพอ้างอิงของผู้อื่นเกือบติดไปกับ commit
- **อาการ**: `git add -A` เก็บโฟลเดอร์ `picture ref/` (ภาพ ©Sweet Summer) เข้า commit
- **แก้**: `git rm -r --cached "picture ref"` + เพิ่มใน `.gitignore` ก่อน push (ไม่เคยขึ้น GitHub)
- **ป้องกัน**: ดู `git status` ทุกครั้งก่อน commit; ภาพอ้างอิงให้เก็บใน `picture ref/` เท่านั้น

## 2026-10-28 — ESLint ไม่รู้จักไฟล์ `.cjs`
- **อาการ**: `'require' is not defined` ใน `scripts/make-icon.cjs`
- **แก้**: เพิ่ม block ใน `eslint.config.mjs` สำหรับ `scripts/**/*.cjs` (globals node, commonjs)
- **ข้อสังเกต**: `npm run verify` หยุดที่ lint ทำให้ build ไม่รัน → E2E รอบนั้นทดสอบ build เก่า ต้องรันใหม่หลังแก้

## 2026-10-28 — Release v0.1.0 ซ้ำ 2 อัน → ลิงก์ดาวน์โหลดเป็น 404
- **อาการ**: มี Release tag `v0.1.0` สองอัน (อันหนึ่งมีแค่ `.blockmap`) และ `/releases/download/v0.1.0/latest.yml` ตอบ 404
- **สาเหตุ**: electron-builder อัปโหลดหลายไฟล์พร้อมกัน แต่ละไฟล์สร้าง Release เอง
- **แก้**: workflow สร้าง draft ด้วย `gh release create` ก่อน → electron-builder (`releaseType: draft`) อัปโหลดเข้าอันเดียว → `gh release edit --draft=false`
- **ยังค้าง**: Release ซ้ำของ v0.1.0 ต้องลบด้วยมือบนเว็บ

## 2026-10-28 — `-c.publish.releaseType=draft` ทำ build พัง
- **อาการ**: `ENOENT: no such file or directory, open '.publish.releaseType=draft'` (v0.1.1 ไม่ได้ออก)
- **สาเหตุ**: `-c` ของ electron-builder คือ "path ไฟล์ config" ต้องเขียนเป็น `--config.publish.releaseType=draft`
- **แก้**: ย้ายค่าไปไว้ใน `electron-builder.yml`; ทดสอบคำสั่ง CI ในเครื่องก่อน push tag

## 2026-10-28 — ข้อความ commit ที่มี `"` ใน PowerShell ทำ commit ล้ม แต่ tag ยังถูกสร้าง
- **สาเหตุ**: PowerShell 5.1 ส่ง here-string ที่มีเครื่องหมายคำพูดให้ git ผิดรูป และคำสั่งต่อ ๆ ไปใน `;` ยังรันต่อ
- **แก้/ป้องกัน**: ใช้ `git commit -F <ไฟล์>` และเช็ก `$LASTEXITCODE` ก่อน tag ทุกครั้ง

## 2026-10-28 — ติดตั้งแบบเงียบจาก shell ของ agent ไม่ได้ผล / สคริปต์ .ps1 ถูกบล็อก
- shell ของ agent รันตัวติดตั้งแล้วได้ exit 0 แต่ไม่มีอะไรถูกติดตั้ง (sandbox) → รันใน Terminal ของผู้ใช้แทน
- Terminal ของผู้ใช้ห้ามรันสคริปต์ (`running scripts is disabled`) → **ไม่แก้ Execution Policy** ใช้คำสั่งตรงแทน
- `/S` ของ assisted installer ติดตั้งแบบทุกผู้ใช้ (Program Files) จึงต้องผ่าน UAC

## 2026-10-28 — อัปเดตแล้วหน้าต่างติดตั้งค้างรอกด Finish
- **สาเหตุ**: `autoUpdater.quitAndInstall(false, true)` กับ NSIS แบบ assisted (`oneClick: false`) จะแสดงหน้าติดตั้งเต็ม
- **แก้**: `quitAndInstall(true, true)` (เงียบ + เปิดแอปใหม่) ใน 0.1.3 — มีผลตั้งแต่การอัปเดต *จาก* 0.1.3 ขึ้นไป

## 2026-10-28 — npm 11 ไม่รัน install scripts อัตโนมัติ
- **อาการ**: `install-scripts ... electron-winstaller ... not yet covered by allowScripts`
- **ผล**: ไม่กระทบ (เป็น dependency ของ Squirrel ที่เราไม่ได้ใช้) Electron ดาวน์โหลด binary เองเมื่อรันครั้งแรก
