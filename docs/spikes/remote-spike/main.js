// Remote-control spike: logs what a media remote sends, through every channel Electron offers.
const { app, BrowserWindow, globalShortcut, ipcMain, systemPreferences } = require('electron')
const fs = require('fs')
const path = require('path')

const LOG = path.join(__dirname, 'remote-log.txt')
fs.writeFileSync(LOG, '')
let win
function log(source, detail) {
  const line = `${new Date().toISOString().slice(11, 23)}  ${source.padEnd(14)} ${detail}`
  fs.appendFileSync(LOG, line + '\n')
  console.log(line)
  win?.webContents.send('log', line)
}

const MEDIA_KEYS = ['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop']
function setGlobalShortcuts(on) {
  globalShortcut.unregisterAll()
  if (!on) return log('mode', 'global shortcuts OFF')
  for (const key of MEDIA_KEYS) {
    const ok = globalShortcut.register(key, () => log('globalShortcut', key))
    log('mode', `global shortcut ${key}: ${ok ? 'registered' : 'FAILED to register'}`)
  }
}

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Remote spike',
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  })
  // Every key the window receives, before the page sees it (works while the window is focused).
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown') log('main:input', `key=${input.key} code=${input.code}`)
  })
  win.on('focus', () => log('window', 'focused'))
  win.on('blur', () => log('window', 'NOT focused'))
  ipcMain.on('log', (_e, source, detail) => log(source, detail))
  ipcMain.on('global', (_e, on) => setGlobalShortcuts(on))
  win.loadFile('index.html', { query: { song: process.env.SONG || '' } })
  log('app', `trusted accessibility client: ${systemPreferences.isTrustedAccessibilityClient(false)}`)
  log('app', `electron ${process.versions.electron}, log at ${LOG}`)
})
app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => app.quit())
