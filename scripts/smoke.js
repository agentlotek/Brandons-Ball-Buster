'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1120,
    height: 920,
    show: false,
    backgroundColor: '#150c22',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  const logs = [];
  win.webContents.on('console-message', (event) => {
    logs.push({ level: event.level, message: event.message });
  });
  win.webContents.on('did-fail-load', (event, code, desc) => {
    logs.push({ level: 'fail-load', message: `${code} ${desc}` });
  });

  await win.loadFile(path.join(__dirname, '..', 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 800));

  const info = await win.webContents.executeJavaScript(`(() => {
    const board = document.querySelector('#board');
    const rect = document.querySelector('#boardArea').getBoundingClientRect();
    const overlay = document.querySelector('#overlay');
    return {
      title: document.title,
      fontLoaded: document.fonts.check('700 24px "Baloo 2"'),
      fontStatus: document.fonts.status,
      overlayVisible: !overlay.classList.contains('hidden'),
      board: { w: Math.round(rect.width), h: Math.round(rect.height) },
      boardCanvas: { w: board.width, h: board.height },
      viewport: [innerWidth, innerHeight],
      bodyScrollHeight: document.body.scrollHeight,
    };
  })()`);

  await win.webContents.executeJavaScript(`document.querySelector('#overlayBtn').click()`);
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Play a handful of quick moves so the capture shows a populated board.
  await win.webContents.executeJavaScript(`(() => {
    const fire = (code, key) => document.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }));
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'];
    for (let i = 0; i < 7; i++) {
      fire(keys[i % keys.length], keys[i % keys.length] === 'Space' ? ' ' : keys[i % keys.length]);
      fire('Space', ' ');
    }
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 900));

  const gameplay = await win.webContents.executeJavaScript(`({
    score: document.querySelector('#score').textContent,
    best: document.querySelector('#best').textContent,
    lines: document.querySelector('#lines').textContent,
    level: document.querySelector('#level').textContent,
    overlayVisible: !document.querySelector('#overlay').classList.contains('hidden'),
    overlayTitle: document.querySelector('#overlayTitle').textContent
  })`);

  const image = await win.webContents.capturePage();
  const out = path.join(__dirname, '..', 'desktop-preview.png');
  fs.writeFileSync(out, image.toPNG());

  const size = image.getSize();
  const bitmap = image.toBitmap();
  let nonBackground = 0;
  for (let i = 0; i < bitmap.length; i += 4) {
    const b = bitmap[i];
    const g = bitmap[i + 1];
    const r = bitmap[i + 2];
    if (Math.abs(r - 21) + Math.abs(g - 12) + Math.abs(b - 34) > 30) nonBackground++;
  }

  process.stdout.write(
    JSON.stringify(
      {
        info,
        gameplay,
        capture: { size, nonBackgroundPixels: nonBackground, path: out },
        logs,
      },
      null,
      2
    )
  );

  win.destroy();
  app.quit();
});
