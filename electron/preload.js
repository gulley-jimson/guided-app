const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('guided', {
  version: '0.1.0',
  hide: () => ipcRenderer.send('window:hide'),
  minimize: () => ipcRenderer.send('window:minimize'),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:always-on-top:get'),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('window:always-on-top:set', enabled),
  saveEnvKey: (key) => ipcRenderer.invoke('env:saveKey', key),
  captureScreen: () => ipcRenderer.invoke('screen:capture'),
  getActiveApp: () => ipcRenderer.invoke('app:get'),
  onAppChanged: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('app:changed', handler);
    return () => ipcRenderer.removeListener('app:changed', handler);
  },
  getLaunchAtStartup: () => ipcRenderer.invoke('startup:get'),
  setLaunchAtStartup: (enabled) => ipcRenderer.invoke('startup:set', enabled),
  showPointer: (payload) => ipcRenderer.invoke('pointer:show', payload),
  searchImages: (query) => ipcRenderer.invoke('images:search', query),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});
