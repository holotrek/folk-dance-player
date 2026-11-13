// Renders the app icon from build/icon/icon.html (the logo on the app's red tile) and writes
// build/icon.png, build/icon.ico (Windows), build/icon.icns, resources/icon.png and the Microsoft
// Store package's tile images (build/appx/). Run with
// `npm run icon` after changing the logo (src/renderer/src/assets/logo.svg) or the tile. The .icns
// needs macOS (sips, iconutil) and is skipped elsewhere.
const { app, BrowserWindow, nativeImage } = require('electron')
const { buildIco } = require('./ico.cjs')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.join(__dirname, '..')
const out = (...p) => path.join(root, ...p)

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true }
  })
  await win.loadFile(out('build', 'icon', 'icon.html'))
  await new Promise((resolve) => setTimeout(resolve, 800)) // let the mask image paint
  const png = (await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })).toPNG()
  fs.writeFileSync(out('build', 'icon.png'), png)
  fs.copyFileSync(out('build', 'icon.png'), out('resources', 'icon.png'))

  const ico = [16, 24, 32, 48, 64, 128, 256].map((size) => ({
    size,
    png: nativeImage
      .createFromBuffer(png)
      .resize({ width: size, height: size, quality: 'best' })
      .toPNG()
  }))
  fs.writeFileSync(out('build', 'icon.ico'), buildIco(ico))

  // The Microsoft Store package's tiles (electron-builder's defaults are Electron's own logo).
  const square = (size) =>
    nativeImage.createFromBuffer(png).resize({ width: size, height: size, quality: 'best' })
  fs.mkdirSync(out('build', 'appx'), { recursive: true })
  for (const [name, size] of [
    ['StoreLogo.png', 50],
    ['Square44x44Logo.png', 44],
    ['Square150x150Logo.png', 150]
  ]) {
    fs.writeFileSync(out('build', 'appx', name), square(size).toPNG())
  }
  // The wide tile: the icon centered on a transparent 310x150 canvas.
  const tile = square(150).toBitmap() // BGRA
  const wide = Buffer.alloc(310 * 150 * 4)
  for (let y = 0; y < 150; y++) tile.copy(wide, (y * 310 + 80) * 4, y * 150 * 4, (y + 1) * 150 * 4)
  fs.writeFileSync(
    out('build', 'appx', 'Wide310x150Logo.png'),
    nativeImage.createFromBitmap(wide, { width: 310, height: 150 }).toPNG()
  )
  if (process.platform !== 'darwin') {
    console.log(
      'wrote build/icon.png, build/icon.ico, build/appx/ and resources/icon.png (no .icns off macOS)'
    )
    app.quit()
    return
  }

  const set = fs.mkdtempSync(path.join(os.tmpdir(), 'fdp-icon-')) + '/icon.iconset'
  fs.mkdirSync(set)
  for (const size of [16, 32, 128, 256, 512]) {
    for (const [scale, suffix] of [
      [1, ''],
      [2, '@2x']
    ]) {
      const px = String(size * scale)
      const file = path.join(set, `icon_${size}x${size}${suffix}.png`)
      execFileSync('sips', ['-z', px, px, out('build', 'icon.png'), '--out', file], {
        stdio: 'ignore'
      })
    }
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', out('build', 'icon.icns')])
  console.log(
    'wrote build/icon.png, build/icon.ico, build/icon.icns, build/appx/ and resources/icon.png'
  )
  app.quit()
})
