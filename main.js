const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const storePath = () => path.join(app.getPath('userData'), 'settings.json');
let cache = null;

function readStore() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(storePath(), 'utf8')); }
  catch { cache = {}; }
  return cache;
}
function writeStore() {
  try { fs.writeFileSync(storePath(), JSON.stringify(cache, null, 2)); } catch {}
}

ipcMain.on('store:get', (e, key) => {
  const s = readStore();
  e.returnValue = Object.prototype.hasOwnProperty.call(s, key) ? s[key] : null;
});
ipcMain.on('store:set', (e, key, value) => {
  const s = readStore();
  if (value === null) delete s[key]; else s[key] = value;
  writeStore();
});
ipcMain.on('win:min', e => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('win:close', e => BrowserWindow.fromWebContents(e.sender)?.close());

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 940,
    height: 640,
    minWidth: 800,
    minHeight: 540,
    frame: false,
    backgroundColor: '#09050f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  win.webContents.openDevTools({ mode: 'detach' });
});

app.on('window-all-closed', () => app.quit());
