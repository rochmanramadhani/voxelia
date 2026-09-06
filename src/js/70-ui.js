'use strict';
/* Interface layer: settings, hotbar, inventory, character picker, toasts.
   Every visible string goes through t(); nothing is hard-coded here. */

const LS_KEY = 'voxelia.v1';

const DEFAULTS = {
  lang: 'auto',
  renderDist: 6, resScale: 100, fov: 70, exposure: 105, fogAmt: 100,
  clouds: true, ao: true, wave: true, vignette: true,
  sens: 65, invertY: false, autoStep: true,
  lookMode: 'auto', lookSmooth: 22, bob: false,
  dayLength: 8, timeFrozen: false, timeOfDay: 0.30,
  volume: 55, sfx: true,
  charKey: 'rana', hotbar: DEFAULT_HOTBAR.slice(), seed: '', debug: false
};
let S = Object.assign({}, DEFAULTS);

/* Labels come from `set.<k>`, descriptions from `set.<k>.desc` when present. */
const SCHEMA = [
  {
    group: 'display', items: [
      { k: 'lang', type: 'select', options: ['auto', 'id', 'en'] },
      { k: 'renderDist', type: 'range', min: 3, max: 12, step: 1, fmt: v => t('unit.chunk', { n: v }) },
      { k: 'resScale', type: 'range', min: 50, max: 100, step: 5, fmt: v => v + '%' },
      { k: 'fov', type: 'range', min: 55, max: 110, step: 1, fmt: v => v + '°' },
      { k: 'exposure', type: 'range', min: 60, max: 170, step: 5, fmt: v => (v / 100).toFixed(2) + '×' },
      { k: 'fogAmt', type: 'range', min: 0, max: 100, step: 5, fmt: v => v + '%' }
    ]
  },
  {
    group: 'graphics', items: [
      { k: 'clouds', type: 'toggle' },
      { k: 'ao', type: 'toggle' }
    ]
  },
  {
    group: 'controls', items: [
      { k: 'lookMode', type: 'select', options: ['auto', 'lock', 'drag'] },
      { k: 'sens', type: 'range', min: 15, max: 250, step: 5, fmt: v => (v / 100).toFixed(2) },
      { k: 'lookSmooth', type: 'range', min: 0, max: 100, step: 5, fmt: v => v ? v + '%' : t('common.off') },
      { k: 'invertY', type: 'toggle' },
      { k: 'autoStep', type: 'toggle' }
    ]
  },
  {
    group: 'comfort', items: [
      { k: 'bob', type: 'toggle' },
      { k: 'wave', type: 'toggle' },
      { k: 'vignette', type: 'toggle' }
    ]
  },
  {
    group: 'world', items: [
      { k: 'dayLength', type: 'range', min: 2, max: 20, step: 1, fmt: v => t('unit.minutes', { n: v }) },
      { k: 'timeFrozen', type: 'toggle' },
      { k: 'timeOfDay', type: 'range', min: 0, max: 100, step: 1, scale: 100, fmt: v => clockLabel(v / 100) }
    ]
  },
  {
    group: 'sound', items: [
      { k: 'sfx', type: 'toggle' },
      { k: 'volume', type: 'range', min: 0, max: 100, step: 5, fmt: v => v + '%' }
    ]
  }
];

function clockLabel(v) {
  const mins = Math.round(((v + 0.5) % 1) * 1440);
  const h = Math.floor(mins / 60), m = mins % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && o.settings) S = Object.assign({}, DEFAULTS, o.settings);
      if (!Array.isArray(S.hotbar) || S.hotbar.length !== 9) S.hotbar = DEFAULT_HOTBAR.slice();
      return o || {};
    }
  } catch (e) { /* storage blocked: fall back to defaults */ }
  return {};
}
function persist(extra) {
  try {
    const cur = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    localStorage.setItem(LS_KEY, JSON.stringify(Object.assign(cur, { settings: S }, extra || {})));
    return true;
  } catch (e) { return false; }
}

let onSettingChange = () => {};

