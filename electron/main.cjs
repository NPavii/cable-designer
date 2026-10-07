const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const updater = require('./updater.cjs')

const FILE_FILTERS = [
  { name: 'Проект кабельного дизайнера (JSON)', extensions: ['json'] },
  { name: 'Все файлы', extensions: ['*'] },
]

// Настройки автообновления (путь к серверной папке) — в userData
const UPDATE_SETTINGS = () => path.join(app.getPath('userData'), 'update-settings.json')
function readUpdateSettings () {
  try {
    return JSON.parse(fs.readFileSync(UPDATE_SETTINGS(), 'utf8'))
  } catch {
    return { updateDir: '' }
  }
}

function createWindow () {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    }
  })

  win.loadFile(path.join(__dirname, '../dist/index.html'))

  // Защита от потери несохранённых изменений при закрытии окна
  let allowClose = false
  win.on('close', (e) => {
    if (allowClose) return
    e.preventDefault()
    win.webContents
      .executeJavaScript('window.__cableIsDirty ? window.__cableIsDirty() : false')
      .then(async (dirty) => {
        if (!dirty) {
          allowClose = true
          win.close()
          return
        }
        const r = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: ['Закрыть без сохранения', 'Отмена'],
          defaultId: 1,
          cancelId: 1,
          title: 'Несохранённые изменения',
          message: 'В проекте есть несохранённые изменения.',
          detail: 'Закрыть приложение без сохранения? Чтобы сохранить проект, нажмите «Отмена» и воспользуйтесь кнопкой «Сохранить».',
        })
        if (r.response === 0) {
          allowClose = true
          win.close()
        }
      })
      .catch(() => {
        allowClose = true
        win.close()
      })
  })
}

// Сохранить как: диалог выбора пути + запись файла
ipcMain.handle('project:saveAs', async (event, { defaultPath, content }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const r = await dialog.showSaveDialog(win, { defaultPath, filters: FILE_FILTERS })
  if (r.canceled || !r.filePath) return { canceled: true }
  fs.writeFileSync(r.filePath, content, 'utf8')
  return { canceled: false, path: r.filePath }
})

// Сохранить по уже известному пути
ipcMain.handle('project:save', async (event, { path: filePath, content }) => {
  fs.writeFileSync(filePath, content, 'utf8')
  return { ok: true }
})

// Открыть: диалог выбора файла + чтение содержимого
ipcMain.handle('project:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: FILE_FILTERS })
  if (r.canceled || !r.filePaths[0]) return { canceled: true }
  const content = fs.readFileSync(r.filePaths[0], 'utf8')
  return { canceled: false, path: r.filePaths[0], content }
})

// --- Автообновление через серверную папку ---
const APP_ROOT = path.resolve(__dirname, '..') // resources/app

ipcMain.handle('update:getSettings', async () => readUpdateSettings())

ipcMain.handle('update:setSettings', async (event, settings) => {
  fs.writeFileSync(UPDATE_SETTINGS(), JSON.stringify({ updateDir: settings.updateDir || '' }, null, 2), 'utf8')
  return { ok: true }
})

ipcMain.handle('update:check', async () => {
  const { updateDir } = readUpdateSettings()
  return updater.check(updateDir, APP_ROOT)
})

ipcMain.handle('update:download', async () => {
  const { updateDir } = readUpdateSettings()
  const staging = await updater.download(updateDir)
  return { ok: true, staging }
})

ipcMain.handle('update:apply', async (event, { staging }) => {
  const exePath = process.execPath
  const appRoot = path.dirname(exePath) // папка cable-designer-win32-x64
  updater.applyAndRestart(staging, appRoot, exePath, process.pid)
  // Даём скрипту стартовать и завершаем приложение
  setTimeout(() => {
    app.exit(0)
  }, 500)
  return { ok: true }
})
// --- конец блока автообновления ---

app.whenReady().then(() => {
  createWindow()

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
