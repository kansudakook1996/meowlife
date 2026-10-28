// Print the CHANGELOG.md section of one version, used as the (Thai) GitHub Release notes.
// Usage: node scripts/release-notes.cjs 0.1.1 > notes.md
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const version = process.argv[2]
if (!version) {
  console.error('usage: node scripts/release-notes.cjs <version>')
  process.exit(1)
}

const lines = readFileSync(join(__dirname, '..', 'CHANGELOG.md'), 'utf8').split(/\r?\n/)
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`))
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version}`)
  process.exit(1)
}
const rest = lines.slice(start + 1)
const end = rest.findIndex((l) => l.startsWith('## ['))
const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()

const footer = [
  '',
  '---',
  '**วิธีติดตั้ง**: ดาวน์โหลด `MeowLife-Setup-' + version + '.exe` ด้านล่าง → เปิดไฟล์',
  'ถ้า Windows แสดง "Windows protected your PC" ให้กด **More info** → **Run anyway** (ตัวติดตั้งยังไม่ได้ Code Sign)',
  'ถ้าติดตั้งเวอร์ชันก่อนหน้าไว้แล้ว แอปจะอัปเดตให้เองและข้อมูลของคุณจะอยู่ครบ'
].join('\n')

process.stdout.write(`${body}\n${footer}\n`)
