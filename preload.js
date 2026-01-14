const { contextBridge, ipcRenderer } = require('electron')

let jsQR = null
try {
  jsQR = require('jsqr')
} catch (error) {
  console.warn('jsqr not available:', error)
}

contextBridge.exposeInMainWorld('parcelbox', {
  appVersion: process.env.npm_package_version || 'dev',
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', () => callback()),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback()),
  decodeQr: (data, width, height, options) => {
    if (!jsQR) return null
    return jsQR(data, width, height, options)
  }
})
