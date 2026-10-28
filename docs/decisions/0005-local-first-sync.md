# ADR 0005 — Local-first + Firestore sync (แผน, ทำใน M4)

- สถานะ: เสนอ (2026-10-28) — ยังไม่ได้ implement

## การตัดสินใจที่เสนอ
- SQLite ในเครื่องเป็นแหล่งข้อมูลหลัก แอปทำงานได้ 100% โดยไม่ล็อกอิน
- เมื่อล็อกอิน Firebase Auth: sync แถวที่ `dirty = 1` ไป `users/{uid}/{table}/{id}`
- ใช้ Firebase JS SDK (modular) ใน **renderer** หรือ main? → เลือก **main process** ผ่าน Firebase JS SDK
  เพื่อให้ sync เดินต่อแม้หน้าเปลี่ยน และไม่ต้องเปิด CSP `connect-src` ใน renderer
  (ต้องทดลองว่า Auth persistence ทำงานใน Node — ถ้าไม่ได้ ให้ใช้ Auth ใน renderer แล้วส่ง ID token ไป main
  ผลการทดลองต้องบันทึกที่นี่ก่อนเริ่มเขียนจริง)
- Conflict: Last-write-wins ตาม `updated_at` **แต่** เวอร์ชันที่แพ้ถูกเก็บใน `sync_conflicts` และแจ้งผู้ใช้
- Retry: backoff 5s → 15s → 60s → 5m, แสดงสถานะใน UI
- Security Rules: อ่าน/เขียนได้เฉพาะ `request.auth.uid == uid` + ตรวจชนิดข้อมูล (ดู `firestore.rules`)

## ทางเลือก
- Firestore offline persistence ของ SDK อย่างเดียว (ไม่มี SQLite): ง่ายกว่า แต่ข้อมูลผูกกับ Firebase
  และ query/รายงานในเครื่องทำได้จำกัด — ไม่เลือก