function buildSettingsUI() {
  const grid = $('#optGrid');
  grid.innerHTML = '';
  for (const g of SCHEMA) {
    const panel = document.createElement('div');
    panel.className = 'panel optgrp';
    panel.innerHTML = '<div class="panel-hd"><span class="eyebrow"></span></div><div class="rows"></div>';
    panel.querySelector('.eyebrow').textContent = t('group.' + g.group);
    const rows = panel.querySelector('.rows');
    for (const it of g.items) {
      const label = t('set.' + it.k);
      const descKey = 'set.' + it.k + '.desc';
      const hasDesc = I18N.en[descKey] !== undefined;
      const row = document.createElement('div');
      row.className = 'row';
      const left = document.createElement('div');
      const lbl = document.createElement('div');
      lbl.className = 'lbl'; lbl.textContent = label;
      left.append(lbl);
      if (hasDesc) {
        const d = document.createElement('div');
        d.className = 'desc'; d.textContent = t(descKey);
        left.append(d);
      }
      const ctl = document.createElement('div');
      ctl.className = 'ctl';
      if (it.type === 'select') {
        const sel = document.createElement('select');
        sel.setAttribute('aria-label', label);
        for (const val of it.options) {
          const o = document.createElement('option');
          o.value = val;
          o.textContent = t('opt.' + it.k + '.' + val);
          if (S[it.k] === val) o.selected = true;
          sel.append(o);
        }
        sel.addEventListener('change', () => { S[it.k] = sel.value; onSettingChange(it.k); persist(); });
        ctl.append(sel);
      } else if (it.type === 'range') {
        const inp = document.createElement('input');
        inp.type = 'range'; inp.min = it.min; inp.max = it.max; inp.step = it.step;
        inp.value = it.scale ? Math.round(S[it.k] * it.scale) : S[it.k];
        inp.setAttribute('aria-label', label);
        const out = document.createElement('span');
        out.className = 'out';
        const sync = () => { out.textContent = it.fmt ? it.fmt(+inp.value) : inp.value; };
        sync();
        inp.addEventListener('input', () => {
          S[it.k] = it.scale ? (+inp.value) / it.scale : +inp.value;
          sync(); onSettingChange(it.k); persist();
        });
        ctl.append(inp, out);
      } else {
        const btn = document.createElement('button');
        btn.className = 'sw-toggle';
        btn.setAttribute('aria-pressed', String(!!S[it.k]));
        btn.setAttribute('aria-label', label);
        btn.addEventListener('click', () => {
          S[it.k] = !S[it.k];
          btn.setAttribute('aria-pressed', String(!!S[it.k]));
          onSettingChange(it.k); persist();
        });
        ctl.append(btn);
      }
      row.append(left, ctl);
      rows.append(row);
    }
    grid.append(panel);
  }
}
function refreshSettingsUI() { buildSettingsUI(); }

/* ---------- controls guide ---------- */
const KEYMAP = [
  ['W A S D', 'key.move'], ['kb.arrows', 'key.look'],
  ['kb.space', 'key.jump'], ['Shift', 'key.sprint'],
  ['Ctrl', 'key.descend'], ['kb.space2', 'key.fly'],
  ['kb.lclick', 'key.dig'], ['kb.rclick', 'key.place'], ['kb.mclick', 'key.pick'],
  ['1 – 9', 'key.slot'], ['kb.wheel', 'key.wheel'], ['E', 'key.inv'],
  ['L', 'key.torch'], ['F5', 'key.view'], ['F3', 'key.debug'],
  ['F2', 'key.save'], ['R', 'key.surface'], ['Esc', 'key.pause']
];
function buildKeyList() {
  const el = $('#keyList');
  el.innerHTML = '';
  for (const [kb, desc] of KEYMAP) {
    const row = document.createElement('div');
    row.className = 'keyrow';
    const k = document.createElement('kbd');
    k.textContent = kb.startsWith('kb.') ? t(kb) : kb;
    const w = document.createElement('span');
    w.className = 'what'; w.textContent = t(desc);
    row.append(k, w);
    el.append(row);
  }
}

/* ---------- hotbar & inventory ---------- */
let ICONS = {};
let hotIndex = 0;
let onHotbarChange = () => {};

