'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Minimal, explicit bridge: quit the app, toggle fullscreen, and listen for
// fullscreen changes made outside the page (for example with F11).
contextBridge.exposeInMainWorld('desktop', {
  quit: () => ipcRenderer.send('app:quit'),
  toggleFullscreen: () => ipcRenderer.send('app:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('app:is-fullscreen'),
  onFullscreenChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (event, value) => callback(Boolean(value));
    ipcRenderer.on('app:fullscreen', handler);
    return () => ipcRenderer.removeListener('app:fullscreen', handler);
  },
});
