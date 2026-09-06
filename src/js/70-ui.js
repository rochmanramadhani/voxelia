'use strict';
/* Lapisan antarmuka: pengaturan, hotbar, inventaris, pemilih karakter, toast. */

const LS_KEY = 'voxelia.v1';

const DEFAULTS = {
  renderDist: 6, resScale: 100, fov: 70, exposure: 105, fogAmt: 100,
  clouds: true, ao: true, wave: true, vignette: true,
  sens: 65, invertY: false, autoStep: true,
  lookMode: 'auto', lookSmooth: 22, bob: false,
  dayLength: 8, timeFrozen: false, timeOfDay: 0.30,
  volume: 55, sfx: true,
  charKey: 'rana', hotbar: DEFAULT_HOTBAR.slice(), seed: '', debug: false
};
let S = Object.assign({}, DEFAULTS);

const SCHEMA = [
  {
    group: 'Tampilan', items: [
      { k: 'renderDist', label: 'Jarak pandang', desc: 'Radius chunk yang dimuat di sekitar kamu', type: 'range', min: 3, max: 12, step: 1, fmt: v => v + ' chunk' },
      { k: 'resScale', label: 'Skala resolusi', desc: 'Turunkan bila frame rate berat', type: 'range', min: 50, max: 100, step: 5, fmt: v => v + '%' },
      { k: 'fov', label: 'Bidang pandang', desc: 'Nilai kecil terasa lebih tenang, nilai besar lebih luas', type: 'range', min: 55, max: 110, step: 1, fmt: v => v + '°' },
      { k: 'exposure', label: 'Kecerahan', type: 'range', min: 60, max: 170, step: 5, fmt: v => (v / 100).toFixed(2) + '×' },
      { k: 'fogAmt', label: 'Kabut jarak', desc: '0% = pandangan bersih sampai batas chunk', type: 'range', min: 0, max: 100, step: 5, fmt: v => v + '%' }
    ]
  },
  {
    group: 'Grafis', items: [
      { k: 'clouds', label: 'Awan', desc: 'Lapisan awan kotak di ketinggian 112', type: 'toggle' },
      { k: 'ao', label: 'Ambient occlusion', desc: 'Bayangan lembut di sudut blok', type: 'toggle' }
    ]
  },
  {
    group: 'Kontrol', items: [
      { k: 'lookMode', label: 'Cara menoleh', desc: 'Kalau kursor terasa liar, pilih Seret klik kiri', type: 'select',
        options: [['auto', 'Otomatis'], ['lock', 'Kunci kursor'], ['drag', 'Seret klik kiri']] },
      { k: 'sens', label: 'Sensitivitas menoleh', type: 'range', min: 15, max: 250, step: 5, fmt: v => (v / 100).toFixed(2) },
      { k: 'lookSmooth', label: 'Kehalusan kamera', desc: 'Meredam gerakan mouse yang menyentak', type: 'range', min: 0, max: 100, step: 5, fmt: v => v ? v + '%' : 'mati' },
      { k: 'invertY', label: 'Balik sumbu Y', type: 'toggle' },
      { k: 'autoStep', label: 'Naik blok otomatis', desc: 'Melangkahi tepian setinggi satu blok tanpa lompat', type: 'toggle' }
    ]
  },
  {
    group: 'Kenyamanan', items: [
      { k: 'bob', label: 'Goyangan langkah', desc: 'Kamera naik-turun saat berjalan. Matikan bila pusing.', type: 'toggle' },
      { k: 'wave', label: 'Gerakan air & daun', desc: 'Riak air dan tumbuhan yang bergoyang', type: 'toggle' },
      { k: 'vignette', label: 'Vignette', desc: 'Penggelapan lembut di tepi layar', type: 'toggle' }
    ]
  },
  {
    group: 'Dunia', items: [
      { k: 'dayLength', label: 'Panjang hari', type: 'range', min: 2, max: 20, step: 1, fmt: v => v + ' menit' },
      { k: 'timeFrozen', label: 'Bekukan waktu', desc: 'Matahari berhenti di posisi sekarang', type: 'toggle' },
      { k: 'timeOfDay', label: 'Waktu', desc: '0.00 tengah malam · 0.50 tengah hari', type: 'range', min: 0, max: 100, step: 1, scale: 100, fmt: v => clockLabel(v / 100) }
    ]
  },
  {
    group: 'Suara', items: [
      { k: 'sfx', label: 'Efek suara', desc: 'Nada sintetis, tanpa berkas audio', type: 'toggle' },
      { k: 'volume', label: 'Volume', type: 'range', min: 0, max: 100, step: 5, fmt: v => v + '%' }
    ]
  }
];

