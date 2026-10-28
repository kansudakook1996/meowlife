// Render build/icon.svg → build/icon.png (512×512) using Electron's own Chromium.
// electron-builder turns icon.png into the Windows .ico. Run: npm run icon
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const SIZE = 512
const root = join(__dirname, '..')

app.whenReady().then(async () => {
  const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf8')
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true }
  })
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((r) => setTimeout(r, 300))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })
  const png = image.resize({ width: SIZE, height: SIZE }).toPNG()
  writeFileSync(join(root, 'build', 'icon.png'), png)
  console.info(`wrote build/icon.png (${png.length} bytes)`)
  app.quit()
})
