# 🐱 MeowLife

Personal Portal สำหรับจัดการชีวิตส่วนตัวบน Windows — เริ่มจากบัญชีรายรับรายจ่ายที่ใช้ง่าย ทำงานออฟไลน์
มีแมวคู่ใจ "เจ๊หมี" (ขาว) กับ "อาจารย์ส้ม" (ส้ม) คอยให้กำลังใจ

> สถานะ: **v0.1.0 (กำลังพัฒนา, ยังไม่ใช่ Production-ready)** — ดู [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)

## ใช้ได้แล้วตอนนี้
- ภาพรวมรายเดือน: รายรับ รายจ่าย คงเหลือ ค้างชำระ + รายจ่ายตามหมวด
- เพิ่ม/แก้ไข/ลบ (มียืนยันและเลิกทำ) ค้นหา และกรองรายการ
- สถานะ จ่ายแล้ว / ยังไม่จ่าย / ใกล้ครบกำหนด / เกินกำหนด (สี + ไอคอน + ข้อความ)
- รายการประจำรายเดือน (ค่าเช่า ค่าน้ำ ค่าไฟ ฯลฯ) สร้างให้อัตโนมัติ
- เงินบาท ฿1,234.50 และวันที่ พ.ศ. / ทำงานออฟไลน์ ข้อมูลเก็บในเครื่อง (SQLite)

## เริ่มพัฒนา
```bash
npm ci
```
```bash
npm run dev
```
คู่มือเต็ม: [docs/SETUP_WINDOWS_TH.md](docs/SETUP_WINDOWS_TH.md)

## คำสั่ง
| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | เปิดแอปโหมดพัฒนา |
| `npm run verify` | lint + typecheck + unit test + build |
| `npm run test:e2e` | ทดสอบแอปจริงด้วย Playwright |
| `npm run dist` | สร้างตัวติดตั้ง `dist/MeowLife-Setup-x.y.z.exe` |

## เอกสาร
- [Product Spec](docs/PRODUCT_SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [Data Model](docs/DATA_MODEL.md) · [UX](docs/UX_GUIDELINES.md)
- [ตั้งค่า Firebase](docs/FIREBASE_SETUP_TH.md) · [GitHub & Release](docs/GITHUB_RELEASE_TH.md) · [Test Plan](docs/TEST_PLAN.md)
- [Decisions (ADR)](docs/decisions/) · [CHANGELOG](CHANGELOG.md)

## ลิขสิทธิ์ส่วนประกอบ
- ฟอนต์ IBM Plex Sans Thai — SIL Open Font License 1.1 (IBM)
- ไอคอนแอป (`build/icon.png`) — ภาพของเจ้าของโปรเจกต์
- มาสคอต "เจ๊หมี" กับ "อาจารย์ส้ม" — SVG ที่วาดสำหรับโปรเจกต์นี้ (`src/renderer/src/components/CatMascot.tsx`)
