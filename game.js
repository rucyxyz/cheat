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
const VirtualQueryEx = k32.func('uint64 VirtualQueryEx(uint64, uint64, _Out_ uint8*, uint64)');
const GetAsyncKeyState = u32.func('int16 GetAsyncKeyState(int32)');
const mouse_event = u32.func('void mouse_event(uint32, int32, int32, uint32, uint64)');

const TH32CS_SNAPPROCESS = 0x2;
const TH32CS_SNAPMODULE = 0x8;
const TH32CS_SNAPMODULE32 = 0x10;

const PROCESS_VM_READ = 0x10;
const PROCESS_QUERY_INFORMATION = 0x400;

const MEM_COMMIT = 0x1000;
const MEM_PRIVATE = 0x20000;
const WRITABLE = [0x04, 0x08, 0x40, 0x80];

const PTR_MIN = 0x10000n;
const PTR_MAX = 0x7FFFFFFF0000n;

let hProc = 0n;
let clientBase = 0n;
let clientSize = 0n;
let attached = false;

let world = 0n;
let localPC = 0n;
let localPawn = 0n;
let localTeam = -1;

let eye = null;
let fwd = null;
let right = null;
let up = null;
let fovX = 103;

let diag = 'idle';
let scan = null;

// ---------- 基本メモリ ----------
function rd(h, addr, size) {
  const buf = Buffer.alloc(size);
  const n = Buffer.alloc(8);
  if (!ReadProcessMemory(h, BigInt(addr), buf, BigInt(size), n)) return null;
  return buf;
}
const rd8 = (h, a) => { const b = rd(h, a, 1); return b ? b.readUInt8(0) : 0; };
const rd32 = (h, a) => { const b = rd(h, a, 4); return b ? b.readInt32LE(0) : 0; };
const rdf = (h, a) => { const b = rd(h, a, 4); return b ? b.readFloatLE(0) : 0; };
const rd64 = (h, a) => { const b = rd(h, a, 8); return b ? b.readBigUInt64LE(0) : 0n; };
const rdv3 = (h, a) => {
  const b = rd(h, a, 12);
  return b ? { x: b.readFloatLE(0), y: b.readFloatLE(4), z: b.readFloatLE(8) } : null;
};
const ok = (p) => p && p > PTR_MIN && p < PTR_MAX;
const sane = (v) => Number.isFinite(v) && Math.abs(v) < 1e7;

// ---------- プロセス ----------
function findPid(name) {
  const snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (!snap || snap === 0xFFFFFFFFFFFFFFFFn) return 0;
  const buf = Buffer.alloc(568);
  buf.writeUInt32LE(568, 0);
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
  const snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid);
  if (!snap || snap === 0xFFFFFFFFFFFFFFFFn) return null;
  const buf = Buffer.alloc(568);
  buf.writeUInt32LE(568, 0);
  let base = 0n;
  let size = 0n;
  if (Module32First(snap, buf)) {
    do {
      const mod = buf.toString('utf8', 48, 304).split('\0')[0];
      if (mod.toLowerCase() === name.toLowerCase()) {
        base = buf.readBigUInt64LE(24);
        size = BigInt(buf.readUInt32LE(32));
        break;
      }
    } while (Module32Next(snap, buf));
  }
  CloseHandle(snap);
  return base ? { base, size } : null;
}

// ---------- 書き込み可能領域の列挙 ----------
function regions() {
  const out = [];
  const mbi = Buffer.alloc(48);
  let addr = 0x10000n;
  const limit = 0x7FFFFFFF0000n;
  while (addr < limit) {
    const n = VirtualQueryEx(hProc, addr, mbi, BigInt(48));
    if (!n) break;
    const base = mbi.readBigUInt64LE(0);
    const size = mbi.readBigUInt64LE(0x18);
    const state = mbi.readUInt32LE(0x20);
    const protect = mbi.readUInt32LE(0x24);
    const type = mbi.readUInt32LE(0x28);
    if (size === 0n) break;
    if (state === MEM_COMMIT && type === MEM_PRIVATE && WRITABLE.indexOf(protect) >= 0) {
      out.push({ base, size });
    }
    addr = base + size;
  }
  return out;
}

// ---------- UWorld 検証 / スキャン ----------
function validWorld(w) {
  if (!ok(w)) return false;
  const level = rd64(hProc, w + BigInt(OFF.persistentLevel));
  if (!ok(level)) return false;
  const arr = rd64(hProc, level + BigInt(OFF.actors));
  if (!ok(arr)) return false;
  const count = rd32(hProc, level + BigInt(OFF.actors) + BigInt(OFF.arrayCount));
  if (count < 8 || count > 200000) return false;
  const first = rd64(hProc, arr);
  if (!ok(first)) return false;
  return true;
}

function startScan() {
  const list = regions();
  scan = { list, ri: 0, off: 0n, buf: Buffer.alloc(0), used: 0 };
  diag = 'scan: ' + list.length + ' regions';
}

