const { contextBridge, ipcRenderer } = require('electron')

// Мост для работы с файлами проекта из окна рендерера
contextBridge.exposeInMainWorld('cableFiles', {
  saveAs: (defaultPath, content) => ipcRenderer.invoke('project:saveAs', { defaultPath, content }),
  save: (path, content) => ipcRenderer.invoke('project:save', { path, content }),
  open: () => ipcRenderer.invoke('project:open'),
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
