'use strict';

const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('node:path');

const APP_ID = 'com.brandon.ballbuster';

app.setAppUserModelId(APP_ID);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 920,
    minWidth: 720,
    minHeight: 620,
    show: false,
    title: "Brandon's Ball Buster",
    backgroundColor: '#150c22',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // No app menu: this is a game, not a browser.
  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Keep navigation inside the game; send any external link to the browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // F11 toggles fullscreen; F12 opens devtools while developing.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      announceFullscreen();
      event.preventDefault();
    } else if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  const announceFullscreen = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:fullscreen', mainWindow.isFullScreen());
    }
  };

  mainWindow.on('enter-full-screen', announceFullscreen);
  mainWindow.on('leave-full-screen', announceFullscreen);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function isMainSender(event) {
  return !!mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents;
}

// The renderer asks the main process to close the game.
ipcMain.on('app:quit', (event) => {
  if (isMainSender(event)) mainWindow.close();
});

// The renderer can toggle the window between windowed and fullscreen.
ipcMain.on('app:toggle-fullscreen', (event) => {
  if (!isMainSender(event)) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:fullscreen', mainWindow.isFullScreen());
  }
});

ipcMain.handle('app:is-fullscreen', (event) => {
  if (!isMainSender(event)) return false;
  return mainWindow.isFullScreen();
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
