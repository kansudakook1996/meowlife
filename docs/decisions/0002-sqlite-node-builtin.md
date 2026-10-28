# ADR 0002 — ใช้ `node:sqlite` ที่มากับ Electron แทน better-sqlite3

- สถานะ: ยอมรับ (2026-10-28)

## บริบท
ต้องการ SQLite ใน main process. ตัวเลือกยอดนิยม `better-sqlite3` เป็น native module
ต้องตรงกับ ABI ของ Electron ทุกเวอร์ชัน และถ้าไม่มี prebuilt ต้องคอมไพล์ด้วย Visual Studio Build Tools + Python
ซึ่งเครื่องนี้ไม่มี และเป็นภาระมากสำหรับผู้ดูแลมือใหม่

## การทดลองจริง
```
ELECTRON_RUN_AS_NODE=1 electron -e "require('node:sqlite') ..."
→ node 24.22.1 electron 44.10.0
→ sqlite OK { v: '3.53.4', s: 5 }
```
`node:sqlite` (DatabaseSync) ใช้งานได้ใน Electron 44 โดยไม่ต้องติดตั้งอะไรเพิ่ม

## การตัดสินใจ
ใช้ `node:sqlite` (`DatabaseSync`) ใน main process ผ่าน repository functions ที่รับ `Db` เป็นพารามิเตอร์

## ข้อดี
- ไม่มี native compile, ไม่ต้อง `electron-rebuild`, CI บน Windows ง่าย
- Unit test รันบน Node 24 ปกติด้วย `:memory:` ได้เลย

## ความเสี่ยงและวิธีรับมือ
- สถานะ API ใน Node 24 ยังเป็น "Release candidate" → API อาจเปลี่ยนเล็กน้อยใน Electron รุ่นถัดไป
  - SQL ทั้งหมดอยู่ใน `src/main/db/` จุดเดียว ถ้าต้องเปลี่ยนเป็น better-sqlite3 API คล้ายกันมาก (prepare/run/get/all)
- ไม่มี SQLCipher (เข้ารหัสฐานข้อมูล) — บันทึกไว้ใน ARCHITECTURE.md ตามจริง
- ทุกครั้งที่อัปเกรด Electron ให้รันทดสอบ `node:sqlite` และ E2E ก่อน
