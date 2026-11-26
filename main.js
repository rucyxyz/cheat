const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const koffi = require('koffi');
const OFF = require('./offsets');

const k32 = koffi.load('kernel32.dll');
const u32 = koffi.load('user32.dll');

const CreateToolhelp32Snapshot = k32.func('uint64 CreateToolhelp32Snapshot(uint32, uint32)');
const Process32First = k32.func('bool Process32First(uint64, _Out_ uint8*)');
const Process32Next = k32.func('bool Process32Next(uint64, _Out_ uint8*)');
const Module32First = k32.func('bool Module32First(uint64, _Out_ uint8*)');
const Module32Next = k32.func('bool Module32Next(uint64, _Out_ uint8*)');
const OpenProcess = k32.func('uint64 OpenProcess(uint32, bool, uint32)');
const CloseHandle = k32.func('bool CloseHandle(uint64)');
const ReadProcessMemory = k32.func('bool ReadProcessMemory(uint64, uint64, _Out_ uint8*, uint64, _Out_ uint64*)');
const GetAsyncKeyState = u32.func('int16 GetAsyncKeyState(int32)');
const mouse_event = u32.func('void mouse_event(uint32, int32, int32, uint32, uint64)');

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

function rd(h, addr, size) {
  const buf = Buffer.alloc(size);
  const n = Buffer.alloc(8);
  if (!ReadProcessMemory(h, BigInt(addr), buf, BigInt(size), n)) return null;
  return buf;
}
const rd32 = (h, a) => { const b = rd(h, a, 4); return b ? b.readInt32LE(0) : 0; };
const rd8 = (h, a) => { const b = rd(h, a, 1); return b ? b.readUInt8(0) : 0; };
const rd64 = (h, a) => { const b = rd(h, a, 8); return b ? b.readBigUInt64LE(0) : 0n; };
const rdv3 = (h, a) => {
  const b = rd(h, a, 12);
  return b ? { x: b.readFloatLE(0), y: b.readFloatLE(4), z: b.readFloatLE(8) } : null;
};

function findPid(name) {
  const snap = CreateToolhelp32Snapshot(0x2, 0);
  if (!snap || snap === 0xFFFFFFFFFFFFFFFFn) return 0;
  const buf = Buffer.alloc(304);
  buf.writeUInt32LE(304, 0);
  let pid = 0;
  if (Process32First(snap, buf)) {
    do {
      const exe = buf.toString('utf8', 44, 304).split('\0')[0];
      if (exe.toLowerCase() === name.toLowerCase()) { pid = buf.readUInt32LE(8); break; }
    } while (Process32Next(snap, buf));
  }
  CloseHandle(snap);
  return pid;
}

function findModule(pid, name) {
  const snap = CreateToolhelp32Snapshot(0x8 | 0x10, pid);
  if (!snap || snap === 0xFFFFFFFFFFFFFFFFn) return 0n;
  const buf = Buffer.alloc(568);
  buf.writeUInt32LE(568, 0);
  let base = 0n;
  if (Module32First(snap, buf)) {
    do {
      const mod = buf.toString('utf8', 48, 304).split('\0')[0];
      if (mod.toLowerCase() === name.toLowerCase()) { base = buf.readBigUInt64LE(24); break; }
    } while (Module32Next(snap, buf));
  }
  CloseHandle(snap);
  return base;
}

let hProc = 0n;
let clientBase = 0n;
let attached = false;

function attach() {
  const pid = findPid(OFF.process);
  if (!pid) { attached = false; return false; }
  const h = OpenProcess(0x10 | 0x8 | 0x400, false, pid);
  if (!h) { attached = false; return false; }
  const base = findModule(pid, OFF.modules.client);
  if (!base) { CloseHandle(h); attached = false; return false; }
  hProc = h;
  clientBase = base;
  attached = true;
  return true;
}

function bonePos(h, pawn, idx) {
  const node = rd64(h, pawn + BigInt(OFF.m_pGameSceneNode));
  if (!node) return null;
  const arr = rd64(h, node + BigInt(OFF.m_modelState) + BigInt(OFF.boneArray));
  if (!arr) return null;
  return rdv3(h, arr + BigInt(idx * OFF.boneStride) + BigInt(OFF.bonePos));
}

function project(m, x, y, z, w, h) {
  const cw = m[12] * x + m[13] * y + m[14] * z + m[15];
  if (cw < 0.01) return null;
  const cx = m[0] * x + m[1] * y + m[2] * z + m[3];
  const cy = m[4] * x + m[5] * y + m[6] * z + m[7];
  return { x: (w / 2) * (1 + cx / cw), y: (h / 2) * (1 - cy / cw) };
}

let panelWin = null;
let overlayWin = null;
let overlayHidden = true;
let dragTimer = null;

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
      nodeIntegration: false
    }
  });
  panelWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  panelWin.once('ready-to-show', () => panelWin.show());
  panelWin.on('closed', () => app.quit());
}

function createOverlay() {
  overlayWin = new BrowserWindow({
    fullscreen: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
}

ipcMain.on('win:min', e => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('win:close', e => BrowserWindow.fromWebContents(e.sender)?.close());

ipcMain.on('win:dragstart', e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  const start = screen.getCursorScreenPoint();
  const b = win.getBounds();
  const offX = start.x - b.x;
  const offY = start.y - b.y;
  clearInterval(dragTimer);
  dragTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    win.setBounds({ x: p.x - offX, y: p.y - offY, width: b.width, height: b.height });
  }, 8);
});

