const { contextBridge, ipcRenderer } = require('electron')

const windowIdArg = process.argv.find((arg) => arg.startsWith('--cable-window-id='))
contextBridge.exposeInMainWorld('cableWindow', {
  id: windowIdArg ? windowIdArg.split('=')[1] : 'main',
})

// Мост для работы с файлами проекта из окна рендерера
contextBridge.exposeInMainWorld('cableFiles', {
  saveAs: (defaultPath, content) => ipcRenderer.invoke('project:saveAs', { defaultPath, content }),
  save: (path, content) => ipcRenderer.invoke('project:save', { path, content }),
  open: () => ipcRenderer.invoke('project:open'),
  onMenuCommand: (cb) => {
    const channels = ['new', 'open', 'save', 'saveAs', 'undo', 'redo']
    const handlers = channels.map((command) => {
      const handler = () => cb(command)
      ipcRenderer.on(`menu:project:${command}`, handler)
      return [`menu:project:${command}`, handler]
    })
    return () => handlers.forEach(([channel, handler]) => ipcRenderer.removeListener(channel, handler))
  },
})

contextBridge.exposeInMainWorld('cableTemplates', {
  export: (defaultPath, content) => ipcRenderer.invoke('templates:export', { defaultPath, content }),
  import: () => ipcRenderer.invoke('templates:import'),
  onMenu: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('menu:templates', handler)
    return () => ipcRenderer.removeListener('menu:templates', handler)
  },
})

contextBridge.exposeInMainWorld('cableTemplateAssets', {
  choose: () => ipcRenderer.invoke('template-assets:choose'),
  saveBuffer: (name, data) => ipcRenderer.invoke('template-assets:saveBuffer', { name, data }),
  open: (url) => ipcRenderer.invoke('template-assets:open', url),
  openEditor: (kind, index) => ipcRenderer.invoke('template-editor:open', { kind, index }),
})

contextBridge.exposeInMainWorld('cableSettings', {
  get: () => ipcRenderer.invoke('settings:get'),
  chooseDefaultDir: () => ipcRenderer.invoke('settings:chooseDefaultDir'),
  setDefaultDir: (defaultDir) => ipcRenderer.invoke('settings:setDefaultDir', { defaultDir }),
  onMenu: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('menu:settings', handler)
    return () => ipcRenderer.removeListener('menu:settings', handler)
  },
})

// Мост для автообновления через серверную папку
contextBridge.exposeInMainWorld('cableUpdates', {
  getSettings: () => ipcRenderer.invoke('update:getSettings'),
  setSettings: (settings) => ipcRenderer.invoke('update:setSettings', settings),
  check: () => ipcRenderer.invoke('update:check'),
  download: () => ipcRenderer.invoke('update:download'),
  apply: (staging) => ipcRenderer.invoke('update:apply', { staging }),
  // Подписка на пункт меню Setting → «Обновления…»
  onMenuUpdates: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('menu:updates', handler)
    return () => ipcRenderer.removeListener('menu:updates', handler)
  },
})
