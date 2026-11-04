// The small, safe bridge between the two windows and the main process.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const LISTEN = new Set(['snapshot', 'event', 'settings', 'layout', 'preview', 'action', 'status', 'access', 'goto']);
const SEND = new Set(['island:interactive', 'island:command', 'island:open-settings', 'settings:preview', 'settings:test-notification', 'settings:open-external', 'settings:request-access']);
const INVOKE = new Set(['settings:get', 'settings:set', 'settings:reset']);

contextBridge.exposeInMainWorld('winisland', {
  on(channel, cb) {
    if (!LISTEN.has(channel)) return;
    ipcRenderer.on(channel, (_e, data) => cb(data));
  },
  send(channel, data) { if (SEND.has(channel)) ipcRenderer.send(channel, data); },
  invoke(channel, data) { return INVOKE.has(channel) ? ipcRenderer.invoke(channel, data) : Promise.reject(new Error('blocked')); }
});
