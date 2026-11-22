(function () {
  const statEl = document.getElementById('stat');
  if (statEl) statEl.textContent = 'app.js 読込済み';
  console.log('app.js loaded');

  function fatal(msg) {
    const bar = document.getElementById('err');
    if (bar) {
      bar.hidden = false;
      bar.textContent = String(msg);
      return;
    }
    const c = document.getElementById('content');
    if (!c) return;
    c.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'card accent';
    box.style.cssText = 'flex-direction:column;align-items:flex-start';
    const t = document.createElement('div');
    t.className = 'ctitle';
    t.textContent = 'Script error';
    const d = document.createElement('div');
    d.className = 'cdesc';
    d.style.whiteSpace = 'pre-wrap';
    d.style.userSelect = 'text';
    d.textContent = String(msg);
    box.append(t, d);
    c.appendChild(box);
  }
  window.addEventListener('error', ev => fatal(ev.message + ' @ ' + (ev.filename || '') + ':' + ev.lineno));

  let hasBridge = false;
  const LS = (() => {
    try {
      if (window.api && window.api.store) {
        const s = window.api.store;
        s.get('__probe');
        hasBridge = true;
        return {
          getItem: k => s.get(k),
          setItem: (k, v) => s.set(k, String(v)),
          removeItem: k => s.set(k, null)
        };
      }
    } catch (e) {}
    return {
      getItem: k => localStorage.getItem(k),
      setItem: (k, v) => localStorage.setItem(k, v),
      removeItem: k => localStorage.removeItem(k)
    };
  })();

  const I = {
    aim: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>',
    esp: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>',
    vis: '<svg viewBox="0 0 24 24"><path d="M12 3.2c3.3 3.9 5.5 6.6 5.5 9.6a5.5 5.5 0 0 1-11 0c0-3 2.2-5.7 5.5-9.6Z"/></svg>',
    misc: '<svg viewBox="0 0 24 24"><path d="M14.5 6.5a3.6 3.6 0 0 0 4.8 4.6L21 13l-8 8-1.9-1.7a3.6 3.6 0 0 0-4.8-4.6L4.5 13l8-8 2 1.5Z"/></svg>',
    skin: '<svg viewBox="0 0 24 24"><path d="M8 4l4 2 4-2 3 3-2.5 3v8H7.5v-8L5 7l3-3Z"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="12" rx="2.5"/><circle cx="12" cy="13" r="3.2"/><path d="M8.5 7l1.2-2h4.6L15.5 7"/></svg>',
    fx: '<svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"/></svg>',
    setup: '<svg viewBox="0 0 24 24"><path d="M4 8h7M15 8h5M4 16h4M12 16h8"/><circle cx="13" cy="8" r="2"/><circle cx="10" cy="16" r="2"/></svg>'
  };

  const TABS = [
    { id: 'aimbot', title: 'Aimbot', sub: 'Aimbot Settings', icon: I.aim, head: 'Aimbot Settings', cards: [
      { accent: true, rows: [{ t: 'tog', id: 'aim.enable', label: 'Enable Aimbot', desc: 'Locks onto targets inside your FOV' }] },
      { rows: [{ t: 'sl', id: 'aim.fov', label: 'Aim FOV', desc: 'Lock-on radius around the crosshair', min: 1, max: 180, step: 1, unit: '°' }] },
      { rows: [{ t: 'sl', id: 'aim.delay', label: 'Delay', desc: 'Reaction time before the lock', min: 0, max: 250, step: 5, unit: ' ms' }] },
      { rows: [{ t: 'tog', id: 'aim.pred', label: 'Prediction', desc: 'Leads shots on moving targets' }] },
      { rows: [{ t: 'tog', id: 'aim.spread', label: 'No Spread', desc: 'Remove weapon spread entirely' }] }
    ]},
    { id: 'esp', title: 'ESP', sub: 'ESP Settings', icon: I.esp, head: 'ESP Settings', cards: [
      { accent: true, rows: [{ t: 'tog', id: 'esp.enable', label: 'Enable ESP', desc: 'Draw enemies through the world' }] },
      { rows: [{ t: 'tog', id: 'esp.box', label: '2D Box', desc: 'Outline drawn around every enemy' }] },
      { rows: [{ t: 'tog', id: 'esp.sil', label: 'Silhouette', desc: 'Fill enemies through walls' }] },
      { rows: [{ t: 'tog', id: 'esp.hp', label: 'Health', desc: 'Remaining HP above each player' }] },
      { rows: [{ t: 'tog', id: 'esp.radar', label: 'Off-screen positions on a minimap' }] },
      { rows: [{ t: 'tog', id: 'esp.snap', label: 'Snaplines', desc: 'Line from you to each enemy' }] }
    ]},
    { id: 'vis', title: 'Visuals', sub: 'Colour Settings', icon: I.vis, head: 'Colour Settings', cards: [
      { rows: [{ t: 'col', id: 'vis.outline', label: 'Outline', desc: 'Enemy silhouette outline' }] },
      { rows: [{ t: 'col', id: 'vis.weapon', label: 'Weapon Outline', desc: 'Held weapon outline' }] },
      { rows: [{ t: 'col', id: 'vis.fresnel', label: 'Fresnel', desc: 'Rim light on enemy models' }] },
      { rows: [{ t: 'col', id: 'vis.occ', label: 'Occluded', desc: 'Enemies hidden behind geometry' }] },
      { rows: [{ t: 'col', id: 'vis.cham', label: 'Gun Cham', desc: 'Your own weapon material' }] },
      { rows: [{ t: 'col', id: 'vis.self', label: 'Self Fresnel', desc: 'Rim light on your own hands' }] }
    ]},
    { id: 'misc', title: 'Misc', sub: 'Misc Settings', icon: I.misc, head: 'Misc Settings', cards: [
      { rows: [{ t: 'tog', id: 'misc.tracer', label: 'Bullet Tracers', desc: 'Draw the path of every shot' }] },
      { rows: [{ t: 'tog', id: 'misc.skins', label: 'CS2 Skins', desc: 'Swap weapons for CS2 finishes' }] },
      { rows: [{ t: 'tog', id: 'misc.bhop', label: 'Bunny Hop', desc: 'Auto-jump on landing' }] },
      { rows: [{ t: 'tog', id: 'misc.flash', label: 'Anti-Flash', desc: 'Ignore flashbang blindness' }] },
      { rows: [{ t: 'tog', id: 'misc.wm', label: 'Watermark', desc: 'Show the build in the corner' }] },
      { rows: [{ t: 'col', id: 'misc.ribbon', label: 'Ribbon Colour', desc: 'Tint applied to the ribbon' }] }
    ]},
    { id: 'skin', title: 'Skin', sub: 'Skin Settings', icon: I.skin, head: 'Skin Settings', cards: [
      { rows: [{ t: 'act', id: 'skin.unlock', label: 'Unlock All Skins', desc: 'Grant every skin in the store', text: 'Unlock All' }] },
      { rows: [{ t: 'tog', id: 'skin.coll', label: 'Collection Changer', desc: 'Apply a full collection at once' }] },
      { rows: [{ t: 'tog', id: 'skin.eject', label: 'Eject Shells', desc: 'Show casings leaving the weapon' }] },
      { rows: [{ t: 'tog', id: 'skin.binds', label: 'Buy Binds', desc: 'One key buys your loadout' }] },
      { rows: [{ t: 'sl', id: 'skin.buddy', label: 'Buddy Size', desc: 'Scale of the weapon charm', min: 25, max: 200, step: 5, unit: '%' }] }
    ]},
    { id: 'tp', title: 'Thirdperson', sub: 'Camera Settings', icon: I.cam, head: 'Camera Settings', cards: [
      { accent: true, rows: [{ t: 'tog', id: 'tp.enable', label: 'Enable Thirdperson', desc: 'Pull the camera behind you' }] },
      { rows: [{ t: 'tog', id: 'tp.big', label: 'Big Weapons', desc: 'Oversized weapon models' }] },
      { rows: [{ t: 'sl', id: 'tp.dist', label: 'Distance', desc: 'How far the camera pulls back', min: 40, max: 220, step: 5, unit: '' }] },
      { rows: [{ t: 'sl', id: 'tp.h', label: 'Height', desc: 'Camera offset above the head', min: -30, max: 90, step: 2, unit: '' }] },
      { rows: [{ t: 'tog', id: 'tp.spin', label: 'Spin', desc: 'Rotate the camera continuously' }] }
    ]},
    { id: 'fx', title: 'Effects', sub: 'Effect Settings', icon: I.fx, head: 'Effect Settings', cards: [
      { rows: [{ t: 'col', id: 'fx.sky', label: 'Skybox Colour', desc: 'Tint applied to the sky' }] },
      { rows: [{ t: 'sl', id: 'fx.spec', label: 'Spectrum Power', desc: 'Strength of the colour cycle', min: 0, max: 100, step: 5, unit: '%' }] },
      { rows: [{ t: 'sl', id: 'fx.fov', label: 'Global FOV', desc: 'Field of view used in game', min: 70, max: 140, step: 1, unit: '' }] },
      { presets: true }
    ]},
    { id: 'setup', title: 'Setup', sub: 'Config & Mods', icon: I.setup, head: 'Config & Mods', cards: [
      { rows: [{ t: 'cfgsel' }] },
      { rows: [{ t: 'act', id: 'cfg.save', label: 'Save Config', desc: 'Store the current setup', text: 'Save' }] },
      { rows: [{ t: 'act', id: 'cfg.load', label: 'Load Config', desc: 'Restore a saved setup', text: 'Load' }] },
      { rows: [{ t: 'act', id: 'cfg.del', label: 'Delete Config', desc: 'Remove a saved setup', text: 'Delete', danger: true }] },
      { rows: [{ t: 'act', id: 'cfg.mod', label: 'Load Mod', desc: 'Attach a custom model pack', text: 'Load Mod' }] }
    ]}
  ];

  const DEFAULTS = {
    'aim.enable': true, 'aim.fov': 98, 'aim.delay': 35, 'aim.pred': false, 'aim.spread': true,
    'esp.enable': true, 'esp.box': true, 'esp.sil': true, 'esp.hp': true, 'esp.radar': false, 'esp.snap': false,
    'vis.outline': '#a855f7', 'vis.weapon': '#22d3ee', 'vis.fresnel': '#ec4899', 'vis.occ': '#ef4444', 'vis.cham': '#22c55e', 'vis.self': '#f59e0b',
    'misc.tracer': true, 'misc.skins': false, 'misc.bhop': true, 'misc.flash': true, 'misc.wm': true, 'misc.ribbon': '#a855f7',
    'skin.coll': true, 'skin.eject': true, 'skin.binds': false, 'skin.buddy': 100,
    'tp.enable': true, 'tp.big': false, 'tp.dist': 120, 'tp.h': 40, 'tp.spin': false,
    'fx.sky': '#a855f7', 'fx.spec': 55, 'fx.fov': 103
  };

  const BUILTIN = {
    Legit: { 'aim.fov': 98, 'aim.delay': 35, 'aim.pred': false, 'aim.spread': true, 'esp.box': true, 'esp.sil': false, 'esp.hp': true, 'tp.enable': false },
    Rage: { 'aim.fov': 24, 'aim.delay': 0, 'aim.pred': true, 'aim.spread': true, 'esp.box': true, 'esp.sil': true, 'esp.hp': false, 'tp.enable': false },
    HvH: { 'aim.fov': 180, 'aim.delay': 10, 'aim.pred': true, 'aim.spread': true, 'esp.box': true, 'esp.sil': true, 'esp.snap': true, 'esp.radar': true, 'tp.enable': false }
  };

  const K_S = 'settings', K_C = 'configs', K_A = 'active', K_U = 'unlocked', K_T = 'tab';

  const side = document.getElementById('side');
  const content = document.getElementById('content');
  const wm = document.getElementById('wm');
  const toastEl = document.getElementById('toast');
  const modal = document.getElementById('modal');
  const mInput = document.getElementById('mInput');
  const modFile = document.getElementById('modFile');

  const readJSON = (k, fb) => {
    try {
      const v = JSON.parse(LS.getItem(k));
      return v && typeof v === 'object' ? Object.assign({}, fb, v) : fb;
    } catch (e) { return fb; }
  };

  let S = readJSON(K_S, Object.assign({}, DEFAULTS));
  let CFG = readJSON(K_C, JSON.parse(JSON.stringify(BUILTIN)));
  let active = LS.getItem(K_A) || 'Legit';
  if (!CFG[active]) active = Object.keys(CFG)[0];
  let unlocked = LS.getItem(K_U) === '1';
  let tab = LS.getItem(K_T) || 'aimbot';
  if (!TABS.some(t => t.id === tab)) tab = 'aimbot';

  function save() { LS.setItem(K_S, JSON.stringify(S)); }
  function set(id, v) { S[id] = v; save(); }

  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1700);
  }

  function buildSide() {
    side.innerHTML = '';
    TABS.forEach(t => {
      const b = el('button', 'nav' + (t.id === tab ? ' on' : ''));
      b.type = 'button';
      const ic = el('div', 'ico');
      ic.innerHTML = t.icon;
      const tx = el('div', 'ntxt');
      tx.append(el('div', 'ntitle', t.title), el('div', 'nsub', t.sub));
      b.append(ic, tx);
      b.onclick = () => { tab = t.id; LS.setItem(K_T, tab); buildSide(); render(); };
      side.appendChild(b);
    });
  }

  function render() {
    const t = TABS.find(x => x.id === tab);
    content.innerHTML = '';
    content.appendChild(el('h2', 'heading', t.head));
    t.cards.forEach(c => content.appendChild(buildCard(c)));
  }

  function buildCard(c) {
    const card = el('div', 'card' + (c.accent ? ' accent' : ''));
    if (c.presets) {
      card.classList.add('pcard');
      const w = el('div');
      w.style.flex = '1';
      w.append(el('div', 'ctitle', 'Presets'), el('div', 'cdesc', 'Apply a full look in one click'));
      const row = el('div', 'presets');
      [
        ['Apocalypse', { 'fx.sky': '#ef4444', 'fx.spec': 85, 'vis.outline': '#ef4444' }],
        ['Hellfire', { 'fx.sky': '#f97316', 'fx.spec': 70, 'vis.outline': '#f97316' }],
        ['Spectrum', { 'fx.sky': '#a855f7', 'fx.spec': 100, 'vis.outline': '#a855f7' }]
      ].forEach(function (pair) {
        const n = pair[0], patch = pair[1];
        const b = el('button', 'btn', n);
        b.type = 'button';
        b.onclick = () => {
          Object.assign(S, patch);
          save();
          render();
          toast('Preset "' + n + '" applied');
        };
        row.appendChild(b);
      });
      card.append(w, row);
      return card;
    }
    const r = c.rows[0];
    const l = el('div', 'lbl');
    l.append(el('div', 'ctitle', r.label), el('div', 'cdesc', r.desc));
    card.append(l, control(r));
    return card;
  }

  function control(r) {
    if (r.t === 'tog') {
      const b = el('button', 'tog');
      b.type = 'button';
      b.setAttribute('role', 'switch');
      b.setAttribute('aria-checked', String(!!S[r.id]));
      b.onclick = () => {
        const v = !S[r.id];
        b.setAttribute('aria-checked', String(v));
        set(r.id, v);
        if (r.id === 'misc.wm') {
          wm.classList.toggle('off', !v);
          toast(v ? 'Watermark shown' : 'Watermark hidden');
        }
        if (r.id === 'aim.enable') toast(v ? 'Aimbot enabled' : 'Aimbot disabled');
        if (r.id === 'esp.enable') toast(v ? 'ESP enabled' : 'ESP disabled');
        if (r.id === 'tp.enable') toast(v ? 'Thirdperson enabled' : 'Thirdperson disabled');
      };
      return b;
    }

    if (r.t === 'sl') {
      const wrap = el('div', 'slide');
      const track = el('div', 'track');
      const fill = el('div', 'fill');
      const knob = el('div', 'knob');
      knob.tabIndex = 0;
      track.append(el('div', 'rail'), fill, knob);
      const val = el('div', 'val');
      wrap.append(track, val);
      const paint = () => {
        const p = ((S[r.id] - r.min) / (r.max - r.min)) * 100;
        fill.style.width = p + '%';
        knob.style.left = 'calc(' + p + '% - 7px)';
        val.textContent = S[r.id] + r.unit;
      };
      const fromX = x => {
        const rect = track.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
        let v = Math.round((r.min + p * (r.max - r.min)) / r.step) * r.step;
        v = Math.min(r.max, Math.max(r.min, v));
        set(r.id, v);
        paint();
      };
      let down = false;
      track.addEventListener('pointerdown', e => { down = true; track.setPointerCapture(e.pointerId); fromX(e.clientX); });
      track.addEventListener('pointermove', e => { if (down) fromX(e.clientX); });
      track.addEventListener('pointerup', () => { down = false; });
      track.addEventListener('pointercancel', () => { down = false; });
      knob.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const d = (e.key === 'ArrowRight' ? 1 : -1) * r.step;
        set(r.id, Math.min(r.max, Math.max(r.min, S[r.id] + d)));
        paint();
      });
      paint();
      return wrap;
    }

    if (r.t === 'col') {
      const b = el('button', 'sw');
      b.type = 'button';
      b.style.background = S[r.id];
      b.style.color = S[r.id];
      b.title = 'Pick colour';
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.value = S[r.id];
      inp.style.display = 'none';
      b.appendChild(inp);
      b.onclick = () => inp.click();
      inp.oninput = () => {
        b.style.background = inp.value;
        b.style.color = inp.value;
        set(r.id, inp.value);
      };
      return b;
    }

    if (r.t === 'act') {
      const b = el('button', 'btn' + (r.danger ? ' danger' : ''), r.text);
      b.type = 'button';
      if (r.id === 'skin.unlock' && unlocked) { b.textContent = 'Unlocked'; b.disabled = true; }
      b.onclick = () => action(r.id, b);
      return b;
    }

    if (r.t === 'cfgsel') {
      const sel = document.createElement('select');
      sel.className = 'sel';
      Object.keys(CFG).forEach(n => {
        const o = document.createElement('option');
        o.value = n;
        o.textContent = n;
        o.selected = n === active;
        sel.appendChild(o);
      });
      sel.onchange = () => {
        active = sel.value;
        LS.setItem(K_A, active);
        toast('Config "' + active + '" selected');
      };
      return sel;
    }
  }

  function action(id, btn) {
    if (id === 'skin.unlock') {
      unlocked = true;
      LS.setItem(K_U, '1');
      btn.textContent = 'Unlocked';
      btn.disabled = true;
      toast('All skins unlocked');
      return;
    }
    if (id === 'cfg.save') {
      mInput.value = '';
      modal.classList.add('on');
      setTimeout(() => mInput.focus(), 30);
      return;
    }
    if (id === 'cfg.load') {
      Object.assign(S, CFG[active]);
      save();
      render();
      toast('Config "' + active + '" loaded');
      return;
    }
    if (id === 'cfg.del') {
      if (['Legit', 'Rage', 'HvH'].indexOf(active) >= 0) { toast('Built-in configs cannot be deleted'); return; }
      delete CFG[active];
      LS.setItem(K_C, JSON.stringify(CFG));
      active = Object.keys(CFG)[0];
      LS.setItem(K_A, active);
      render();
      toast('Config deleted');
      return;
    }
    if (id === 'cfg.mod') modFile.click();
  }

  function doSave() {
    const n = mInput.value.trim();
    if (!n) { mInput.focus(); return; }
    CFG[n] = Object.assign({}, S);
    active = n;
    LS.setItem(K_C, JSON.stringify(CFG));
    LS.setItem(K_A, active);
    modal.classList.remove('on');
    render();
    toast('Config "' + n + '" saved');
  }

  document.getElementById('mSave').onclick = doSave;
  document.getElementById('mCancel').onclick = () => modal.classList.remove('on');
  mInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSave();
    if (e.key === 'Escape') modal.classList.remove('on');
  });

  modFile.addEventListener('change', () => {
    const f = modFile.files && modFile.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        const patch = d.settings && typeof d.settings === 'object' ? d.settings : d;
        let n = 0;
        Object.keys(patch).forEach(k => {
          if (k in DEFAULTS) { S[k] = patch[k]; n++; }
        });
        if (!n) throw new Error('no keys');
        save();
        render();
        wm.classList.toggle('off', !S['misc.wm']);
        toast('Mod "' + (d.name || f.name) + '" loaded (' + n + ' values)');
      } catch (e) { toast('Invalid mod file'); }
      modFile.value = '';
    };
    rd.readAsText(f);
  });

  if (hasBridge) {
    document.getElementById('minBtn').onclick = () => window.api.min();
    document.getElementById('closeBtn').onclick = () => window.api.close();
  } else {
    document.getElementById('minBtn').style.display = 'none';
    document.getElementById('closeBtn').style.display = 'none';
  }

  if (window.api && window.api.onStatus) {
    window.api.onStatus(s => {
      if (!statEl) return;
      statEl.textContent = s.text;
      statEl.classList.toggle('on', s.attached);
    });
  }

  try {
    Object.assign(S, CFG[active] || {});
    save();
    buildSide();
    render();
    wm.classList.toggle('off', !S['misc.wm']);
  } catch (e) {
    fatal(e && e.stack ? e.stack : e);
  }
})();
