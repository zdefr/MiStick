import { contextBridge, ipcRenderer } from 'electron';
import type { MijiaDesktopApi } from '../shared/contracts/app-api';

const api: MijiaDesktopApi = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
  window: {
    moveTo: (x, y) => ipcRenderer.invoke('window:moveTo', { x, y }),
    toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggleAlwaysOnTop'),
  },
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (patch) => ipcRenderer.invoke('config:save', patch),
    get: (key) => ipcRenderer.invoke('config:get', { key }),
    set: (key, value) => ipcRenderer.invoke('config:set', { key, value }),
  },
};

contextBridge.exposeInMainWorld('mijia', api);