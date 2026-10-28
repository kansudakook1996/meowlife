# ADR 0005 — Local-first + Firebase (Auth/Firestore ใน renderer)

- สถานะ: ยอมรับบางส่วน (2026-10-28) — ทำแล้ว: Auth + ทดสอบการเชื่อมต่อ / ยังไม่ทำ: sync ข้อมูลบัญชี (M4)

## การตัดสินใจ
1. **SQLite ในเครื่องเป็นแหล่งข้อมูลหลัก** แอปทำงานได้ 100% โดยไม่ล็อกอิน
2. **Firebase JS SDK ทำงานใน renderer** (เปลี่ยนจากแผนเดิมที่จะใช้ใน main process)
   - เหตุผล: Firebase Auth จำการล็อกอินข้ามการเปิดแอปได้ด้วย `indexedDBLocalPersistence` ซึ่งมีเฉพาะสภาพแวดล้อมเบราว์เซอร์;
     ใน Node ต้องเขียน persistence เองด้วย API ภายในที่ไม่รองรับอย่างเป็นทางการ
   - ราคาที่จ่าย: เปิด CSP `connect-src` ให้ 3 host เท่านั้น — `identitytoolkit.googleapis.com`,
     `securetoken.googleapis.com`, `firestore.googleapis.com`
   - renderer ยังเข้าถึง SQLite/ไฟล์ไม่ได้ (ต้องผ่าน IPC เหมือนเดิม)
   - โหลด SDK แบบ lazy (`import()`) เฉพาะเมื่อเปิดการ์ดบัญชี จึงไม่ทำให้แอปเปิดช้า
3. **Config ของ Web app อยู่ใน `.env` ที่ commit** — เป็นข้อมูลสาธารณะ และจำเป็นสำหรับตัวติดตั้งที่ CI สร้าง;
   `.env.local` (ignored) ใช้ทับค่าในเครื่องได้ ไม่มี Secret ใด ๆ ในแอป
4. Sync (M4, ยังไม่ทำ): renderer ดึงแถว `dirty = 1` ผ่าน IPC → เขียน `users/{uid}/{table}/{id}` → แจ้ง main ให้ล้าง dirty
   - Conflict: last-write-wins ตาม `updated_at` แต่เวอร์ชันที่แพ้เก็บใน `sync_conflicts` และแจ้งผู้ใช้
   - Retry: backoff 5s → 15s → 60s → 5m และแสดงสถานะใน UI
5. Security Rules: เฉพาะ `request.auth.uid == uid`, จำกัดชื่อ collection, ตรวจ `id`/`updatedAt`/ขนาด (`firestore.rules`)

## ยังต้องทำ
- เทสต์ Rules อัตโนมัติด้วย Firestore Emulator + `@firebase/rules-unit-testing` (ต้องติดตั้ง Java ก่อน)
- ตอนนี้ตรวจ Rules ด้วย (ก) ปุ่มทดสอบในแอป และ (ข) REST probe แบบไม่ล็อกอินที่ต้องได้ 403

## ทางเลือกที่ไม่เลือก
- Firestore offline persistence อย่างเดียว (ไม่มี SQLite): ข้อมูลผูกกับ Firebase, รายงานในเครื่องทำได้จำกัด
- Firebase ใน main process: ต้องทำ Auth persistence เอง (ดูข้อ 2)
