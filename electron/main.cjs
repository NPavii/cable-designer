const { app, BrowserWindow, Menu, ipcMain, dialog, protocol, net, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { randomUUID } = require('crypto')
const { pathToFileURL } = require('url')
const updater = require('./updater.cjs')

const FILE_FILTERS = [
  { name: 'Проект кабельного дизайнера (JSON)', extensions: ['json'] },
  { name: 'Все файлы', extensions: ['*'] },
]
const TEMPLATE_FILTERS = [
  { name: 'Библиотека шаблонов (JSON)', extensions: ['json'] },
  { name: 'Все файлы', extensions: ['*'] },
]
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif'])
const TEMPLATE_ASSETS_DIR = () => path.join(app.getPath('userData'), 'template-assets')
const isImageFile = (name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase())

protocol.registerSchemesAsPrivileged([
  { scheme: 'cable-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

function assetNameFromUrl (value) {
  try {
    const url = new URL(String(value))
    if (url.protocol !== 'cable-asset:') return null
    const name = decodeURIComponent(url.hostname)
    if (!name || path.basename(name) !== name || !/^[\w.-]+$/i.test(name)) return null
    return name
  } catch {
    return null
  }
}

function saveTemplateAsset (sourcePath, originalName) {
  fs.mkdirSync(TEMPLATE_ASSETS_DIR(), { recursive: true })
  const extension = path.extname(originalName).slice(0, 16)
  const name = `${randomUUID()}${extension}`
  fs.copyFileSync(sourcePath, path.join(TEMPLATE_ASSETS_DIR(), name))
  return { name: originalName, url: `cable-asset://${name}`, image: isImageFile(originalName), size: fs.statSync(sourcePath).size }
}

function saveTemplateAssetBuffer (originalName, data) {
  fs.mkdirSync(TEMPLATE_ASSETS_DIR(), { recursive: true })
  const extension = path.extname(originalName).slice(0, 16)
  const name = `${randomUUID()}${extension}`
  const buffer = Buffer.from(data)
  fs.writeFileSync(path.join(TEMPLATE_ASSETS_DIR(), name), buffer)
  return { name: originalName, url: `cable-asset://${name}`, image: isImageFile(originalName), size: buffer.length }
}

// Экспорт упаковывает сами файлы, чтобы cable-asset-ссылки работали и на другом ПК.
function packTemplateAssets (content) {
  const parsed = JSON.parse(content)
  const assets = {}
  const text = JSON.stringify(parsed.templates || {})
  for (const match of text.matchAll(/cable-asset:\/\/([\w.-]+)/gi)) {
    const name = assetNameFromUrl(match[0])
    if (!name || assets[name]) continue
    const filePath = path.join(TEMPLATE_ASSETS_DIR(), name)
    if (fs.existsSync(filePath)) assets[name] = { data: fs.readFileSync(filePath).toString('base64') }
  }
  return JSON.stringify({ ...parsed, version: 2, assets }, null, 2)
}

function unpackTemplateAssets (content) {
  const parsed = JSON.parse(content)
  if (parsed?.app !== 'cable-designer-templates' || !parsed.templates) throw new Error('invalid templates file')
  if (!parsed.assets || typeof parsed.assets !== 'object') return content
  fs.mkdirSync(TEMPLATE_ASSETS_DIR(), { recursive: true })
  const replacements = new Map()
  for (const [oldName, payload] of Object.entries(parsed.assets)) {
    if (!/^[\w.-]+$/i.test(oldName) || typeof payload?.data !== 'string') continue
    const data = Buffer.from(payload.data, 'base64')
    let name = oldName
    const existing = path.join(TEMPLATE_ASSETS_DIR(), name)
    if (fs.existsSync(existing) && !fs.readFileSync(existing).equals(data)) name = `${randomUUID()}${path.extname(oldName)}`
    fs.writeFileSync(path.join(TEMPLATE_ASSETS_DIR(), name), data)
    replacements.set(oldName, name)
  }
  let templates = JSON.stringify(parsed.templates)
  for (const [oldName, name] of replacements) templates = templates.split(`cable-asset://${oldName}`).join(`cable-asset://${name}`)
  parsed.templates = JSON.parse(templates)
  delete parsed.assets
  return JSON.stringify(parsed)
}

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

function createWindow (templateEditor = null) {
  // У каждого окна свой идентификатор; редактор шаблона использует общую библиотеку.
  const isMain = !templateEditor && BrowserWindow.getAllWindows().length === 0
  const windowId = templateEditor
    ? `template-${Date.now()}-${++windowCounter}`
    : isMain ? 'main' : `project-${Date.now()}-${++windowCounter}`
  const win = new BrowserWindow({
    width: templateEditor ? 1280 : 1400,
    height: templateEditor ? 860 : 900,
    title: templateEditor ? 'Редактор шаблона — Кабельный дизайнер' : 'Кабельный дизайнер',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      additionalArguments: [`--cable-window-id=${windowId}`],
      preload: path.join(__dirname, 'preload.cjs'),
    }
  })

  const query = templateEditor
    ? { windowId, templateEditor: '1', kind: templateEditor.kind, index: String(templateEditor.index) }
    : { windowId }
  win.loadFile(path.join(__dirname, '../dist/index.html'), { query })

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
          message: templateEditor ? 'В шаблоне есть несохранённые изменения.' : 'В проекте есть несохранённые изменения.',
          detail: templateEditor
            ? 'Закрыть редактор без сохранения? Нажмите «Отмена», чтобы вернуться и сохранить шаблон.'
            : 'Закрыть приложение без сохранения? Чтобы сохранить проект, нажмите «Отмена» и воспользуйтесь кнопкой «Сохранить».',
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

// Перенос библиотеки шаблонов между компьютерами вместе с вложениями.
ipcMain.handle('templates:export', async (event, { defaultPath, content }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const r = await dialog.showSaveDialog(win, { defaultPath: withDefaultDir(defaultPath), filters: TEMPLATE_FILTERS })
  if (r.canceled || !r.filePath) return { canceled: true }
  fs.writeFileSync(r.filePath, packTemplateAssets(content), 'utf8')
  return { canceled: false, path: r.filePath }
})

ipcMain.handle('templates:import', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const r = await dialog.showOpenDialog(win, { defaultPath: readUpdateSettings().defaultDir || undefined, properties: ['openFile'], filters: TEMPLATE_FILTERS })
  if (r.canceled || !r.filePaths[0]) return { canceled: true }
  const content = unpackTemplateAssets(fs.readFileSync(r.filePaths[0], 'utf8'))
  return { canceled: false, path: r.filePaths[0], content }
})

ipcMain.handle('template-assets:choose', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const r = await dialog.showOpenDialog(win, {
    defaultPath: readUpdateSettings().defaultDir || undefined,
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Документы, изображения и другие файлы', extensions: ['*'] }],
  })
  if (r.canceled || !r.filePaths.length) return { canceled: true, files: [] }
  return { canceled: false, files: r.filePaths.map((filePath) => saveTemplateAsset(filePath, path.basename(filePath))) }
})

ipcMain.handle('template-assets:saveBuffer', async (event, { name, data }) => {
  const safeName = path.basename(String(name || 'screenshot.png'))
  return saveTemplateAssetBuffer(safeName, data)
})

ipcMain.handle('template-assets:open', async (event, value) => {
  const url = String(value || '')
  if (/^https?:\/\//i.test(url)) {
    await shell.openExternal(url)
    return { ok: true }
  }
  const name = assetNameFromUrl(url)
  if (!name) return { ok: false, error: 'Некорректная ссылка на вложение' }
  const filePath = path.join(TEMPLATE_ASSETS_DIR(), name)
  if (!fs.existsSync(filePath)) return { ok: false, error: 'Файл вложения не найден' }
  const error = await shell.openPath(filePath)
  return error ? { ok: false, error } : { ok: true }
})

ipcMain.handle('template-editor:open', async (event, { kind, index }) => {
  if (!['note', 'jumper'].includes(kind) || !Number.isInteger(index) || index < 0) throw new Error('invalid template')
  createWindow({ kind, index })
  return { ok: true }
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
  protocol.handle('cable-asset', (request) => {
    const name = assetNameFromUrl(request.url)
    if (!name) return new Response('Invalid asset URL', { status: 400 })
    const filePath = path.join(TEMPLATE_ASSETS_DIR(), name)
    if (!fs.existsSync(filePath)) return new Response('Asset not found', { status: 404 })
    return net.fetch(pathToFileURL(filePath).toString())
  })

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
