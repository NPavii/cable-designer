const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const updater = require('./updater.cjs')

const FILE_FILTERS = [
  { name: 'Проект кабельного дизайнера (JSON)', extensions: ['json'] },
  { name: 'Все файлы', extensions: ['*'] },
]
const TEMPLATE_FILTERS = [
  { name: 'Библиотека шаблонов (JSON)', extensions: ['json'] },
  { name: 'Все файлы', extensions: ['*'] },
]

// Настройки автообновления (путь к серверной папке) — в userData
const DEFAULT_UPDATE_DIR = 'Z:\\Документы. Электроника\\Новопашин\\!Kimi\\cable-designer'
const UPDATE_SETTINGS = () => path.join(app.getPath('userData'), 'update-settings.json')
function readUpdateSettings () {
  try {
    const s = JSON.parse(fs.readFileSync(UPDATE_SETTINGS(), 'utf8'))
    // Пустой путь обновлений = серверная папка по умолчанию;
    // пустой defaultDir = системный выбор папки в файловом диалоге.
    return { updateDir: s.updateDir || DEFAULT_UPDATE_DIR, defaultDir: s.defaultDir || '' }
  } catch {
    return { updateDir: DEFAULT_UPDATE_DIR, defaultDir: '' }
  }
}

let windowCounter = 0

function createWindow () {
  // У каждого окна свой идентификатор и свой черновик в localStorage.
  const isMain = BrowserWindow.getAllWindows().length === 0
  const windowId = isMain ? 'main' : `project-${Date.now()}-${++windowCounter}`
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Кабельный дизайнер',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      additionalArguments: [`--cable-window-id=${windowId}`],
      preload: path.join(__dirname, 'preload.cjs'),
    }
  })

  win.loadFile(path.join(__dirname, '../dist/index.html'), { query: { windowId } })

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

function withDefaultDir (fileName) {
  const { defaultDir } = readUpdateSettings()
  return defaultDir && fileName && !path.isAbsolute(fileName) ? path.join(defaultDir, fileName) : fileName
}

// Сохранить как: диалог выбора пути + запись файла
ipcMain.handle('project:saveAs', async (event, { defaultPath, content }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const r = await dialog.showSaveDialog(win, { defaultPath: withDefaultDir(defaultPath), filters: FILE_FILTERS })
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
  const r = await dialog.showOpenDialog(win, { defaultPath: readUpdateSettings().defaultDir || undefined, properties: ['openFile'], filters: FILE_FILTERS })
  if (r.canceled || !r.filePaths[0]) return { canceled: true }
  const content = fs.readFileSync(r.filePaths[0], 'utf8')
  return { canceled: false, path: r.filePaths[0], content }
})

// Перенос библиотеки шаблонов между компьютерами.
ipcMain.handle('templates:export', async (event, { defaultPath, content }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const r = await dialog.showSaveDialog(win, { defaultPath: withDefaultDir(defaultPath), filters: TEMPLATE_FILTERS })
  if (r.canceled || !r.filePath) return { canceled: true }
  fs.writeFileSync(r.filePath, content, 'utf8')
  return { canceled: false, path: r.filePath }
})

ipcMain.handle('templates:import', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const r = await dialog.showOpenDialog(win, { defaultPath: readUpdateSettings().defaultDir || undefined, properties: ['openFile'], filters: TEMPLATE_FILTERS })
  if (r.canceled || !r.filePaths[0]) return { canceled: true }
  const content = fs.readFileSync(r.filePaths[0], 'utf8')
  return { canceled: false, path: r.filePaths[0], content }
})

ipcMain.handle('settings:get', async () => readUpdateSettings())

ipcMain.handle('settings:chooseDefaultDir', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const r = await dialog.showOpenDialog(win, {
    defaultPath: readUpdateSettings().defaultDir || undefined,
    properties: ['openDirectory', 'createDirectory'],
  })
  if (r.canceled || !r.filePaths[0]) return { canceled: true }
  return { canceled: false, path: r.filePaths[0] }
})

ipcMain.handle('settings:setDefaultDir', async (event, { defaultDir }) => {
  const normalized = String(defaultDir || '').trim()
  if (normalized && (!fs.existsSync(normalized) || !fs.statSync(normalized).isDirectory())) {
    return { ok: false, error: 'Указанная папка не существует' }
  }
  const current = readUpdateSettings()
  fs.writeFileSync(UPDATE_SETTINGS(), JSON.stringify({ ...current, defaultDir: normalized }, null, 2), 'utf8')
  return { ok: true }
})

// --- Автообновление через серверную папку ---
const APP_ROOT = path.resolve(__dirname, '..') // resources/app

ipcMain.handle('update:getSettings', async () => readUpdateSettings())

ipcMain.handle('update:setSettings', async (event, settings) => {
  const current = readUpdateSettings()
  fs.writeFileSync(UPDATE_SETTINGS(), JSON.stringify({ ...current, updateDir: settings.updateDir || '' }, null, 2), 'utf8')
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
  if (!app.isPackaged) return { ok: false, error: 'Установка доступна только в собранном приложении' }
  // Не закрываем другие окна с несохранёнными проектами без ведома пользователя.
  const dirty = await Promise.all(BrowserWindow.getAllWindows().map((win) =>
    win.webContents.executeJavaScript('window.__cableIsDirty ? window.__cableIsDirty() : false').catch(() => true)
  ))
  if (dirty.some(Boolean)) return { ok: false, error: 'Сохраните проекты во всех открытых окнах и повторите обновление' }
  const exePath = process.execPath
  const appRoot = path.dirname(exePath) // папка cable-designer-win32-x64
  updater.applyAndRestart(staging, appRoot, exePath, process.pid)
  setTimeout(() => app.exit(0), 500)
  return { ok: true }
})
// --- конец блока автообновления ---

app.whenReady().then(() => {
  // Файловые команды выполняет редактор: там находятся защита от потери
  // изменений, сериализация и история Undo/Redo.
  const sendFileCommand = (command) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    win?.webContents.send(`menu:project:${command}`)
  }
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Новый файл (в новом окне)', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
        { label: 'Открыть…', accelerator: 'CmdOrCtrl+O', click: () => sendFileCommand('open') },
        { type: 'separator' },
        { label: 'Сохранить', accelerator: 'CmdOrCtrl+S', click: () => sendFileCommand('save') },
        { label: 'Сохранить как…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendFileCommand('saveAs') },
        { type: 'separator' },
        { role: 'quit', label: 'Выход' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Отменить', accelerator: 'CmdOrCtrl+Z', click: () => sendFileCommand('undo') },
        { label: 'Повторить', accelerator: 'CmdOrCtrl+Y', click: () => sendFileCommand('redo') },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выбрать всё' },
      ],
    },
    { role: 'viewMenu', label: 'View' },
    { role: 'windowMenu', label: 'Window' },
    {
      label: 'Setting',
      submenu: [
        {
          label: 'Рабочая папка…',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
            win?.webContents.send('menu:settings')
          },
        },
        { type: 'separator' },
        {
          label: 'Шаблоны примечаний…',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
            win?.webContents.send('menu:templates')
          },
        },
        { type: 'separator' },
        {
          label: 'Обновления…',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
            win?.webContents.send('menu:updates')
          },
        },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)

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