function scanStep() {
  if (!scan) return 0n;
  const BUDGET = 512 * 1024;
  let done = 0;
  while (scan && done < BUDGET) {
    if (scan.ri >= scan.list.length) { scan = null; return 0n; }
    const reg = scan.list[scan.ri];
    const left = reg.size - scan.off;
    if (left <= 0n) { scan.ri++; scan.off = 0n; continue; }
    const take = Number(left < 1024n * 1024n ? left : 1024n * 1024n);
    const buf = rd(hProc, reg.base + scan.off, take);
    if (!buf) { scan.ri++; scan.off = 0n; continue; }
    for (let i = 0; i + 8 <= take; i += 8) {
      const w = buf.readBigUInt64LE(i);
      if (!ok(w) || (w & 7n) !== 0n) continue;
      if (validWorld(w)) { scan = null; return w; }
    }
    scan.off += BigInt(take);
    done += take;
  }
  return 0n;
}

// ---------- アタッチ ----------
function detach() {
  attached = false;
  world = 0n;
  localPC = 0n;
  localPawn = 0n;
  localTeam = -1;
  eye = null;
  scan = null;
  if (hProc) { CloseHandle(hProc); hProc = 0n; }
}

function attach() {
  const pid = findPid(OFF.process);
  if (!pid) { diag = 'waiting process'; return false; }
  const h = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, false, pid);
  if (!h) { diag = 'OpenProcess failed'; return false; }
  const mod = findModule(pid, OFF.modules.client);
  if (!mod) { CloseHandle(h); diag = 'module not found'; return false; }
  hProc = h;
  clientBase = mod.base;
  clientSize = mod.size;
  attached = true;
  diag = 'attached';

  if (OFF.dwUWorld) {
    const w = rd64(hProc, clientBase + BigInt(OFF.dwUWorld));
    if (validWorld(w)) { world = w; diag = 'world: static'; return true; }
  }
  startScan();
  return true;
}

// ---------- ローカルプレイヤー ----------
function resolveLocal() {
  const gi = rd64(hProc, world + BigInt(OFF.owningGameInstance));
  if (!ok(gi)) return false;
  const players = rd64(hProc, gi + BigInt(OFF.localPlayers));
  if (!ok(players)) return false;
  const lp = rd64(hProc, players);
  if (!ok(lp)) return false;
  const pc = rd64(hProc, lp + BigInt(OFF.localPlayerController));
  if (!ok(pc)) return false;
  const pawn = rd64(hProc, pc + BigInt(OFF.acknowledgedPawn));
  if (!ok(pawn)) return false;
  const root = rd64(hProc, pawn + BigInt(OFF.rootComponent));
  if (!ok(root)) return false;

  localPC = pc;
  localPawn = pawn;
  const ps = rd64(hProc, pawn + BigInt(OFF.playerState));
  localTeam = ok(ps) ? rd32(hProc, ps + BigInt(OFF.teamNum)) : -1;
  diag = 'local resolved';
  return true;
}

function resolveCamera() {
  eye = null;
  if (!ok(localPC)) return false;

  const pcm = rd64(hProc, localPC + BigInt(OFF.playerCameraManager));
  if (ok(pcm)) {
    const base = pcm + BigInt(OFF.cameraCache) + BigInt(OFF.povLocation);
    const loc = rdv3(hProc, base);
    const rot = rdv3(hProc, base + BigInt(OFF.povRotation - OFF.povLocation));
    if (loc && rot && sane(loc.x) && sane(loc.y) && sane(loc.z)
        && rot.x >= -89.5 && rot.x <= 89.5 && Math.abs(rot.y) <= 360) {
      eye = loc;
      fovX = rdf(hProc, base + BigInt(OFF.povFov - OFF.povLocation)) || fovX;
      buildAxes(rot.x, rot.y);
      return true;
    }
  }

  const root = rd64(hProc, localPawn + BigInt(OFF.rootComponent));
  const loc = ok(root) ? rdv3(hProc, root + BigInt(OFF.relativeLocation)) : null;
  if (!loc || !sane(loc.x) || !sane(loc.y) || !sane(loc.z)) return false;
  eye = { x: loc.x, y: loc.y, z: loc.z + OFF.headOffset };

  const rot = rdv3(hProc, localPC + BigInt(OFF.controlRotation));
  if (!rot || rot.x < -89.5 || rot.x > 89.5 || Math.abs(rot.y) > 360) return false;
  buildAxes(rot.x, rot.y);
  return true;
}

function buildAxes(pitch, yaw) {
  const d = Math.PI / 180;
  const sp = Math.sin(pitch * d), cp = Math.cos(pitch * d);
  const sy = Math.sin(yaw * d), cy = Math.cos(yaw * d);
  fwd = { x: cp * cy, y: cp * sy, z: sp };
  right = { x: -sy, y: cy, z: 0 };
  up = { x: -sp * cy, y: -sp * sy, z: cp };
}

