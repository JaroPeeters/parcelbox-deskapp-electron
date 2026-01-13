const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('parcelbox', {
  appVersion: process.env.npm_package_version || 'dev',
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', () => callback()),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback())
})