function clockLabel(t) {
  const mins = Math.round(((t % 1) + 1) % 1 * 1440);
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
  } catch (e) { /* penyimpanan diblokir: pakai bawaan */ }
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
    panel.innerHTML = `<div class="panel-hd"><span class="eyebrow">${g.group}</span></div><div class="rows"></div>`;
    const rows = panel.querySelector('.rows');
    for (const it of g.items) {
      const row = document.createElement('div');
      row.className = 'row';
      const left = document.createElement('div');
      left.innerHTML = `<div class="lbl">${it.label}</div>` + (it.desc ? `<div class="desc">${it.desc}</div>` : '');
      const ctl = document.createElement('div');
      ctl.className = 'ctl';
      if (it.type === 'select') {
        const sel = document.createElement('select');
        sel.setAttribute('aria-label', it.label);
        for (const [val, txt] of it.options) {
          const o = document.createElement('option');
          o.value = val; o.textContent = txt;
          if (S[it.k] === val) o.selected = true;
          sel.append(o);
        }
        sel.addEventListener('change', () => { S[it.k] = sel.value; onSettingChange(it.k); persist(); });
        ctl.append(sel);
      } else if (it.type === 'range') {
        const inp = document.createElement('input');
        inp.type = 'range'; inp.min = it.min; inp.max = it.max; inp.step = it.step;
        inp.value = it.scale ? Math.round(S[it.k] * it.scale) : S[it.k];
        inp.setAttribute('aria-label', it.label);
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
        btn.setAttribute('aria-label', it.label);
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

/* ---------- panduan tombol ---------- */
const KEYMAP = [
  ['W A S D', 'Berjalan'], ['Panah', 'Menoleh tanpa mouse'],
  ['Spasi', 'Lompat · naik saat terbang'], ['Shift', 'Berlari'],
  ['Ctrl', 'Turun saat terbang'], ['Spasi ×2 / F', 'Mode terbang'],
  ['Klik kiri', 'Gali blok'], ['Klik kanan', 'Taruh blok'], ['Klik tengah', 'Ambil blok yang dilihat'],
  ['1 – 9', 'Pilih slot hotbar'], ['Roda mouse', 'Geser slot'], ['E', 'Inventaris'],
  ['L', 'Lampu kepala'], ['F5', 'Sudut pandang'], ['F3', 'Panel diagnostik'],
  ['F2', 'Simpan dunia'], ['R', 'Kembali ke permukaan'], ['Esc', 'Jeda'],
  ['Seret kiri', 'Menoleh, bila kursor tak bisa dikunci']
];
function buildKeyList() {
  const el = $('#keyList');
  el.innerHTML = KEYMAP.map(([k, v]) =>
    `<div class="keyrow"><kbd>${k}</kbd><span class="what">${v}</span></div>`).join('');
}

/* ---------- hotbar & inventaris ---------- */
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
    b.innerHTML = `<span class="n">${i + 1}</span>`;
    const id = S.hotbar[i];
    if (id && ICONS[id]) {
      const img = document.createElement('img');
      img.src = ICONS[id]; img.alt = BLOCKS[id].name;
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
  const B = BLOCKS[id];
  el.innerHTML = `<span class="id">#${String(id).padStart(3, '0')}</span>${B.name}`;
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
    sec.innerHTML = `<h3>${CAT_LABEL[cat] || cat}</h3><div class="grid"></div>`;
    const grid = sec.querySelector('.grid');
    for (const id of ids) {
      const B = BLOCKS[id];
      const cell = document.createElement('button');
      cell.className = 'cell';
      cell.title = `${B.name} · kekerasan ${B.hardness < 0 ? '∞' : B.hardness.toFixed(1)}${B.note ? ' · ' + B.note : ''}`;
      cell.setAttribute('aria-selected', String(S.hotbar.includes(id)));
      cell.innerHTML = `<img src="${ICONS[id] || ''}" alt=""><span class="cn">${B.name}</span>`;
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

/* ---------- pemilih karakter ---------- */
let charIndex = 0;
let onCharChange = () => {};
function buildCharList() {
  const el = $('#charList');
  el.innerHTML = '';
  CHARS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'charcard';
    b.setAttribute('aria-pressed', String(i === charIndex));
    b.innerHTML = `<span class="sw" style="background:${c.sw}"></span>
      <span><span class="nm">${c.name}</span><br><span class="rl">${c.role}</span></span>`;
    b.addEventListener('click', () => selectChar(i));
    el.append(b);
  });
}
function selectChar(i) {
  charIndex = (i + CHARS.length) % CHARS.length;
  const c = CHARS[charIndex];
  S.charKey = c.key;
  $$('#charList .charcard').forEach((el, k) => el.setAttribute('aria-pressed', String(k === charIndex)));
  $('#charRole').textContent = c.role;
  $('#charBio').textContent = c.bio;
  $('#charIdx').textContent = `PERSONEL ${String(charIndex + 1).padStart(2, '0')} / ${String(CHARS.length).padStart(2, '0')}`;
  $('#wChar').textContent = `${c.name} · ${c.role}`;
  onCharChange(charIndex);
  persist();
}

/* ---------- toast & bioma ---------- */
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
  el.querySelector('.t').textContent = bio.id;
  el.querySelector('.s').textContent = bio.sub;
  el.classList.add('show');
  clearTimeout(biomeTimer);
  biomeTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ---------- navigasi layar ---------- */
const SCREENS = ['boot', 'menu', 'chars', 'opts', 'guide', 'inv', 'pause'];
let screenNow = 'boot';
let screenBack = 'menu';
function showScreen(id) {
  SCREENS.forEach(s => $('#' + s).classList.toggle('on', s === id));
  $('#hud').classList.toggle('on', id === null || id === 'hud');
  screenNow = id;
}
function showHUD() {
  SCREENS.forEach(s => $('#' + s).classList.remove('on'));
  $('#hud').classList.add('on');
  screenNow = 'hud';
}