ipcMain.on('win:dragend', () => {
  clearInterval(dragTimer);
  dragTimer = null;
});

const prevPos = new Map();
let lastStatus = 0;

function sendStatus() {
  const now = Date.now();
  if (now - lastStatus < 500) return;
  lastStatus = now;
  const text = attached ? 'cs2.exe 接続中' : 'cs2.exe 待機中';
  if (panelWin) panelWin.webContents.send('status', { attached, text });
}

function frame() {
  try {
    if (!attached && !attach()) { sendStatus(); return; }
    sendStatus();

    const disp = screen.getPrimaryDisplay().bounds;
    const W = disp.width;
    const H = disp.height;

    const mtx = rd(hProc, clientBase + BigInt(OFF.dwViewMatrix), 64);
    if (!mtx) { attached = false; return; }
    const m = [];
    for (let i = 0; i < 16; i++) m.push(mtx.readFloatLE(i * 4));

    const localPawn = rd64(hProc, clientBase + BigInt(OFF.dwLocalPlayerPawn));
    if (!localPawn) return;
    const localTeam = rd8(hProc, localPawn + BigInt(OFF.m_iTeamNum));
    const localNode = rd64(hProc, localPawn + BigInt(OFF.m_pGameSceneNode));
    const localOrigin = localNode ? rdv3(hProc, localNode + BigInt(OFF.m_vecAbsOrigin)) : null;

    const list = rd64(hProc, clientBase + BigInt(OFF.dwEntityList));
    const players = [];
    let best = null;
    const cx = W / 2;
    const cy = H / 2;
    const fovPx = ((live['aim.fov'] || 98) / 180) * H;

    for (let i = 1; i < 64 && list; i++) {
      const chunk = rd64(hProc, list + BigInt(OFF.entChunkSize * (i >> OFF.entChunkShift)));
      if (!chunk) continue;
      const pawn = rd64(hProc, chunk + BigInt(OFF.entStride * (i & ((1 << OFF.entChunkShift) - 1))));
      if (!pawn) continue;

      const hp = rd32(hProc, pawn + BigInt(OFF.m_iHealth));
      if (hp < 1 || hp > 200) continue;
      if (rd8(hProc, pawn + BigInt(OFF.m_lifeState)) !== 0) continue;
      const team = rd8(hProc, pawn + BigInt(OFF.m_iTeamNum));

      const head = bonePos(hProc, pawn, OFF.bones.head);
      const foot = bonePos(hProc, pawn, OFF.bones.footL);
      if (!head || !foot) continue;

      const hs = project(m, head.x, head.y, head.z, W, H);
      const fs = project(m, foot.x, foot.y, foot.z, W, H);
      if (!hs || !fs) continue;

      const hgt = Math.abs(fs.y - hs.y);
      if (hgt < 6) continue;

      const p = {
        x: hs.x, y: hs.y,
        bx: hs.x - hgt / 4, by: hs.y,
        bw: hgt / 2, bh: hgt,
        hp, team, local: team === localTeam
      };
      players.push(p);

      if (!p.local && hs.x > 0 && hs.x < W && hs.y > 0 && hs.y < H) {
        const d = Math.hypot(hs.x - cx, hs.y - cy);
        if (d < fovPx && (!best || d < best.d)) best = { d, x: hs.x, y: hs.y, p };
      }

      prevPos.set(pawn, { x: head.x, y: head.y, z: head.z });
    }

    let localScreen = null;
    if (localOrigin) {
      const ls = project(m, localOrigin.x, localOrigin.y, localOrigin.z, W, H);
      if (ls) localScreen = ls;
    }

    if (overlayWin && !overlayHidden) {
      overlayWin.webContents.send('frame', {
        W, H, cx, cy, fovPx, players, localScreen,
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

    if (live['aim.enable'] && best && (GetAsyncKeyState(OFF.aimKey) & 0x8000)) {
      const smooth = 1 + (live['aim.delay'] || 0) / 20;
      const tx = best.x;
      const ty = live['aim.pred'] ? best.y - best.p.bh * 0.08 : best.y;
      const dx = Math.round((tx - cx) / smooth);
      const dy = Math.round((ty - cy) / smooth);
      if (dx || dy) mouse_event(0x0001, dx, dy, 0, 0n);
    }
  } catch (e) {
    attached = false;
  }
}

let lastToggle = false;

app.whenReady().then(() => {
  refreshLive();
  createPanel();
  createOverlay();
  setInterval(frame, 16);

  setInterval(() => {
    const down = (GetAsyncKeyState(OFF.toggleKey) & 0x8000) !== 0;
    if (down && !lastToggle) {
      overlayHidden = !overlayHidden;
      if (overlayHidden) {
        if (overlayWin) overlayWin.hide();
        if (panelWin) { panelWin.show(); panelWin.focus(); }
      } else {
        if (panelWin) panelWin.hide();
        if (overlayWin) overlayWin.showInactive();
      }
    }
    lastToggle = down;
  }, 40);
});

app.on('window-all-closed', () => app.quit());
