# ADR 0004 — ย้ายโปรเจกต์ไป `C:\dev\meowlife`

- สถานะ: ยอมรับ (2026-10-28) — เจ้าของโปรเจกต์เลือกเอง

## บริบท
โฟลเดอร์เดิม `C:\Users\kansu\OneDrive\เดสก์ท็อป\Personal Planing`
1. อยู่ใน OneDrive → OneDrive พยายามซิงก์ `node_modules` (หลายหมื่นไฟล์) และล็อกไฟล์ระหว่าง build ทำให้ `EBUSY`/`EPERM`
2. path มีอักษรไทย → เครื่องมือบางตัว (NSIS, native build tools, บาง CLI) จัดการ path non-ASCII ไม่ดี

## การตัดสินใจ
เก็บโค้ดที่ `C:\dev\meowlife` (ไม่อยู่ใน OneDrive, path ASCII) และสำรองโค้ดผ่าน Git + GitHub แทน OneDrive

## หมายเหตุ
โฟลเดอร์เดิมใน OneDrive ว่างและไม่ได้ถูกแก้ไข ลบทิ้งได้ถ้าไม่ใช้
