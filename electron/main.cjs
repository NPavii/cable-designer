const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

const FILE_FILTERS = [
  { name: 'Проект кабельного дизайнера (JSON)', extensions: ['json'] },
  { name: 'Все файлы', extensions: ['*'] },
]

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
