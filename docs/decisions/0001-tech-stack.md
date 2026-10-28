# ADR 0001 — Tech stack และเวอร์ชัน

- สถานะ: ยอมรับ (2026-10-28)

## บริบท
ต้องการแอป Windows Desktop ที่ทำงานออฟไลน์ ดูแลต่อได้โดยมือใหม่ และสร้าง Installer/อัปเดตอัตโนมัติได้

## การตัดสินใจ (ตรวจเวอร์ชันจาก npm registry วันที่ 2026-10-28)
| ส่วน | เลือก | เหตุผล |
|---|---|---|
| Runtime | Electron **44.10.0** (Node 24.22.1) | ใหม่ล่าสุด 45.1.0 เพิ่งออก (x.1.0) จึงเลือก 44 ที่ผ่านการแก้บั๊กมาหลายรอบ ยังอยู่ในช่วงที่ Electron ซัพพอร์ต |
| Build tool | electron-vite 6.0.0 + Vite 8.3.5 | แยก build main/preload/renderer ในคอนฟิกเดียว, HMR |
| UI | React 19.3.1 + TypeScript **6.0.3** | TypeScript 7.0 ออกแล้ว แต่ typescript-eslint 8.72 รองรับแค่ `<6.1.0` จึงใช้ 6.0 |
| Validation | zod 4.6.7 | ตรวจ IPC payload ใน main process |
| Test | Vitest 5.0.5 (unit), Playwright 1.64.1 (E2E กับ Electron จริง) | |
| Lint | ESLint 10 + typescript-eslint 8.72 + react-hooks 7 | |
| Package | electron-builder 26.18.0 (NSIS) + electron-updater 6.8.11 | ตามที่กำหนดในโจทย์ |
| ฟอนต์ | @fontsource/ibm-plex-sans-thai (SIL OFL 1.1) — เจ้าของเลือก 2026-10-28 แทน Mali/Sarabun | ฝังในแอป ทำงานออฟไลน์ |

## ทางเลือกที่ไม่ได้เลือก
- **Electron Forge**: ดี แต่โจทย์กำหนด electron-builder + electron-updater และ electron-vite เข้ากันได้ตรงกว่า
- **TypeScript 7**: รอ typescript-eslint รองรับก่อน (ตรวจใหม่ทุกครั้งที่อัปเกรด)
- **Tauri**: ไฟล์เล็กกว่า แต่ต้องใช้ Rust ซึ่งยากสำหรับผู้ดูแลมือใหม่

## ผลที่ตามมา
- อัปเกรด major version ต้องรัน `npm run verify` + `npm run test:e2e` ทุกครั้ง และบันทึกใน CHANGELOG
