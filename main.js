const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const koffi = require('koffi');
const game = require('./game');
const OFF = require('./offsets');

const GetAsyncKeyState = koffi.load('user32.dll').func('int16 GetAsyncKeyState(int32)');

// ---------- 保存 ----------
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

let live = {};
function refreshLive() {
  try { live = JSON.parse(readStore().settings || '{}'); } catch { live = {}; }
}

ipcMain.on('store:get', (e, key) => {
  const s = readStore();
  e.returnValue = Object.prototype.hasOwnProperty.call(s, key) ? s[key] : null;
});
ipcMain.on('store:set', (e, key, value) => {
  const s = readStore();
  if (value === null) delete s[key]; else s[key] = value;
  writeStore();
  if (key === 'settings') refreshLive();
});

// ---------- ウィンドウ ----------
let panelWin = null;
let overlayWin = null;
let mode = 'panel';
let timer = null;

function passThrough() {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.setIgnoreMouseEvents(true, { forward: true });
  }
}

function setMode(next) {
  mode = next;
  if (mode === 'panel') {
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide();
    if (panelWin && !panelWin.isDestroyed()) {
      panelWin.show();
      panelWin.focus();
      panelWin.setAlwaysOnTop(true, 'screen-saver');
    }
  } else {
    if (panelWin && !panelWin.isDestroyed()) {
      panelWin.setAlwaysOnTop(false);
      panelWin.hide();
    }
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.showInactive();
      passThrough();
    }
  }
}

function createOverlay() {
  const disp = screen.getPrimaryDisplay();
  overlayWin = new BrowserWindow({
    x: disp.bounds.x,
    y: disp.bounds.y,
    width: disp.bounds.width,
    height: disp.bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    show: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlayWin.webContents.on('did-finish-load', passThrough);
  overlayWin.on('show', passThrough);
  overlayWin.webContents.on('did-fail-load', (_, code, desc) => {
    console.error('overlay load failed', code, desc);
  });
}

function createPanel() {
  panelWin = new BrowserWindow({
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
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  panelWin.setMenuBarVisibility(false);
  panelWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  panelWin.once('ready-to-show', () => setMode('panel'));
  panelWin.webContents.on('did-fail-load', (_, code, desc) => {
    console.error('renderer load failed', code, desc);
  });
  panelWin.webContents.on('console-message', (_, level, msg) => {
    if (level >= 2) console.error('[renderer]', msg);
  });
  panelWin.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      panelWin.webContents.toggleDevTools();
    }
  });
  panelWin.on('closed', () => app.quit());
}

ipcMain.on('win:min', e => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('win:close', e => BrowserWindow.fromWebContents(e.sender)?.close());

// ---------- ループ ----------
let lastStatus = 0;
let lastText = '';
let lastPass = 0;

function status(attached) {
  const now = Date.now();
  const text = attached ? 'VALORANT 接続中' : 'VALORANT 待機中';
  if (now - lastStatus < 500 && text === lastText) return;
  lastStatus = now;
  lastText = text;
  if (panelWin && !panelWin.isDestroyed()) {
    panelWin.webContents.send('status', { attached, text, diag: game.diag });
  }
}

function loop() {
  try {
    const now = Date.now();
    if (now - lastPass > 1000) { lastPass = now; if (mode === 'overlay') passThrough(); }

    const disp = screen.getPrimaryDisplay();
    const W = disp.bounds.width;
    const H = disp.bounds.height;
    const res = game.frame(live, W, H);
    status(res.attached);

    if (panelWin && !panelWin.isDestroyed()) {
      panelWin.webContents.send('diag', res.diag || '');
    }

    if (mode === 'overlay' && overlayWin && !overlayWin.isDestroyed() && res.players) {
      overlayWin.webContents.send('frame', {
        W, H,
        cx: res.cx, cy: res.cy, fovPx: res.fovPx,
        players: res.players,
        localScreen: res.localScreen,
        cfg: {
          enable: live['esp.enable'] !== false,
          box: live['esp.box'] !== false,
          sil: live['esp.sil'] === true,
          hpBar: live['esp.hp'] !== false,
          snap: live['esp.snap'] === true,
          radar: live['esp.radar'] === true,
          wm: live['misc.wm'] !== false,
          outline: live['vis.outline'] || '#a855f7',
          fresnel: live['vis.fresnel'] || '#ec4899',
          ribbon: live['misc.ribbon'] || '#a855f7',
          spec: live['fx.spec'] || 0
        }
      });
    }
  } catch (e) {
    console.error(e);
    game.detach();
  }
}

// ---------- 起動 ----------
let lastToggle = false;

app.whenReady().then(() => {
  refreshLive();
  createOverlay();
  createPanel();
  timer = setInterval(loop, 16);

  setInterval(() => {
    const down = (GetAsyncKeyState(OFF.toggleKey) & 0x8000) !== 0;
    if (down && !lastToggle) setMode(mode === 'panel' ? 'overlay' : 'panel');
    lastToggle = down;
  }, 40);
});

process.on('uncaughtException', e => console.error('uncaught', e));

app.on('window-all-closed', () => {
  if (timer) clearInterval(timer);
  game.detach();
  app.quit();
});
