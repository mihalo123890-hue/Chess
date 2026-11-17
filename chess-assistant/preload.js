'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = ['state', 'selector:update', 'overlay:update'];

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  send: (channel, payload) => ipcRenderer.send(channel, payload),
  on: (channel, cb) => {
    if (!CHANNELS.includes(channel)) return;
    ipcRenderer.on(channel, (_e, data) => cb(data));
  },
});
