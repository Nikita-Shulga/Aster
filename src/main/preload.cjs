'use strict';
const {contextBridge, ipcRenderer} = require('electron');

const listeners = new Set();
ipcRenderer.on('aster:event', (_e, payload) => { for (const fn of listeners) fn(payload); });

contextBridge.exposeInMainWorld('aster', Object.freeze({
  invoke: (method, args) => ipcRenderer.invoke('aster:invoke', String(method), args),
  on: fn => { if (typeof fn !== 'function') throw new TypeError('callback required'); listeners.add(fn); return () => listeners.delete(fn); },
  platform: process.platform
}));
