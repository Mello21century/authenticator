import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
  native: true,
  platform: process.platform,
  getApiUrl: () => ipcRenderer.invoke('config:getApiUrl'),
  setApiUrl: (u: string) => ipcRenderer.invoke('config:setApiUrl', u),
  getRefreshToken: () => ipcRenderer.invoke('session:get'),
  setRefreshToken: (t: string | null) => ipcRenderer.invoke('session:set', t),
  canBiometric: () => ipcRenderer.invoke('lock:canBiometric'),
  unlockBiometric: () => ipcRenderer.invoke('lock:biometric'),
  markUnlocked: () => ipcRenderer.invoke('lock:markUnlocked'),
  isLocked: () => ipcRenderer.invoke('lock:isLocked'),
  getLockTimeout: () => ipcRenderer.invoke('lock:getTimeout'),
  setLockTimeout: (ms: number) => ipcRenderer.invoke('lock:setTimeout', ms),
  onLock(cb: () => void) {
    const h = () => cb();
    ipcRenderer.on('lock:locked', h);
    return () => ipcRenderer.removeListener('lock:locked', h);
  },
});
