# Data Model

## 1. หลักการ
- **เงิน**: `INTEGER` หน่วยสตางค์ (1 บาท = 100) — ไม่มี float ในฐานข้อมูลหรือการคำนวณ
- **วันที่**: `TEXT` รูปแบบ `YYYY-MM-DD` เป็นวันท้องถิ่น; เวลาบันทึก (`created_at` ฯลฯ) เป็น ISO UTC
- **ID**: UUID v4 (`crypto.randomUUID()`) เพื่อซิงก์ข้ามเครื่องได้โดยไม่ชนกัน
- **ลบ**: soft delete (`deleted_at`) → Undo ได้ และซิงก์การลบไปเครื่องอื่นได้
- **ซิงก์**: `dirty = 1` เมื่อมีการแก้ไขที่ยังไม่ได้ส่งขึ้น cloud
- **เวอร์ชันสคีมา**: `PRAGMA user_version` + migration ใน `src/main/db/migrations.ts`

## 2. ตาราง (migration 1)

### categories
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | TEXT PK | UUID |
| kind | TEXT | `income` / `expense` |
| name | TEXT | ไม่ว่าง, ≤ 40 ตัวอักษร |
| icon | TEXT | emoji 1 ตัว |
| sort_order | INTEGER | |
| created_at / updated_at / deleted_at | TEXT | |
| dirty | INTEGER | 0/1 |

สร้างหมวดเริ่มต้นครั้งแรก (เป็นหมวดหมู่ ไม่ใช่ข้อมูลรายการปลอม):
รายจ่าย — อาหาร, ที่พัก/ค่าเช่า, ค่าน้ำค่าไฟ, เดินทาง, บัตรเครดิต, สมาชิก/บริการ, ช้อปปิ้ง, สุขภาพ, อื่น ๆ
รายรับ — เงินเดือน, รายได้เสริม, อื่น ๆ

### payment_methods
`id, name, sort_order, created_at, updated_at, deleted_at, dirty`
เริ่มต้น: เงินสด, โอนธนาคาร, บัตรเครดิต, พร้อมเพย์/QR, ตัดบัญชีอัตโนมัติ

### transactions
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | TEXT PK | |
| kind | TEXT | `income` / `expense` |
| title | TEXT | 1–80 ตัวอักษร |
| amount_satang | INTEGER | > 0 และ ≤ 99,999,999,999 (≈ 999 ล้านบาท) |
| category_id | TEXT NULL | FK categories |
| payment_method_id | TEXT NULL | FK payment_methods |
| txn_date | TEXT | วันที่ของรายการ — ใช้ตัดสินว่าอยู่เดือนไหน |
| due_date | TEXT NULL | วันครบกำหนด (บิล) |
| is_paid | INTEGER | 0/1 (รายรับ: 1 = ได้รับแล้ว) |
| paid_date | TEXT NULL | ตั้งอัตโนมัติเมื่อกดจ่ายแล้ว |
| note | TEXT | ≤ 500 ตัวอักษร |
| recurring_rule_id | TEXT NULL | มาจากรายการประจำ |
| recurring_period | TEXT NULL | `YYYY-MM`; UNIQUE ร่วมกับ recurring_rule_id |
| created_at / updated_at / deleted_at / dirty | | |

### recurring_rules
`id, kind, title, amount_satang, category_id, payment_method_id, day_of_month (1–31),
start_month (YYYY-MM), end_month NULL, note, is_active, created_at, updated_at, deleted_at, dirty`

## 3. สถานะการชำระ (`src/shared/status.ts`)
คำนวณตอนแสดงผล ไม่เก็บลงฐานข้อมูล (เพราะขึ้นกับวันนี้)

```
ถ้า is_paid = 1                        → paid       (จ่ายแล้ว / ได้รับแล้ว)
ถ้าไม่มี due_date                       → unpaid     (ยังไม่จ่าย)
ถ้า due_date < วันนี้                    → overdue    (เกินกำหนด)
ถ้า due_date - วันนี้ ≤ 3 วัน            → due_soon   (ใกล้ครบกำหนด)  ← รวมวันนี้
อื่น ๆ                                   → unpaid
```

## 4. สรุปรายเดือน (`src/shared/summary.ts`)
รายการของเดือน M = แถวที่ `deleted_at IS NULL` และ `txn_date` ขึ้นต้นด้วย `M`

| ค่า | สูตร |
|---|---|
| incomeTotal | Σ amount (kind = income) |
| incomeReceived | Σ amount (kind = income, is_paid = 1) |
| expenseTotal | Σ amount (kind = expense) |
| expensePaid | Σ amount (kind = expense, is_paid = 1) |
| balance | incomeTotal − expenseTotal |
| outstanding | expenseTotal − expensePaid |
| overdueCount / dueSoonCount | นับรายจ่ายที่สถานะนั้น |

