'use strict';
// The only bridge between the UI and the system. Keep it small.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sa3a', {
  loadData: () => ipcRenderer.sendSync('store:get-sync'),
  save: (key, value) => ipcRenderer.invoke('store:set', key, value),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke('login:set', enabled),
  getOpenAtLogin: () => ipcRenderer.invoke('login:get'),
  showWindow: () => ipcRenderer.invoke('win:show'),
  flashWindow: () => ipcRenderer.invoke('win:flash'),
  updateTray: (tooltip, labels) => ipcRenderer.invoke('tray:update', tooltip, labels),
  notify: (opts) => ipcRenderer.invoke('notify', opts),
  pickAudioFile: () => ipcRenderer.invoke('dialog:audio'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  appInfo: () => ipcRenderer.invoke('app:info'),
  quit: () => ipcRenderer.invoke('app:quit'),
  onResume: (fn) => ipcRenderer.on('system:resume', () => fn()),
  onSystemTheme: (fn) => ipcRenderer.on('system:theme', () => fn()),
});
