const { contextBridge, ipcRenderer } = require('electron')

// Мост для работы с файлами проекта из окна рендерера
contextBridge.exposeInMainWorld('cableFiles', {
  saveAs: (defaultPath, content) => ipcRenderer.invoke('project:saveAs', { defaultPath, content }),
  save: (path, content) => ipcRenderer.invoke('project:save', { path, content }),
  open: () => ipcRenderer.invoke('project:open'),
})