## 5. รายการประจำ (`src/shared/dates.ts → recurringDateFor`)
- วันที่ = min(day_of_month, จำนวนวันในเดือน) เช่น 31 → 2027-02-28, 2028-02-29
- สร้างเฉพาะเดือนที่ `start_month ≤ M` และ (`end_month` ว่าง หรือ `M ≤ end_month`) และ `is_active = 1`
- รายการที่สร้าง: `txn_date = due_date = วันที่นั้น`, `is_paid = 0`
- สร้างเมื่อเปิดดูเดือนนั้น (Dashboard หรือหน้ารายการ) — ไม่สร้างล่วงหน้าทุกเดือน
- **แก้ไขกฎ**: รายการที่ยังไม่จ่ายและวันที่ ≥ วันนี้ จะเปลี่ยนตามกฎใหม่ (รวมถึงรายการที่ผู้ใช้แก้ด้วยมือ);
  รายการที่จ่ายแล้วหรือผ่านมาแล้วไม่เปลี่ยน; ถ้าปิดใช้งาน/ย่นช่วงเดือน รายการอนาคตที่ยังไม่จ่ายจะถูก soft delete
- **ลบกฎ**: soft delete กฎ + รายการที่ยังไม่จ่ายตั้งแต่วันนี้; ประวัติที่จ่ายแล้วอยู่ครบ
- **ข้อจำกัดที่รู้แล้ว**: ถ้าปิดกฎแล้วเปิดใหม่ เดือนที่เคยถูก soft delete จะไม่ถูกสร้างซ้ำ (เพราะ UNIQUE index) — แก้ใน M2

## 6. ตารางสำหรับซิงก์ (migration 2)
- ทุกตารางที่ซิงก์ (`categories, payment_methods, recurring_rules, transactions`) มีคอลัมน์ `base_updated_at`
  = เวอร์ชัน (`updated_at`) ล่าสุดที่รู้ว่าตรงกับบน Firestore ใช้แยก "คนอื่นแก้" ออกจาก "ของที่เราเพิ่งส่ง"
- `sync_state(key, value)`: `owner_uid` (บัญชีที่ผูกกับฐานข้อมูลนี้), `cursor:<table>` (ค่า `updated_at` ล่าสุดที่ดึงมาแล้ว)
- `sync_conflicts`: เวอร์ชันทั้งสองของแถวที่ถูกแก้จาก 2 เครื่อง + ผู้ชนะ (`local`/`remote`) + `resolved_at`
- รายการประจำที่แอปสร้าง: `id` = UUID v5-style จาก `ruleId:YYYY-MM` และ `updated_at = 1970-01-01T00:00:00.000Z`
  (แพ้ทุกการแก้ไขจริงจากเครื่องอื่นเสมอ)

### กติกาซิงก์ (src/shared/syncEngine.ts + src/main/db/syncRepo.ts)
1. ดึง (pull) ก่อน: เอกสารที่ `updatedAt >= cursor − 5 นาที` เรียงตามเวลา ตรวจด้วย zod ทีละเอกสาร ข้ามที่ไม่ถูกต้อง (และไม่เลื่อน cursor)
2. ใช้ทีละเอกสาร:
   - ไม่มีในเครื่อง → เพิ่ม · เครื่องไม่มีของที่ยังไม่ส่ง → ใหม่กว่าเขียนทับ
   - เครื่องมีของที่ยังไม่ส่ง และเอกสารบนเซิร์ฟเวอร์ใหม่กว่า `base_updated_at` → **ขัดแย้ง**: เก็บอันที่ `updated_at` ใหม่กว่า
     เก็บอีกอันใน `sync_conflicts`
3. ส่ง (push) แถว `dirty = 1` เป็นชุดละ 400 แล้ว `markClean` เฉพาะแถวที่ไม่ถูกแก้ซ้ำระหว่างส่ง
4. การลบเป็น soft delete (`deleted_at`) ส่งไปเหมือนการแก้ไขทั่วไป

## 7. Mapping จาก Excel เดิม
ยังไม่ได้รับไฟล์ตัวอย่างจากเจ้าของ จึงทำตัวช่วยจับคู่คอลัมน์ (เดาจากชื่อหัวตารางไทย/อังกฤษ แล้วให้ผู้ใช้ปรับเอง) แทนการล็อกรูปแบบไฟล์
ดู `src/shared/importMap.ts`: วันที่ (ISO, วว/ดด/ปปปป, พ.ศ., ชื่อเดือนไทย, เลขวันที่ Excel), จำนวนเงิน (`1,234.50`, `฿`, `(500)`, ติดลบ),
ประเภท (รายรับ/รายจ่าย/income/expense หรือดูจากเครื่องหมาย), สถานะ, วันครบกำหนด, หมวดหมู่, ช่องทาง, หมายเหตุ
กันซ้ำด้วยคีย์ `วันที่|ประเภท|จำนวนสตางค์|ชื่อ (ตัวพิมพ์เล็ก)`