function buildHotbar() {
  const bar = $('#hotbar');
  bar.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const b = document.createElement('button');
    b.className = 'slot';
    b.setAttribute('aria-selected', String(i === hotIndex));
    const n = document.createElement('span');
    n.className = 'n'; n.textContent = String(i + 1);
    b.append(n);
    const id = S.hotbar[i];
    if (id && ICONS[id]) {
      const img = document.createElement('img');
      img.src = ICONS[id]; img.alt = blockName(id);
      b.append(img);
    }
    b.addEventListener('click', e => { e.preventDefault(); setHot(i); });
    bar.append(b);
  }
}
function setHot(i) {
  hotIndex = ((i % 9) + 9) % 9;
  $$('#hotbar .slot').forEach((el, k) => el.setAttribute('aria-selected', String(k === hotIndex)));
  showItemName();
  onHotbarChange();
}
function currentBlock() { return S.hotbar[hotIndex] || 0; }
function setHotSlot(i, id) {
  S.hotbar[i] = id;
  buildHotbar();
  persist();
  onHotbarChange();
}
let nameTimer = 0;
function showItemName() {
  const el = $('#itemname');
  const id = currentBlock();
  if (!id || !BLOCKS[id]) { el.classList.remove('show'); return; }
  el.innerHTML = '';
  const tag = document.createElement('span');
  tag.className = 'id'; tag.textContent = '#' + String(id).padStart(3, '0');
  el.append(tag, document.createTextNode(blockName(id)));
  el.classList.add('show');
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

function buildInventory() {
  const body = $('#invBody');
  body.innerHTML = '';
  for (const cat of CATEGORIES) {
    const ids = [];
    for (let id = 1; id < BLOCKS.length; id++) if (BLOCKS[id] && BLOCKS[id].cat === cat) ids.push(id);
    if (!ids.length) continue;
    const sec = document.createElement('section');
    sec.className = 'cat';
    const h = document.createElement('h3');
    h.textContent = t('cat.' + cat);
    const grid = document.createElement('div');
    grid.className = 'grid';
    sec.append(h, grid);
    for (const id of ids) {
      const B = BLOCKS[id];
      const nm = blockName(id);
      const cell = document.createElement('button');
      cell.className = 'cell';
      cell.title = nm + ' · ' + t('block.hardness') + ' ' +
        (B.hardness < 0 ? '∞' : B.hardness.toFixed(1)) +
        (B.note ? ' · ' + t('block.' + B.key + '.note') : '');
      cell.setAttribute('aria-selected', String(S.hotbar.includes(id)));
      const img = document.createElement('img');
      img.src = ICONS[id] || ''; img.alt = '';
      const cn = document.createElement('span');
      cn.className = 'cn'; cn.textContent = nm;
      cell.append(img, cn);
      cell.addEventListener('click', () => {
        setHotSlot(hotIndex, id);
        $$('#invBody .cell').forEach(c => c.setAttribute('aria-selected', 'false'));
        cell.setAttribute('aria-selected', 'true');
        showItemName();
      });
      grid.append(cell);
    }
    body.append(sec);
  }
}

/* ---------- character picker ---------- */
let charIndex = 0;
let onCharChange = () => {};
function buildCharList() {
  const el = $('#charList');
  el.innerHTML = '';
  CHARS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'charcard';
    b.setAttribute('aria-pressed', String(i === charIndex));
    const sw = document.createElement('span');
    sw.className = 'sw'; sw.style.background = c.sw;
    const wrap = document.createElement('span');
    const nm = document.createElement('span');
    nm.className = 'nm'; nm.textContent = c.name;
    const rl = document.createElement('span');
    rl.className = 'rl'; rl.textContent = charRole(c);
    wrap.append(nm, document.createElement('br'), rl);
    b.append(sw, wrap);
    b.addEventListener('click', () => selectChar(i));
    el.append(b);
  });
}
/** Refresh only the text around the current explorer (used on language change). */
function paintCharInfo() {
  const c = CHARS[charIndex];
  $$('#charList .charcard').forEach((el, k) => el.setAttribute('aria-pressed', String(k === charIndex)));
  $('#charRole').textContent = charRole(c);
  $('#charBio').textContent = charBio(c);
  $('#charIdx').textContent = t('chars.index', {
    i: String(charIndex + 1).padStart(2, '0'),
    n: String(CHARS.length).padStart(2, '0')
  });
  $('#wChar').textContent = c.name + ' · ' + charRole(c);
}
function selectChar(i) {
  charIndex = (i + CHARS.length) % CHARS.length;
  S.charKey = CHARS[charIndex].key;
  paintCharInfo();
  onCharChange(charIndex);
  persist();
}

/* ---------- toasts & biome banner ---------- */
function toast(msg, warn) {
  const box = $('#toast');
  const el = document.createElement('div');
  el.className = 'toast' + (warn ? ' warn' : '');
  el.textContent = msg;
  box.append(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; }, 2600);
  setTimeout(() => el.remove(), 3100);
  while (box.children.length > 4) box.firstChild.remove();
}
let biomeTimer = 0;
function announceBiome(bio) {
  const el = $('#biome');
  el.querySelector('.t').textContent = biomeName(bio);
  el.querySelector('.s').textContent = biomeSub(bio);
  el.classList.add('show');
  clearTimeout(biomeTimer);
  biomeTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ---------- screen navigation ---------- */
const SCREENS = ['boot', 'menu', 'chars', 'opts', 'guide', 'inv', 'pause'];
let screenNow = 'boot';
let screenBack = 'menu';
function showScreen(id) {
  SCREENS.forEach(s => $('#' + s).classList.toggle('on', s === id));
  $('#hud').classList.toggle('on', id === 'hud');
  screenNow = id;
}
function showHUD() {
  SCREENS.forEach(s => $('#' + s).classList.remove('on'));
  $('#hud').classList.add('on');
  screenNow = 'hud';
}

/* ---------- language ---------- */
let onLocaleChange = () => {};

function paintLangSwitch() {
  $$('#langSw button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === LOCALE)));
}
function initLangSwitch() {
  $$('#langSw button').forEach(b => {
    b.addEventListener('click', () => {
      if (b.dataset.lang === LOCALE && S.lang !== 'auto') return;
      S.lang = b.dataset.lang;
      applyLocale();
      persist();
    });
  });
}
/** Re-resolve the locale and repaint every string in the interface. */
function applyLocale() {
  setLocale(S.lang);
  applyI18n();
  paintLangSwitch();
  buildSettingsUI();
  buildKeyList();
  buildHotbar();
  buildInventory();
  buildCharList();
  paintCharInfo();
  showItemName();
  onLocaleChange();
}
