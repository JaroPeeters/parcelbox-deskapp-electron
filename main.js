const path = require('node:path')
const { app, BrowserWindow, shell } = require('electron/main')
const UPDATE_URL = process.env.UPDATE_URL
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

const sendToAll = (channel, payload) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload)
  })
}

const setupAutoUpdates = () => {
  const shouldAutoUpdate = process.env.NODE_ENV === 'production' && app.isPackaged && UPDATE_URL
  if (!shouldAutoUpdate) {
    return
  }

  let autoUpdater
  try {
    ;({ autoUpdater } = require('electron-updater'))
  } catch (error) {
    console.warn('Auto updates disabled: electron-updater is not installed.', error)
    return
  }

  autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_URL })
  autoUpdater.autoDownload = true

  autoUpdater.on('update-available', () => {
    sendToAll('update-available')
  })

  autoUpdater.on('update-downloaded', () => {
    sendToAll('update-downloaded')
    setTimeout(() => {
      autoUpdater.quitAndInstall()
    }, 8000)
  })

  autoUpdater.on('error', (error) => {
    console.error('Auto update error:', error)
  })

  autoUpdater.checkForUpdates()
  setInterval(() => {
    autoUpdater.checkForUpdates()
  }, UPDATE_CHECK_INTERVAL_MS)
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }

    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault()
      if (url.startsWith('https://') || url.startsWith('http://')) {
        shell.openExternal(url)
      }
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()
  setupAutoUpdates()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
