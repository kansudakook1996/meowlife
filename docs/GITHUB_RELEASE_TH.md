# คู่มือ GitHub, Release และ Auto-update

> **สถานะ (2026-10-28)**: ขั้นที่ 1–5 ทำแล้ว — repo Public `kansudakook1996/meowlife`,
> push `main` แล้ว, CI บน GitHub ผ่าน (รวม E2E) / ระบบ Auto-update ในแอปเขียนแล้ว /
> ขั้นที่ 6–8 ดูสถานะล่าสุดใน `docs/PROJECT_STATUS.md`

## Public หรือ Private Repository?
| | Public | Private |
|---|---|---|
| ใครเห็นโค้ด | ทุกคน | คุณ (และคนที่เชิญ) |
| Auto-update จาก GitHub Releases | ✅ ทำได้โดยไม่ต้องใช้ Token | ❌ แอปต้องมี Token ถึงจะโหลดได้ — **ห้ามฝัง Token ในแอป** |
| ข้อมูลการเงินของคุณ | ไม่อยู่ใน repo อยู่แล้ว (เก็บในเครื่อง/Firestore) | เหมือนกัน |

**คำแนะนำ**: โค้ดของ MeowLife ไม่มีข้อมูลส่วนตัวหรือ Secret จึงใช้ **Public** ได้
ถ้าอยากให้โค้ดเป็น Private ให้สร้าง repo แยกแบบ Public ชื่อ `meowlife-releases` สำหรับเก็บไฟล์ติดตั้งอย่างเดียว
(ต้องปรับ workflow ภายหลัง — บอกผมได้)

---

## ขั้นที่ 1 — สร้างบัญชี GitHub
1. **เป้าหมาย**: มีที่เก็บโค้ดออนไลน์ + ระบบ build อัตโนมัติ
2. **URL**: https://github.com/signup
3. กรอกอีเมล รหัสผ่าน ชื่อผู้ใช้ (ผมไม่ต้องรู้รหัสผ่านของคุณ)
4. **ความปลอดภัย**: เปิด 2FA ที่ https://github.com/settings/security

## ขั้นที่ 2 — สร้าง Repository
1. **URL**: https://github.com/new
2. **ค่าที่กรอก**: Repository name = `meowlife`, Visibility = Public (ดูตารางด้านบน)
3. **สำคัญ**: **ไม่ต้อง** ติ๊ก Add README / .gitignore / license (เรามีอยู่แล้ว จะได้ไม่ชนกัน)
4. กด **Create repository**
5. **ผลที่ควรเห็น**: หน้า "Quick setup" ที่มี URL แบบ `https://github.com/<ชื่อคุณ>/meowlife.git`

## ขั้นที่ 3 — ตั้งอีเมลสำหรับ commit (ป้องกันอีเมลจริงหลุด)
1. ไปที่ https://github.com/settings/emails → ติ๊ก **Keep my email addresses private**
2. คัดลอกอีเมลแบบ `12345678+ชื่อคุณ@users.noreply.github.com`
3. ในโฟลเดอร์โปรเจกต์ รัน (แทนค่าด้วยอีเมล noreply ของคุณ):
   ```bash
   git config user.email "12345678+yourname@users.noreply.github.com"
   ```
4. ✅ ทำแล้ว (2026-10-28): ตั้งอีเมล noreply ให้ repo นี้ และเปลี่ยนอีเมลใน commit แรกที่ยังไม่เคย push
   เป็น noreply ด้วย `git commit --amend --reset-author --no-edit` แล้ว
   - ตรวจเองได้ด้วย `git log --format="%h %an <%ae>"` ต้องเห็นอีเมล `...@users.noreply.github.com`
   - ⚠️ อย่าใช้วิธี amend กับ commit ที่ push ขึ้น GitHub ไปแล้ว (จะทำให้ประวัติไม่ตรงกับบน GitHub)

## ขั้นที่ 4 — เชื่อม Local Repository กับ GitHub แล้ว Push
```bash
git remote add origin https://github.com/<ชื่อคุณ>/meowlife.git
```
```bash
git push -u origin main
```
- ครั้งแรกจะมีหน้าต่าง **Git Credential Manager** ให้ล็อกอิน GitHub ผ่านเบราว์เซอร์ → กด Authorize
  (ไม่ต้องสร้าง Personal Access Token เอง และไม่ต้องบอกผม)
- **ผลที่ควรเห็น**: รีเฟรชหน้า repo จะเห็นไฟล์โค้ดทั้งหมด
- แท็บ **Actions** จะเริ่มรัน workflow **CI** อัตโนมัติ (ประมาณ 5–10 นาที) ✅ = ผ่าน

