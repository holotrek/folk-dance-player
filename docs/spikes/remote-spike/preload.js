const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('spike', {
  log: (source, detail) => ipcRenderer.send('log', source, detail),
  global: (on) => ipcRenderer.send('global', on),
  onLog: (fn) => ipcRenderer.on('log', (_e, line) => fn(line))
})
