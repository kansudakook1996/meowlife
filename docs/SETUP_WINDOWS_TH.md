# คู่มือตั้งค่าเครื่องสำหรับพัฒนา MeowLife (Windows)

> เครื่องของเจ้าของโปรเจกต์ติดตั้งขั้นที่ 1–2 ไว้แล้วเมื่อ 2026-10-28 (Node.js 24.22.1, Git 2.56.0)
> คู่มือนี้ใช้เมื่อต้องตั้งค่าเครื่องใหม่

---

## ขั้นที่ 1 — ติดตั้ง Node.js (ตัวรันโค้ด JavaScript)
1. **เป้าหมาย**: ให้เครื่องรันคำสั่ง `node` และ `npm` ได้ (npm = ตัวติดตั้งแพ็กเกจ)
2. **URL ทางการ**: https://nodejs.org/en/download
3. **วิธีที่ง่ายที่สุด** (ใช้ winget ที่มากับ Windows): เปิด **PowerShell** (กด Start → พิมพ์ `PowerShell` → Enter) แล้วรัน
   ```bash
   winget install --id OpenJS.NodeJS.LTS -e --source winget
   ```
   หรือดาวน์โหลดไฟล์ `.msi` เวอร์ชัน **LTS** จากเว็บแล้วกด Next ไปเรื่อย ๆ
4. **ค่าที่เลือก**: เวอร์ชัน LTS (Long Term Support = เวอร์ชันเสถียรที่ได้รับการดูแลนาน) ต้องเป็น 24 ขึ้นไป
5. **ผลที่ควรเห็น**: ปิดแล้วเปิด PowerShell ใหม่ รัน `node -v` จะเห็น `v24.x.x`
6. **วิธีทดสอบ**: `npm -v` ต้องแสดงตัวเลขเวอร์ชัน
7. **ปัญหาที่พบบ่อย**
   - `node is not recognized` → ยังไม่ได้ปิด/เปิด PowerShell ใหม่ หรือรีสตาร์ทเครื่อง 1 ครั้ง
   - หน้าต่าง UAC ถามสิทธิ์ผู้ดูแล → กด **Yes**
8. **ความปลอดภัย/ค่าใช้จ่าย**: ฟรี ดาวน์โหลดจาก nodejs.org หรือ winget เท่านั้น อย่าโหลดจากเว็บอื่น

## ขั้นที่ 2 — ติดตั้ง Git (ระบบเก็บประวัติโค้ด)
1. **เป้าหมาย**: บันทึกทุกการเปลี่ยนแปลงของโค้ด ย้อนกลับได้ และส่งขึ้น GitHub
2. **URL**: https://git-scm.com/downloads/win
3. **คำสั่ง**:
   ```bash
   winget install --id Git.Git -e --source winget
   ```
4. **ค่าที่เลือก**: ใช้ค่าเริ่มต้นทั้งหมดของตัวติดตั้งได้เลย
5. **ผลที่ควรเห็น**: `git --version` แสดง `git version 2.x`
6. **ตั้งชื่อผู้เขียนโค้ด** (ทำครั้งเดียว):
   ```bash
   git config --global user.name "ชื่อของคุณ"
   ```
   สำหรับอีเมล แนะนำใช้อีเมล noreply ของ GitHub เพื่อไม่ให้อีเมลจริงปรากฏใน Repository สาธารณะ
   (ดูขั้นที่ 3 ใน `GITHUB_RELEASE_TH.md`)
7. **ปัญหาที่พบบ่อย**: `git is not recognized` → เปิด PowerShell ใหม่
8. **ความปลอดภัย**: ฟรี

## ขั้นที่ 3 — โฟลเดอร์โปรเจกต์
- โค้ดอยู่ที่ `C:\dev\meowlife` (ไม่อยู่ใน OneDrive และไม่มีอักษรไทยใน path — เหตุผลใน `decisions/0004-project-location.md`)
- **อย่า** ย้ายโปรเจกต์ไปไว้ใน OneDrive/Desktop ที่ซิงก์อยู่

## ขั้นที่ 4 — ติดตั้งแพ็กเกจของโปรเจกต์
```bash
cd C:\dev\meowlife
```
```bash
npm ci
```
- **ผลที่ควรเห็น**: `added ... packages` และไม่มีคำว่า `ERR!`
- `npm ci` ติดตั้งตาม `package-lock.json` เป๊ะ ๆ (ทุกเครื่องได้เวอร์ชันเดียวกัน)
- ถ้ามีข้อความ `install-scripts ... electron-winstaller` เป็นแค่คำเตือน ไม่กระทบการ build แบบ NSIS

## ขั้นที่ 5 — เปิดแอปโหมดพัฒนา
```bash
npm run dev
```
- หน้าต่าง MeowLife จะเปิดขึ้น แก้โค้ด UI แล้วหน้าจอเปลี่ยนทันที
- ข้อมูลโหมดพัฒนาอยู่ที่ `%APPDATA%\MeowLife-dev` (แยกจากข้อมูลจริงที่ `%APPDATA%\MeowLife`)
- ปิดด้วยการปิดหน้าต่าง หรือกด `Ctrl+C` ใน PowerShell

## ขั้นที่ 6 — ตรวจคุณภาพก่อนบันทึกงาน
```bash
npm run verify
```
รัน lint → typecheck → unit tests → build ตามลำดับ ต้องผ่านทั้งหมด

```bash
npm run test:e2e
```
เปิดแอปจริงอัตโนมัติด้วย Playwright แล้วลองเพิ่ม/ลบ/แก้รายการ (ใช้โฟลเดอร์ข้อมูลชั่วคราว)
ภาพหน้าจอผลทดสอบอยู่ใน `test-results/`

## ขั้นที่ 7 — สร้างตัวติดตั้ง .exe
```bash
npm run dist
```
- ผลลัพธ์: `dist\MeowLife-Setup-0.1.0.exe`
- ครั้งแรกจะดาวน์โหลด Electron และ NSIS จาก GitHub (ต้องมีอินเทอร์เน็ต)

## โปรแกรมแก้โค้ดที่แนะนำ (ไม่บังคับ)
Visual Studio Code — https://code.visualstudio.com/ (ฟรี) เปิดโฟลเดอร์ `C:\dev\meowlife`
