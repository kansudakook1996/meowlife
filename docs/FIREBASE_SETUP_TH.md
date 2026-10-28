# คู่มือตั้งค่า Firebase (บัญชีผู้ใช้ + ซิงก์ข้อมูล)

> **สถานะ**: โค้ดเชื่อม Firebase ยังไม่ได้เขียน (Milestone 4) — ทำขั้นที่ 1–5 รอไว้ได้เลย
> ขั้นที่ 6–8 จะใช้ได้เมื่อ M4 เสร็จ ผมจะไม่ขอรหัสผ่านหรือ Secret ใด ๆ จากคุณ

## ภาพรวม
- **Firebase Authentication** = ระบบล็อกอิน (อีเมล/รหัสผ่าน)
- **Cloud Firestore** = ฐานข้อมูลบนคลาวด์ ใช้ซิงก์ข้ามเครื่อง
- **Security Rules** = กฎที่บอกว่าใครอ่าน/เขียนอะไรได้ — สำคัญที่สุด เพราะค่า config ของแอปเป็นข้อมูลสาธารณะ

## ค่าใช้จ่าย (อ่านก่อน)
- แผน **Spark** ไม่ต้องผูกบัตรเครดิต มีโควตาฟรีต่อวัน เมื่อเกินโควตาจะหยุดทำงานชั่วคราว ไม่เก็บเงิน
- แผน **Blaze** จ่ายตามใช้ ต้องผูกบัตร — **ยังไม่ต้องใช้** สำหรับแอปส่วนตัว
- โควตาเปลี่ยนได้ ตรวจล่าสุดที่ https://firebase.google.com/pricing ก่อนตัดสินใจทุกครั้ง
- ผมไม่รับประกันว่าฟรีตลอดไป ถ้าเงื่อนไข Google เปลี่ยน ให้ตรวจหน้า pricing

---

## ขั้นที่ 1 — สร้าง Firebase Project
1. **เป้าหมาย**: สร้าง "โปรเจกต์" ที่เก็บ Auth และฐานข้อมูลของ MeowLife
2. **URL**: https://console.firebase.google.com/ (ล็อกอินด้วยบัญชี Google ของคุณเอง)
3. **กด**: **Create a project** (หรือ "เพิ่มโปรเจกต์")
4. **ค่าที่กรอก**
   - ชื่อโปรเจกต์: `meowlife` (ระบบอาจเติมตัวเลขต่อท้ายเป็น Project ID เช่น `meowlife-1a2b3`)
   - Google Analytics: **ปิด** (ไม่จำเป็น และลดข้อมูลที่ส่งออก)
   - ถ้าถามเรื่อง Gemini/AI assistance: เลือกตามสะดวก ไม่กระทบแอป
5. **ผลที่ควรเห็น**: หน้า Project Overview ของ `meowlife`
6. **ทดสอบ**: มุมซ้ายบนแสดงชื่อโปรเจกต์
7. **ปัญหาที่พบบ่อย**: ชื่อซ้ำ → ใช้ชื่ออื่น เช่น `meowlife-kansu`
8. **ความปลอดภัย**: บัญชี Google ที่ใช้ควรเปิด 2-Step Verification

## ขั้นที่ 2 — ลงทะเบียนแอป (Web app)
1. **เป้าหมาย**: ได้ค่า config ที่แอปใช้เชื่อมต่อ
2. **ที่**: หน้า Project Overview → กดไอคอน **`</>`** (Web)
3. **ค่าที่กรอก**: App nickname = `MeowLife Desktop` / **ไม่ต้อง**ติ๊ก Firebase Hosting
4. **กด**: **Register app**
5. **ผลที่ควรเห็น**: โค้ดตัวอย่างที่มี `firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", ... }`
6. เก็บหน้านี้ไว้ (ดูย้อนหลังได้ที่ ⚙️ Project settings → General → Your apps)
7. **ปัญหา**: ปิดหน้าไปแล้ว → เข้า Project settings ดูได้เสมอ
8. **ความปลอดภัย**: ค่า `apiKey` ของ Web app **ไม่ใช่ความลับ** (อยู่ในแอปทุกตัว) แต่
   **ห้าม** ดาวน์โหลด/ใช้ "Service account private key" (ไฟล์ JSON ใน Project settings → Service accounts) กับแอปนี้เด็ดขาด

## ขั้นที่ 3 — เปิด Authentication แบบอีเมล/รหัสผ่าน
1. **เป้าหมาย**: ให้ผู้ใช้สร้างบัญชีและล็อกอินในแอป
2. **ที่**: เมนูซ้าย **Build → Authentication** → **Get started**
3. **กด**: แท็บ **Sign-in method** → **Email/Password** → เปิด **Enable** (อันแรก) → **Save**
4. **ค่าที่เลือก**: Email link (passwordless) ปิดไว้ก่อน
5. **ผลที่ควรเห็น**: Email/Password แสดงสถานะ **Enabled**
6. **ทดสอบ**: แท็บ **Users** → **Add user** สร้างผู้ใช้ทดสอบได้ (ใช้อีเมลทดสอบ ไม่ต้องเป็นอีเมลจริง)
7. **ปัญหา**: ไม่เห็นเมนู → เลือกโปรเจกต์ให้ถูกที่มุมซ้ายบน
8. **ความปลอดภัย**: แท็บ Settings → **User actions** พิจารณาปิด "Enable create (sign-up)" ถ้าต้องการให้มีแค่บัญชีคุณ

