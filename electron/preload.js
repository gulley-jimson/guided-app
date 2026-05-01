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
  openPath: (absolutePath) => ipcRenderer.invoke('shell:openPath', absolutePath),
  getProjectsBase: () => ipcRenderer.invoke('projects:getBase'),
  chooseProjectsBase: () => ipcRenderer.invoke('projects:chooseBase'),
  ensureProjectFolder: (projectId) => ipcRenderer.invoke('projects:ensureFolder', projectId),
  showProjectInFolder: (projectId) => ipcRenderer.invoke('projects:showInFolder', projectId),
  listProjectFiles: (projectId) => ipcRenderer.invoke('projects:listFiles', projectId),
  readProjectImage: (projectId, fileName) => ipcRenderer.invoke('projects:readImage', projectId, fileName),
  saveProjectImage: (projectId, fileName, dataUrl) =>
    ipcRenderer.invoke('projects:saveImage', projectId, fileName, dataUrl),
  deleteProjectFolder: (projectId) => ipcRenderer.invoke('projects:deleteFolder', projectId),
  onAuthDeepLink: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('auth:deep-link', handler);
    return () => ipcRenderer.removeListener('auth:deep-link', handler);
  },
  onUpdateAvailable: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('update:downloaded', handler);
    return () => ipcRenderer.removeListener('update:downloaded', handler);
  },
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  getVersion: () => ipcRenderer.invoke('app:version'),
});