## ขั้นที่ 5 — งานประจำวัน: Commit / Push
```bash
git status
```
```bash
git add -A
```
```bash
git commit -m "Add monthly report page"
```
```bash
git push
```
ก่อน commit ให้รัน `npm run verify` ทุกครั้ง

## ขั้นที่ 6 — ออก Release (เช่น v0.1.0)
1. แก้ `version` ใน `package.json` (Semantic Versioning: `MAJOR.MINOR.PATCH`)
   - แก้บั๊ก → PATCH (0.1.0 → 0.1.1) / ฟีเจอร์ใหม่ → MINOR (0.1.1 → 0.2.0)
2. เขียน `CHANGELOG.md` เป็นภาษาไทย
3. commit แล้วสร้าง tag ให้ตรงกับเวอร์ชัน
   ```bash
   git tag v0.1.0
   ```
   ```bash
   git push origin v0.1.0
   ```
4. workflow **Release** จะ build ตัวติดตั้งบน Windows แล้วสร้าง Release ให้อัตโนมัติ
   (ใช้ `GITHUB_TOKEN` ที่ GitHub สร้างให้เฉพาะรอบนั้น ไม่ได้เก็บในแอป)
5. ถ้า tag ไม่ตรงกับ version ใน package.json workflow จะหยุดพร้อมแจ้ง
6. **ผลที่ควรเห็น**: แท็บ **Releases** มี `MeowLife-Setup-0.1.0.exe`, `.blockmap`, `latest.yml`
   - ไฟล์ `latest.yml` คือสิ่งที่ electron-updater ใช้ตรวจเวอร์ชันใหม่

## ขั้นที่ 7 — ดาวน์โหลดและติดตั้ง EXE
1. หน้า Releases → กดไฟล์ `MeowLife-Setup-x.y.z.exe`
2. เปิดไฟล์ → Windows อาจแสดง **"Windows protected your PC"** (SmartScreen)
   เพราะไฟล์ **ยังไม่ได้ Code Sign** → กด **More info** → **Run anyway**
3. เลือกโฟลเดอร์ติดตั้ง → Install → เปิดแอปจาก Desktop/Start menu
4. ข้อมูลอยู่ที่ `%APPDATA%\MeowLife` (ไม่อยู่ในโฟลเดอร์ติดตั้ง) ถอนการติดตั้งแล้วข้อมูลยังอยู่

### ข้อจำกัดของ Installer ที่ไม่ได้ Code Sign (ตามจริง)
- SmartScreen จะเตือนทุกเวอร์ชันใหม่ จนกว่าไฟล์จะมี "ชื่อเสียง" พอ
- โปรแกรมแอนตี้ไวรัสบางตัวอาจตรวจไฟล์นานหรือกักไว้
- ผู้ใช้ตรวจไม่ได้ว่าไฟล์มาจากคุณจริง — แจกเฉพาะจากหน้า Releases ของคุณเท่านั้น
- Code Signing Certificate มีค่าใช้จ่ายรายปี (ตัวเลือก: Azure Trusted Signing, OV/EV certificate) — ยังไม่จำเป็นสำหรับใช้เอง

## ขั้นที่ 8 — ทดสอบ Auto-update
1. ติดตั้ง v0.1.0 จาก Releases แล้วเพิ่มรายการทดสอบ 2–3 รายการ
2. ออก v0.1.1 ตามขั้นที่ 6
3. เปิด v0.1.0 → แอปแจ้ง "มีเวอร์ชันใหม่" → กดอัปเดต → แอปรีสตาร์ท
4. ตรวจ: หน้าตั้งค่าแสดง 0.1.1 และรายการทดสอบยังอยู่ครบ
5. ผลทดสอบให้บันทึกใน `docs/TEST_PLAN.md`

## ข้อผิดพลาดที่พบบ่อย
| อาการ | วิธีแก้ |
|---|---|
| `remote origin already exists` | `git remote set-url origin <URL ใหม่>` |
| `rejected ... fetch first` | `git pull --rebase` แล้ว push ใหม่ |
| Release workflow ❌ ขั้น "Check tag" | version ใน package.json ไม่ตรงกับ tag |
| Release ไม่มีไฟล์ | ดู log ขั้น "Build installer" ใน Actions |

## ความปลอดภัย
- ห้าม commit Token/PAT/รหัสผ่าน ถ้าเผลอ commit ให้ **Revoke token ทันที** แล้วบอกผม (ลบจากประวัติอย่างเดียวไม่พอ)
- ไม่ต้องสร้าง Secret ใน GitHub สำหรับ workflow นี้ (ใช้ `GITHUB_TOKEN` อัตโนมัติ)
- GitHub Actions สำหรับ Public repo ใช้ฟรี; Private repo มีนาทีฟรีจำกัดต่อเดือน (Windows runner นับนาทีมากกว่า Linux) —
  ตรวจที่ https://docs.github.com/billing