## ขั้นที่ 4 — สร้าง Cloud Firestore
1. **เป้าหมาย**: สร้างฐานข้อมูลบนคลาวด์
2. **ที่**: **Build → Firestore Database** → **Create database**
3. **ค่าที่เลือก**
   - Edition/Mode: ถ้ามีให้เลือก ใช้ค่ามาตรฐาน (Standard)
   - **Location**: เลือกภูมิภาคที่ใกล้ไทยที่สุดที่มีให้ เช่น `asia-southeast1 (Singapore)` —
     **เลือกแล้วเปลี่ยนไม่ได้**
   - Security rules: เลือก **Start in production mode** (ปิดทุกอย่างไว้ก่อน)
   - ❌ อย่าเลือก test mode — มันเปิดให้ทุกคนอ่าน/เขียนได้ 30 วัน
4. **ผลที่ควรเห็น**: หน้า Data ว่าง ๆ
5. **ทดสอบ**: แท็บ Rules แสดง `allow read, write: if false;`
6. **ปัญหา**: ระบบให้เปิด billing → ตรวจว่าเลือกแผน Spark / ฐานข้อมูลแบบ default
7. **ค่าใช้จ่าย**: อยู่ในโควตาฟรีของ Spark สำหรับการใช้งานส่วนตัวทั่วไป (ตรวจหน้า pricing)

## ขั้นที่ 5 — ตั้ง Security Rules
1. **เป้าหมาย**: ให้แต่ละคนเห็นเฉพาะข้อมูลของตัวเอง (`users/{uid}/...`)
2. **ที่**: Firestore Database → แท็บ **Rules**
3. **ทำ**: เปิดไฟล์ `firestore.rules` ในโปรเจกต์ คัดลอกทั้งหมดไปวางแทน → **Publish**
4. **ผลที่ควรเห็น**: "Rules published"
5. **ทดสอบ**: แท็บ Rules → **Rules Playground**
   - Location: `/users/abc/transactions/t1`, Simulation type: get
   - Authenticated: เปิด, Firebase UID: `abc` → ✅ Allowed
   - เปลี่ยน UID เป็น `xyz` → ❌ Denied
   - (ในขั้น M4 จะมีเทสต์อัตโนมัติด้วย Firestore Emulator เพิ่ม)
6. **ปัญหา**: Publish ไม่ได้เพราะ syntax → ตรวจว่าคัดลอกครบทุกบรรทัด
7. **ความปลอดภัย**: ห้ามใช้ `allow read, write: if true;` ในระบบจริง

## ขั้นที่ 6 — ใส่ค่า config ในเครื่อง (`.env.local`) — ใช้เมื่อ M4 เสร็จ
1. คัดลอก `.env.example` เป็น `.env.local` (ในโฟลเดอร์ `C:\dev\meowlife`)
   ```bash
   Copy-Item .env.example .env.local
   ```
2. เปิด `.env.local` ด้วย Notepad/VS Code แล้วเติมค่าจากขั้นที่ 2 เช่น
   `MAIN_VITE_FIREBASE_PROJECT_ID=meowlife-1a2b3`
3. `.env.local` ถูก `.gitignore` ไว้แล้ว จะไม่ขึ้น GitHub — ตรวจด้วย `git status` ต้องไม่เห็นไฟล์นี้
4. ไม่ต้องส่งค่าเหล่านี้ให้ผมในแชท

## ขั้นที่ 7 — ทดสอบการเชื่อมต่อ (M4)
จะเพิ่มปุ่ม "ทดสอบการเชื่อมต่อ" ในหน้าตั้งค่า พร้อมขั้นตอนละเอียดเมื่อเขียนโค้ดเสร็จ

## ขั้นที่ 8 — แก้ปัญหา `permission-denied`
| สาเหตุ | วิธีตรวจ | วิธีแก้ |
|---|---|---|
| ยังไม่ได้ล็อกอิน | แอปแสดงสถานะ "ยังไม่ได้เข้าสู่ระบบ" | ล็อกอินก่อน |
| Rules ยังเป็นค่าเริ่มต้น (`if false`) | แท็บ Rules | Publish `firestore.rules` |
| path ไม่ตรง `users/{uid}/...` | Rules Playground | ตรวจว่า uid ใน path = uid ที่ล็อกอิน |
| ชื่อ collection ไม่อยู่ในรายการที่อนุญาต | ดู `allowedCollection` ใน rules | เพิ่มชื่อใน rules แล้ว Publish |
| เอกสารใหญ่เกิน/ไม่มี `updatedAt` | ดู `validDoc` | แก้ข้อมูลที่ส่ง |
| Project ID ใน `.env.local` ผิดโปรเจกต์ | เทียบกับ Project settings | แก้ค่าแล้ว build ใหม่ |