function project(p, W, H) {
  if (!eye || !fwd) return null;
  const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
  const depth = fwd.x * dx + fwd.y * dy + fwd.z * dz;
  if (depth < 1) return null;
  const tanX = Math.tan((fovX * Math.PI / 180) / 2);
  const tanY = tanX / (W / H);
  const vx = right.x * dx + right.y * dy + right.z * dz;
  const vy = up.x * dx + up.y * dy + up.z * dz;
  return {
    x: (W / 2) * (1 + (vx / depth) / tanX),
    y: (H / 2) * (1 - (vy / depth) / tanY),
    depth
  };
}

// ---------- プレイヤー列挙 ----------
function players(W, H) {
  const level = rd64(hProc, world + BigInt(OFF.persistentLevel));
  if (!ok(level)) return [];
  const arr = rd64(hProc, level + BigInt(OFF.actors));
  const count = rd32(hProc, level + BigInt(OFF.actors) + BigInt(OFF.arrayCount));
  if (!ok(arr) || count < 1) return [];

  const out = [];
  const max = Math.min(count, 20000);
  const chunk = Buffer.alloc(8 * Math.min(max, 512));
  let best = null;

  for (let start = 0; start < max; start += 512) {
    const n = Math.min(512, max - start);
    if (!ReadProcessMemory(hProc, arr + BigInt(start * 8), chunk, BigInt(n * 8), Buffer.alloc(8))) continue;
    for (let i = 0; i < n; i++) {
      const actor = chunk.readBigUInt64LE(i * 8);
      if (!ok(actor) || actor === localPawn) continue;

      const hp = rdf(hProc, actor + BigInt(OFF.health));
      if (!(hp > 0 && hp <= 200)) continue;

      const root = rd64(hProc, actor + BigInt(OFF.rootComponent));
      if (!ok(root)) continue;
      const loc = rdv3(hProc, root + BigInt(OFF.relativeLocation));
      if (!loc || !sane(loc.x) || !sane(loc.y) || !sane(loc.z)) continue;

      const dist = Math.hypot(loc.x - eye.x, loc.y - eye.y, loc.z - eye.z);
      if (dist > OFF.maxDistance) continue;

      const head = project({ x: loc.x, y: loc.y, z: loc.z + OFF.headOffset }, W, H);
      const foot = project({ x: loc.x, y: loc.y, z: loc.z - OFF.footOffset }, W, H);
      if (!head || !foot) continue;
      const hgt = Math.abs(foot.y - head.y);
      if (hgt < 4) continue;

      const ps = rd64(hProc, actor + BigInt(OFF.playerState));
      const team = ok(ps) ? rd32(hProc, ps + BigInt(OFF.teamNum)) : -1;
      const local = localTeam >= 0 && team === localTeam;

      const p = {
        x: head.x, y: head.y,
        bx: head.x - hgt / 4, by: head.y,
        bw: hgt / 2, bh: hgt,
        hp, team, local, dist
      };
      out.push(p);

      const cx = W / 2, cy = H / 2;
      const d = Math.hypot(head.x - cx, head.y - cy);
      if (!local && head.x > 0 && head.x < W && head.y > 0 && head.y < H) {
        if (!best || d < best.d) best = { d, x: head.x, y: head.y, p };
      }
    }
  }
  return { list: out, best };
}

// ---------- 1フレーム ----------
function frame(settings, W, H) {
  if (!attached && !attach()) return { attached: false, diag };

  if (!world) {
    const found = scanStep();
    if (found) { world = found; diag = 'world: scanned'; }
    else return { attached: true, diag, players: [], localScreen: null };
  }

  if (!localPawn || !ok(rd64(hProc, localPawn + BigInt(OFF.rootComponent)))) {
    if (!resolveLocal()) { diag = 'local player not resolved'; return { attached: true, diag }; }
  }
  if (!eye && !resolveCamera()) {
    diag = 'camera not resolved';
    return { attached: true, diag };
  }

  const res = players(W, H);
  const cx = W / 2, cy = H / 2;
  const fovPx = ((settings['aim.fov'] || 8) / 180) * H;

  if (settings['aim.enable'] && res.best && (GetAsyncKeyState(OFF.aimKey) & 0x8000)) {
    const smooth = 1 + (settings['aim.delay'] || 0) / 20;
    let ty = res.best.y;
    if (settings['aim.pred']) ty -= res.best.p.bh * 0.1;
    const dx = Math.round((res.best.x - cx) / smooth);
    const dy = Math.round((ty - cy) / smooth);
    if (dx || dy) mouse_event(0x0001, dx, dy, 0, 0n);
  }

  const localRoot = rd64(hProc, localPawn + BigInt(OFF.rootComponent));
  const localLoc = ok(localRoot) ? rdv3(hProc, localRoot + BigInt(OFF.relativeLocation)) : null;
  const localScreen = localLoc ? project(localLoc, W, H) : null;

  diag = 'actors ok / ' + res.list.length;
  return { attached: true, diag, players: res.list, localScreen, cx, cy, fovPx };
}

module.exports = {
  frame,
  detach,
  get attached() { return attached; },
  get diag() { return diag; }
};
