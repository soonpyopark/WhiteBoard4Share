const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wb4s', {
  isElectron: true,
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  pickDirectory: (options) => ipcRenderer.invoke('dialog:pickDirectory', options ?? {}),
  applyDataRoot: (nextPath) => ipcRenderer.invoke('settings:applyDataRoot', nextPath ?? null),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  getAutoLaunch: () => ipcRenderer.invoke('app:getAutoLaunch'),
  setAutoLaunch: (options) => ipcRenderer.invoke('app:setAutoLaunch', options ?? {}),
});
