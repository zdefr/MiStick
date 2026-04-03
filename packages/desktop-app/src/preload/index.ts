import { contextBridge, ipcRenderer } from 'electron';
import type { MijiaDesktopApi } from '../shared/contracts/app-api';

const api: MijiaDesktopApi = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    quit: () => ipcRenderer.invoke('app:quit'),
  },
  window: {
    moveTo: (x, y) => ipcRenderer.invoke('window:moveTo', { x, y }),
    toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggleAlwaysOnTop'),
    resetPosition: () => ipcRenderer.invoke('window:resetPosition'),
  },
  auth: {
    startQrLogin: (region) => ipcRenderer.invoke('auth:startQrLogin', { region }),
    pollQrLogin: (ticketId) => ipcRenderer.invoke('auth:pollQrLogin', { ticketId }),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  device: {
    getAll: () => ipcRenderer.invoke('device:getAll'),
    syncFromCloud: (force) => ipcRenderer.invoke('device:syncFromCloud', { force }),
    getStatus: (deviceId) => ipcRenderer.invoke('device:getStatus', { deviceId }),
    control: (command) => ipcRenderer.invoke('device:control', command),
    setAlias: (deviceId, alias) => ipcRenderer.invoke('device:setAlias', { deviceId, alias }),
    setFavorite: (deviceId, isFavorite) => ipcRenderer.invoke('device:setFavorite', { deviceId, isFavorite }),
  },
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (patch) => ipcRenderer.invoke('config:save', patch),
    get: (key) => ipcRenderer.invoke('config:get', { key }),
    set: (key, value) => ipcRenderer.invoke('config:set', { key, value }),
  },
};

contextBridge.exposeInMainWorld('mijia', api);
