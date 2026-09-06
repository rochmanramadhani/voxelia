'use strict';
/* Perakitan: renderer, adegan, siklus siang-malam, masukan, dan gelung utama. */

let renderer, scene, camera, world, chunks, player;
let matSolid, matLiquid, matItem, atlas;
let sky, clouds, selBox, particles, pData;
let handScene, handCam, handMesh, handArm, handLight;
let charScene, charCam, charModel, charPivot, charSpin = { x: -0.10, y: 0.52, z: 4.6, drag: false, lx: 0, ly: 0 };
let worldChar = null;                 // model di dunia (orang ketiga)
let saved = {};
let state = 'boot';
let timeOfDay = 0.30;
let frame = 0, fps = 0, fpsAcc = 0, fpsT = 0;
let lastBiome = null, lastStepD = 0;
let handSwing = 0, bob = 0;
let menuAngle = 0;
const SUN_DIR = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

const input = { f: 0, b: 0, l: 0, r: 0, up: 0, down: 0, sprint: 0, torch: 0, lookL: 0, lookR: 0, lookU: 0, lookD: 0 };
let mouseDown = 0, digTimer = 0, placeTimer = 0;
let isTouch = false;
/* Pointer lock bisa diblokir (mis. di dalam iframe). Kalau begitu, pakai mode seret. */
let lockMode = 'lock';
let dragOn = false, dragBtn = 0, dragDist = 0, dragX = 0, dragY = 0;

/* ═══════════ boot ═══════════ */
const bootSteps = [];
function bootLog(txt, ok) {
  const el = $('#bootlog');
  el.innerHTML += `> ${txt}${ok ? ' <b>' + ok + '</b>' : ''}<br>`;
  el.scrollTop = el.scrollHeight;
}
function bootBar(p) { $('#bar i').style.width = (p * 100).toFixed(0) + '%'; }
/* Menunggu frame berikutnya, tapi tetap jalan bila tab di latar belakang
   (requestAnimationFrame berhenti di sana dan pemuatan akan menggantung selamanya). */
const nextFrame = () => new Promise(r => {
  let done = false;
  const fin = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(fin);
  setTimeout(fin, 60);
});

async function boot() {
  saved = loadSettings();
  isTouch = window.matchMedia('(pointer: coarse)').matches;

  const canvas = $('#gl');
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false
  });
  renderer.setClearColor(0x090c11, 1);
  renderer.autoClear = true;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;   // shader kustom sudah keluar di ruang sRGB

  if (!renderer.capabilities.isWebGL2) {
    bootLog('WebGL2 tidak tersedia di peramban ini.', 'GAGAL');
    bootLog('Voxelia butuh WebGL2 untuk tekstur array. Coba Chrome, Edge, Firefox, atau Safari 15+.');
    return;
  }
  bootLog('memeriksa konteks grafis', 'WEBGL2');
  bootBar(0.08);
  await nextFrame();

  computeTexAverages();
  atlas = buildBlockTextures(renderer);
  U.uAtlas.value = atlas;
  bootLog(`menggambar ${TEX.length} tekstur prosedural 16×16`, 'OK');
  bootBar(0.22);
  await nextFrame();

  matSolid = makeTerrainMaterial();
  matLiquid = makeLiquidMaterial();
  matItem = makeItemMaterial();

  ICONS = bakeBlockIcons(renderer, matItem, 96);
  bootLog(`merender ${BLOCK_COUNT} ikon blok 3D`, 'OK');
  bootBar(0.36);
  await nextFrame();

  buildScene();
  bootLog('menyusun langit, awan, dan partikel', 'OK');
  bootBar(0.46);
  await nextFrame();

  buildCharScene();
  bootLog(`membangun ${CHARS.length} model penjelajah`, 'OK');
  bootBar(0.55);
  await nextFrame();

  // seed
  const savedWorld = saved.world;
  let seedText = (savedWorld && savedWorld.seed) || S.seed || randomSeedText();
  S.seed = seedText;
  world = new World(seedToInt(seedText));
  if (savedWorld && savedWorld.edits) world.importEdits(savedWorld.edits);
  chunks = new ChunkManager(world, scene, matSolid, matLiquid);
  chunks.setDistance(S.renderDist);
  player = new Player(world);

  bootLog(`menyiapkan dunia "${seedText}" (seed ${world.seed})`, 'OK');
  bootBar(0.62);
  await nextFrame();

  // dunia awal
  const spawn = findSpawn(world);
  player.pos.set(spawn.x + 0.5, spawn.y, spawn.z + 0.5);
  if (savedWorld && savedWorld.pos) {
    player.pos.fromArray(savedWorld.pos);
    player.setLook(savedWorld.yaw || 0, savedWorld.pitch || 0);
    player.flying = !!savedWorld.flying;
    timeOfDay = savedWorld.time === undefined ? 0.30 : savedWorld.time;
  } else {
    timeOfDay = S.timeOfDay;
  }
  S.timeOfDay = timeOfDay;

  for (let i = 0; i < 60; i++) {
    const pend = chunks.update(player.pos.x, player.pos.z, 26);
    bootBar(0.62 + 0.36 * (1 - Math.min(1, pend / 90)));
    if (!pend) break;
    if (i % 6 === 0) await nextFrame();
  }
  bootLog(`memuat ${chunks.stats.chunks} chunk di sekitar titik muncul`, 'SIAP');
  bootBar(1);
  await nextFrame();

  buildUI();
  applyAllSettings();
  enterMenu();
  requestAnimationFrame(loop);
}

function randomSeedText() {
  const a = ['batu', 'kabut', 'lumut', 'pasir', 'obor', 'palung', 'akar', 'kerikil', 'senja', 'arus'];
  const b = ['utara', 'dalam', 'sunyi', 'panjang', 'kering', 'biru', 'tua', 'jauh'];
  return a[(Math.random() * a.length) | 0] + '-' + b[(Math.random() * b.length) | 0] + '-' +
    String((Math.random() * 900 + 100) | 0);
}

function findSpawn(w) {
  for (let r = 0; r < 260; r += 4) {
    for (let a = 0; a < 12; a++) {
      const ang = a / 12 * Math.PI * 2;
      const x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r);
      const h = w.heightAt(x, z);
      if (h > SEA + 2 && h < 78) return { x, y: h + 1.2, z, h };
    }
  }
  return { x: 0, y: w.heightAt(0, 0) + 1.2, z: 0, h: w.heightAt(0, 0) };
}

/* ═══════════ adegan ═══════════ */
function buildScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(S.fov, innerWidth / innerHeight, 0.06, 900);
  camera.rotation.order = 'YXZ';   // yaw lalu pitch — urutan XYZ bawaan bikin kamera terguling

  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const dl = new THREE.DirectionalLight(0xffffff, 1.5);
  dl.position.set(0.5, 1, 0.4);
  scene.add(dl);
  scene.userData.dl = dl;

  // langit
  const skyGeo = new THREE.SphereGeometry(1, 24, 16);
  sky = new THREE.Mesh(skyGeo, new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x3e7fd4) }, uMid: { value: new THREE.Color(0x74aee8) },
      uHorizon: { value: new THREE.Color(0xbcd8f0) }, uGround: { value: new THREE.Color(0x2a3038) },
      uSunDir: { value: SUN_DIR }, uSunCol: { value: new THREE.Color(0xfff0d0) },
      uNight: { value: 0 }, uTime: U.uTime
    }
  }));
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  scene.add(sky);

  // awan
  const cg = new THREE.PlaneGeometry(2600, 2600, 1, 1);
  cg.rotateX(-Math.PI / 2);
  clouds = new THREE.Mesh(cg, new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    uniforms: {
      uTime: U.uTime, uOpacity: { value: 0.85 }, uPlaneY: { value: 112 },
      uColor: { value: new THREE.Color(0xffffff) }, uShade: { value: new THREE.Color(0xc3cfdd) },
      uFogCol: U.uFogCol, uCamP: U.uCam, uFogNear: U.uFogNear, uFogFar: U.uFogFar
    }
  }));
  clouds.position.y = 112;
  clouds.renderOrder = 3;
  clouds.frustumCulled = false;
  scene.add(clouds);

  // kotak seleksi
  selBox = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
    new THREE.LineBasicMaterial({ color: 0x0a0c10, transparent: true, opacity: 0.85, depthTest: true })
  );
  selBox.visible = false;
  selBox.renderOrder = 6;
  scene.add(selBox);

  // partikel pecahan blok
  const N = 420;
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  particles = new THREE.Points(pg, new THREE.PointsMaterial({
    size: 0.11, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false
  }));
  particles.frustumCulled = false;
  particles.renderOrder = 7;
  scene.add(particles);
  pData = { n: N, life: new Float32Array(N), vel: new Float32Array(N * 3), head: 0 };
  for (let i = 0; i < N; i++) pg.attributes.position.array[i * 3 + 1] = -9999;

  // benda di tangan
  handScene = new THREE.Scene();
  handCam = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.01, 12);
  handScene.add(new THREE.AmbientLight(0xffffff, 1.4));
  handLight = new THREE.DirectionalLight(0xffffff, 1.6);
  handLight.position.set(0.5, 1, 0.8);
  handScene.add(handLight);
}

function buildCharScene() {
  charScene = new THREE.Scene();
  charCam = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  charScene.add(new THREE.AmbientLight(0xbcc8dc, 1.25));
  const key = new THREE.DirectionalLight(0xfff0d4, 2.0); key.position.set(2, 3, 2.4);
  const rim = new THREE.DirectionalLight(0x6fa8ff, 0.9); rim.position.set(-2.5, 1.4, -2);
  charScene.add(key, rim);
  charPivot = new THREE.Group();
  charScene.add(charPivot);

  // panggung: cakram blok
  const stage = new THREE.Group();
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    if (dx * dx + dz * dz > 10) continue;
    const id = (dx * dx + dz * dz > 6) ? 4 : (((dx + dz) & 1) ? 5 : 3);
    const m = new THREE.Mesh(blockCubeGeom(id), matItem);
    m.position.set(dx * 0.5 - 0.25, -0.5, dz * 0.5 - 0.25);
    m.scale.setScalar(0.5);
    m.frustumCulled = false;
    stage.add(m);
  }
  stage.position.y = -0.02;
  charPivot.add(stage);
}

/** Lepas geometri & tekstur milik sebuah subtree (model karakter dibuat ulang tiap ganti). */
function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      if (m === matItem || m === matSolid || m === matLiquid) continue;
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
}

function setCharModel(i) {
  if (charModel) { charPivot.remove(charModel.root); disposeTree(charModel.root); charModel = null; }
  charModel = buildCharacter(CHARS[i]);
  charModel.root.position.y = 0;
  charPivot.add(charModel.root);
  // model dunia (orang ketiga)
  if (worldChar) { scene.remove(worldChar.root); disposeTree(worldChar.root); }
  worldChar = buildCharacter(CHARS[i]);
  worldChar.root.visible = false;
  scene.add(worldChar.root);
  buildHandArm(CHARS[i]);
}

function buildHandArm(def) {
  if (handArm) { handScene.remove(handArm); disposeTree(handArm); handArm = null; }
  const tex = skinTex(def.shirt, { seed: 22, blotch: 0.07 });
  const skin = skinTex(def.skin, { seed: 11 });
  const g = new THREE.Group();
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22),
    new THREE.MeshLambertMaterial({ map: tex }));
  sleeve.position.set(0, 0.10, 0);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.17, 0.23),
    new THREE.MeshLambertMaterial({ map: skin }));
  hand.position.set(0, -0.28, 0);
  g.add(sleeve, hand);
  g.position.set(0.42, -0.46, -0.62);
  g.rotation.set(-0.35, 0.2, -0.16);
  handScene.add(g);
  handArm = g;
}

function setHandItem() {
  if (handMesh) { handScene.remove(handMesh); disposeTree(handMesh); handMesh = null; }
  const id = currentBlock();
  if (!id || !BLOCKS[id]) { if (handArm) handArm.visible = true; return; }
  const m = new THREE.Mesh(blockCubeGeom(id), matItem);
  m.position.set(-0.5, -0.5, -0.5);
  const g = new THREE.Group();
  g.add(m);
  g.scale.setScalar(0.30);
  g.position.set(0.46, -0.40, -0.66);
  g.rotation.set(0.12, -0.62, 0.16);
  g.frustumCulled = false;
  handScene.add(g);
  handMesh = g;
  if (handArm) handArm.visible = true;
}

/* ═══════════ siklus siang-malam ═══════════ */
const C_NIGHT = { top: [0x06, 0x09, 0x14], mid: [0x0b, 0x11, 0x22], hor: [0x16, 0x1e, 0x33] };
const C_DAY = { top: [0x2f, 0x6e, 0xc8], mid: [0x74, 0xae, 0xe8], hor: [0xc2, 0xdb, 0xf0] };
const C_DUSK = { top: [0x35, 0x36, 0x74], mid: [0x9a, 0x62, 0x8e], hor: [0xef, 0x8f, 0x4a] };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const toCol = (c, out) => out.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.LinearSRGBColorSpace);

function updateSky(dt) {
  if (!S.timeFrozen) timeOfDay = (timeOfDay + dt / (S.dayLength * 60)) % 1;
  S.timeOfDay = timeOfDay;

  const th = (timeOfDay - 0.25) * Math.PI * 2;
  SUN_DIR.set(Math.cos(th), Math.sin(th), 0.28).normalize();
  U.uSunDir.value.copy(SUN_DIR);
  const h = SUN_DIR.y;

  const dayF = clamp((h + 0.06) / 0.34, 0, 1);
  const duskF = Math.exp(-Math.pow(h / 0.20, 2)) * clamp((h + 0.34) / 0.4, 0, 1);
  const night = 1 - clamp((h + 0.02) / 0.20, 0, 1);

  let top = mix3(C_NIGHT.top, C_DAY.top, dayF);
  let mid = mix3(C_NIGHT.mid, C_DAY.mid, dayF);
  let hor = mix3(C_NIGHT.hor, C_DAY.hor, dayF);
  top = mix3(top, C_DUSK.top, duskF * 0.85);
  mid = mix3(mid, C_DUSK.mid, duskF * 0.9);
  hor = mix3(hor, C_DUSK.hor, duskF);

  const su = sky.material.uniforms;
  toCol(top, su.uTop.value); toCol(mid, su.uMid.value); toCol(hor, su.uHorizon.value);
  su.uGround.value.setRGB(hor[0] / 255 * 0.86, hor[1] / 255 * 0.88, hor[2] / 255 * 0.92, THREE.LinearSRGBColorSpace);
  su.uNight.value = night;

  // warna matahari: jingga rendah -> putih hangat tinggi
  const warm = clamp(1 - h / 0.3, 0, 1);
  const sunI = clamp(h * 2.6 + 0.10, 0, 1.25);
  su.uSunCol.value.setRGB(
    0.90 + 0.35 * warm,
    lerp(0.98, 0.60, warm),
    lerp(0.90, 0.30, warm), THREE.LinearSRGBColorSpace);
  if (night > 0.7) su.uSunCol.value.setRGB(0.55, 0.60, 0.78, THREE.LinearSRGBColorSpace);

  U.uSunCol.value.setRGB(
    (1.06 + 0.30 * warm) * sunI,
    (1.00 - 0.42 * warm) * sunI,
    (0.90 - 0.62 * warm) * sunI, THREE.LinearSRGBColorSpace);
  if (h < 0) {
    const moon = clamp(-h * 2.0, 0, 1);
    U.uSunDir.value.multiplyScalar(-1);        // bulan jadi sumber utama
    U.uSunCol.value.setRGB(0.13 * moon, 0.16 * moon, 0.26 * moon, THREE.LinearSRGBColorSpace);
  }

  U.uAmbient.value.setRGB(
    lerp(0.052, 0.30, dayF) + duskF * 0.06,
    lerp(0.062, 0.34, dayF) + duskF * 0.028,
    lerp(0.105, 0.44, dayF), THREE.LinearSRGBColorSpace);

  U.uFogCol.value.setRGB(hor[0] / 255, hor[1] / 255, hor[2] / 255, THREE.LinearSRGBColorSpace);
  scene.userData.dl.color.setRGB(
    lerp(0.35, 1.0, dayF), lerp(0.38, 0.97, dayF), lerp(0.52, 0.90, dayF), THREE.LinearSRGBColorSpace);
  scene.userData.dl.position.copy(U.uSunDir.value);
  scene.userData.dl.intensity = 0.6 + 1.1 * dayF;

  const cu = clouds.material.uniforms;
  cu.uColor.value.setRGB(lerp(0.22, 1.0, dayF) + duskF * 0.25, lerp(0.24, 0.99, dayF) + duskF * 0.05, lerp(0.34, 0.99, dayF), THREE.LinearSRGBColorSpace);
  cu.uShade.value.setRGB(lerp(0.13, 0.72, dayF) + duskF * 0.2, lerp(0.15, 0.77, dayF), lerp(0.24, 0.85, dayF), THREE.LinearSRGBColorSpace);
}

/* ═══════════ pengaturan ═══════════ */
function applyAllSettings() {
  const scale = S.resScale / 100;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2) * scale);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.fov = S.fov; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  handCam.fov = 52; handCam.aspect = innerWidth / innerHeight; handCam.updateProjectionMatrix();
  U.uExposure.value = S.exposure / 100;
  U.uAOAmt.value = S.ao ? 1 : 0;
  U.uWaveAmt.value = S.wave ? 1 : 0;
  clouds.visible = !!S.clouds;
  $('#vignette').style.display = S.vignette ? '' : 'none';
  chunks.setDistance(S.renderDist);
  updateFog();
  Audio3D.setVolume();
}
function updateFog() {
  const far = S.renderDist * CH;
  const amt = S.fogAmt / 100;
  U.uFogFar.value = far * (1.02 - 0.06 * amt);
  U.uFogNear.value = far * lerp(0.92, 0.34, amt);
  camera.far = Math.max(300, far * 2.6);
  camera.updateProjectionMatrix();
}
onSettingChange = (k) => {
  if (k === 'resScale' || k === 'fov') applyAllSettings();
  else if (k === 'renderDist') { chunks.setDistance(S.renderDist); updateFog(); }
  else if (k === 'fogAmt') updateFog();
  else if (k === 'exposure') U.uExposure.value = S.exposure / 100;
  else if (k === 'ao') U.uAOAmt.value = S.ao ? 1 : 0;
  else if (k === 'wave') U.uWaveAmt.value = S.wave ? 1 : 0;
  else if (k === 'clouds') clouds.visible = !!S.clouds;
  else if (k === 'vignette') $('#vignette').style.display = S.vignette ? '' : 'none';
  else if (k === 'timeOfDay') timeOfDay = S.timeOfDay;
  else if (k === 'volume' || k === 'sfx') Audio3D.setVolume();
  else if (k === 'lookMode') {
    if (S.lookMode === 'drag') {
      lockMode = 'drag';
      if (document.pointerLockElement) document.exitPointerLock();
      toast('Menoleh dengan menahan klik kiri');
    } else {
      lockMode = 'lock';
      toast(S.lookMode === 'lock' ? 'Kursor akan dikunci saat bermain' : 'Mode menoleh otomatis');
      if (state === 'play') lockPointer();
    }
  }
};

/* ═══════════ UI ═══════════ */
function buildUI() {
  buildSettingsUI();
  buildKeyList();
  buildHotbar();
  buildInventory();
  buildCharList();
  onCharChange = i => { setCharModel(i); setHandItem(); };
  onHotbarChange = () => setHandItem();
  const ci = Math.max(0, CHARS.findIndex(c => c.key === S.charKey));
  selectChar(ci);
  setHot(0);

  $('#seedIn').value = S.seed;
  $('#wBlocks').textContent = BLOCK_COUNT + ' blok';
  $('#wStatus').textContent = saved.world ? 'TERSIMPAN' : 'BARU';
  if (saved.world) $('#bPlay').firstChild.textContent = 'Lanjutkan Dunia ';
  $('#gpuInfo').textContent = gpuName();
  updateWorldCard();

  const go = (id) => { screenBack = screenNow; showScreen(id); Audio3D.ui(); };
  $('#bPlay').onclick = () => startGame();
  $('#bChars').onclick = () => go('chars');
  $('#bOpts').onclick = () => go('opts');
  $('#bGuide').onclick = () => go('guide');
  $('#bOpts2').onclick = () => go('opts');
  $('#bGuide2').onclick = () => go('guide');
  $('#bNew').onclick = () => newWorld($('#seedIn').value.trim() || randomSeedText());
  $('#bCharOk').onclick = () => { showScreen('menu'); updateWorldCard(); Audio3D.ui(); };
  $('#bResume').onclick = () => resume();
  $('#bSave').onclick = () => doSave();
  $('#bQuit').onclick = () => { doSave(); enterMenu(); };
  $('#bReset').onclick = () => {
    const keep = { charKey: S.charKey, hotbar: S.hotbar, seed: S.seed };
    S = Object.assign({}, DEFAULTS, keep);
    refreshSettingsUI(); applyAllSettings(); persist(); toast('Pengaturan dikembalikan ke bawaan');
  };
  $$('[data-back]').forEach(b => b.onclick = () => {
    Audio3D.ui();
    if (screenNow === 'inv') { resume(); return; }
    showScreen(state === 'menu' ? 'menu' : 'pause');
  });
  $('#seedIn').addEventListener('change', () => {
    const v = $('#seedIn').value.trim();
    if (v && v !== S.seed) newWorld(v);
  });

  // pemutar model di panggung karakter
  const stageEl = $('#charStage');
  stageEl.addEventListener('pointerdown', e => {
    charSpin.drag = true; charSpin.lx = e.clientX; charSpin.ly = e.clientY;
    stageEl.setPointerCapture(e.pointerId);
  });
  stageEl.addEventListener('pointermove', e => {
    if (!charSpin.drag) return;
    charSpin.y += (e.clientX - charSpin.lx) * 0.011;
    charSpin.x = clamp(charSpin.x + (e.clientY - charSpin.ly) * 0.006, -0.9, 0.5);
    charSpin.lx = e.clientX; charSpin.ly = e.clientY;
  });
  const stop = () => charSpin.drag = false;
  stageEl.addEventListener('pointerup', stop);
  stageEl.addEventListener('pointercancel', stop);
  stageEl.addEventListener('wheel', e => {
    e.preventDefault();
    charSpin.z = clamp(charSpin.z + Math.sign(e.deltaY) * 0.35, 3.0, 9.0);
  }, { passive: false });

  if (isTouch) $('#touch').classList.add('on');
  setupInput();
}

function gpuName() {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const n = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'WebGL2';
    return String(n).replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 44);
  } catch (e) { return 'WebGL2'; }
}

function updateWorldCard() {
  const sp = findSpawn(world);
  const bio = world.biomeAt(sp.x, sp.z);
  $('#wSpawn').textContent = `X ${sp.x} · Y ${Math.round(sp.y)} · Z ${sp.z}`;
  $('#wBiome').textContent = `${bio.id} — ${bio.sub}`;
  const st = $('#wStrata');
  st.innerHTML = '';
  const col = [];
  for (let y = Math.min(WH - 1, sp.h + 2); y >= 0; y -= Math.max(1, Math.round((sp.h + 2) / 26))) {
    const id = world.getBlock(sp.x, y, sp.z) || (y <= SEA ? 29 : 0);
    col.push(id);
  }
  for (const id of col) {
    const i = document.createElement('i');
    const B = BLOCKS[id];
    const c = B ? TEX_AVG[B.side] : [12, 16, 24];
    i.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
    i.title = B ? B.name : 'Udara';
    st.append(i);
  }
}

function newWorld(seedText) {
  S.seed = seedText;
  $('#seedIn').value = seedText;
  chunks.clear();
  world = new World(seedToInt(seedText));
  chunks.world = world;
  player.w = world;
  const sp = findSpawn(world);
  player.pos.set(sp.x + 0.5, sp.y, sp.z + 0.5);
  player.vel.set(0, 0, 0);
  for (let i = 0; i < 40; i++) if (!chunks.update(player.pos.x, player.pos.z, 20)) break;
  saved.world = null;
  $('#wStatus').textContent = 'BARU';
  updateWorldCard();
  persist({ world: null });
  toast('Dunia baru dibangkitkan · seed ' + seedText);
}

/* ═══════════ status permainan ═══════════ */
function enterMenu() {
  state = 'menu';
  showScreen('menu');
  document.exitPointerLock && document.exitPointerLock();
  menuAngle = 0;
}
function startGame() {
  state = 'play';
  showHUD();
  Audio3D.init(); Audio3D.resume(); Audio3D.startWind();
  setHandItem();
  lockPointer();
  toast('Selamat menjelajah · Esc untuk jeda');
}
function resume() {
  state = 'play';
  showHUD();
  lockPointer();
}
function lockPointer() {
  if (isTouch) return;
  if (S.lookMode === 'drag') { lockMode = 'drag'; return; }
  if (lockMode === 'drag' && S.lookMode !== 'lock') return;
  lockMode = 'lock';
  const el = $('#gl');
  if (!el.requestPointerLock) { useDragLook(); return; }
  try {
    const r = el.requestPointerLock();
    if (r && r.catch) r.catch(() => useDragLook());
  } catch (e) { useDragLook(); }
  setTimeout(() => {
    if (state === 'play' && document.pointerLockElement !== el) useDragLook();
  }, 400);
}
function useDragLook() {
  if (lockMode === 'drag') return;
  lockMode = 'drag';
  toast('Kursor tidak bisa dikunci di sini — tahan klik kiri untuk melihat sekeliling');
}
function pauseGame() {
  if (state !== 'play') return;
  state = 'pause';
  showScreen('pause');
  const n = world.editCount();
  $('#pauseInfo').textContent = `${n} blok disunting · seed ${S.seed} · ${chunks.stats.chunks} chunk dimuat`;
  document.exitPointerLock && document.exitPointerLock();
}
function doSave() {
  const edits = world.exportEdits();
  const ok = persist({
    world: {
      seed: S.seed, edits,
      pos: player.pos.toArray(), yaw: player.yaw, pitch: player.pitch,
      flying: player.flying, time: timeOfDay
    }
  });
  saved.world = ok ? { seed: S.seed } : null;
  $('#wStatus').textContent = ok ? 'TERSIMPAN' : 'GAGAL';
  toast(ok ? `Dunia tersimpan · ${edits.length / 4} blok disunting` : 'Penyimpanan peramban ditolak', !ok);
}

/* ═══════════ masukan ═══════════ */
function setupInput() {
  const canvas = $('#gl');

  addEventListener('keydown', e => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT') return;
    const k = e.code;
    if (k === 'Escape') {
      e.preventDefault();
      if (state === 'play') pauseGame();
      else if (state === 'inv') resume();
      else if (screenNow === 'opts' || screenNow === 'guide' || screenNow === 'chars') showScreen(state === 'menu' ? 'menu' : 'pause');
      else if (state === 'pause') resume();
      return;
    }
    if (state === 'menu') {
      if (screenNow !== 'menu') return;
      if (k === 'Enter') startGame();
      else if (k === 'KeyC') showScreen('chars');
      else if (k === 'KeyO') showScreen('opts');
      else if (k === 'KeyH') showScreen('guide');
      return;
    }
    if (state !== 'play') return;
    switch (k) {
      case 'KeyW': input.f = 1; break;
      case 'KeyS': input.b = 1; break;
      case 'KeyA': input.l = 1; break;
      case 'KeyD': input.r = 1; break;
      case 'ArrowLeft': e.preventDefault(); input.lookL = 1; break;
      case 'ArrowRight': e.preventDefault(); input.lookR = 1; break;
      case 'ArrowUp': e.preventDefault(); input.lookU = 1; break;
      case 'ArrowDown': e.preventDefault(); input.lookD = 1; break;
      case 'ShiftLeft': case 'ShiftRight': input.sprint = 1; break;
      case 'ControlLeft': case 'ControlRight': input.down = 1; break;
      case 'Space':
        e.preventDefault();
        input.up = 1;
        if (performance.now() - lastSpace < 320) toggleFly();
        lastSpace = performance.now();
        break;
      case 'KeyF': toggleFly(); break;
      case 'KeyE':
        e.preventDefault();
        showScreen('inv'); state = 'inv';
        document.exitPointerLock && document.exitPointerLock();
        break;
      case 'KeyL':
        input.torch = input.torch ? 0 : 1;
        toast(input.torch ? 'Lampu kepala menyala' : 'Lampu kepala padam');
        break;
      case 'KeyR': {
        const h = world.heightAt(Math.floor(player.pos.x), Math.floor(player.pos.z));
        player.pos.y = h + 1.2; player.vel.set(0, 0, 0);
        toast('Kembali ke permukaan · Y ' + Math.round(h + 1));
        break;
      }
      case 'F2': e.preventDefault(); doSave(); break;
      case 'F3': e.preventDefault(); S.debug = !S.debug; $('#debug').classList.toggle('on', S.debug); persist(); break;
      case 'F5': e.preventDefault(); player.mode = (player.mode + 1) % 3;
        toast(['Sudut pandang orang pertama', 'Sudut pandang orang ketiga', 'Sudut pandang depan'][player.mode]); break;
      default:
        if (k.startsWith('Digit')) {
          const n = +k.slice(5);
          if (n >= 1 && n <= 9) setHot(n - 1);
        }
    }
  });

  addEventListener('keyup', e => {
    switch (e.code) {
      case 'KeyW': input.f = 0; break;
      case 'KeyS': input.b = 0; break;
      case 'KeyA': input.l = 0; break;
      case 'KeyD': input.r = 0; break;
      case 'ArrowLeft': input.lookL = 0; break;
      case 'ArrowRight': input.lookR = 0; break;
      case 'ArrowUp': input.lookU = 0; break;
      case 'ArrowDown': input.lookD = 0; break;
      case 'ShiftLeft': case 'ShiftRight': input.sprint = 0; break;
      case 'ControlLeft': case 'ControlRight': input.down = 0; break;
      case 'Space': input.up = 0; break;
    }
  });

  addEventListener('mousemove', e => {
    const s = (S.sens / 100) * 0.0022;
    if (document.pointerLockElement === canvas) {
      player.yawT -= e.movementX * s;
      player.pitchT += (S.invertY ? 1 : -1) * e.movementY * s;
    } else if (dragOn) {
      const dx = e.clientX - dragX, dy = e.clientY - dragY;
      dragX = e.clientX; dragY = e.clientY;
      dragDist += Math.abs(dx) + Math.abs(dy);
      player.yawT -= dx * s * 1.25;
      player.pitchT += (S.invertY ? 1 : -1) * dy * s * 1.25;
    } else return;
    player.pitchT = clamp(player.pitchT, -1.553, 1.553);
  });

  canvas.addEventListener('mousedown', e => {
    if (state === 'menu') { startGame(); return; }
    if (state !== 'play') return;
    if (lockMode === 'drag') {
      e.preventDefault();
      dragOn = true; dragBtn = e.button; dragDist = 0; dragX = e.clientX; dragY = e.clientY;
      return;
    }
    if (document.pointerLockElement !== canvas && !isTouch) { lockPointer(); return; }
    e.preventDefault();
    mouseDown = e.button === 0 ? 1 : (e.button === 2 ? 2 : 3);
    if (mouseDown === 1) { digBlock(); digTimer = 0.26; }
    else if (mouseDown === 2) { placeBlock(); placeTimer = 0.26; }
    else pickBlock();
  });
  addEventListener('mouseup', e => {
    if (dragOn) {
      dragOn = false;
      if (dragDist < 7 && state === 'play') {          // klik pendek = aksi, bukan menoleh
        if (dragBtn === 0) digBlock();
        else if (dragBtn === 2) placeBlock();
        else pickBlock();
      }
    }
    mouseDown = 0;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('wheel', e => {
    if (state !== 'play') return;
    setHot(hotIndex + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });

  document.addEventListener('pointerlockchange', () => {
    if (lockMode === 'lock' && state === 'play' && document.pointerLockElement !== canvas && !isTouch) pauseGame();
  });
  document.addEventListener('pointerlockerror', () => useDragLook());
  addEventListener('resize', () => applyAllSettings());
  addEventListener('blur', () => {
    input.f = input.b = input.l = input.r = input.up = input.down = input.sprint = 0;
    input.lookL = input.lookR = input.lookU = input.lookD = 0;
    dragOn = false;
  });

  if (isTouch) setupTouch(canvas);
}
let lastSpace = 0;
function toggleFly() {
  player.flying = !player.flying;
  player.vel.y = 0;
  toast(player.flying ? 'Mode terbang aktif · Ctrl untuk turun' : 'Mode terbang mati');
}

function setupTouch(canvas) {
  const stick = $('#stick'), knob = stick.querySelector('i');
  let sid = null, sx = 0, sy = 0;
  stick.addEventListener('touchstart', e => {
    const t = e.changedTouches[0]; sid = t.identifier;
    const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2;
    e.preventDefault();
  }, { passive: false });
  const moveStick = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== sid) continue;
      let dx = t.clientX - sx, dy = t.clientY - sy;
      const d = Math.hypot(dx, dy), max = 52;
      if (d > max) { dx *= max / d; dy *= max / d; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      input.f = dy < -12 ? 1 : 0; input.b = dy > 12 ? 1 : 0;
      input.l = dx < -12 ? 1 : 0; input.r = dx > 12 ? 1 : 0;
      input.sprint = d > 44 ? 1 : 0;
    }
    e.preventDefault();
  };
  stick.addEventListener('touchmove', moveStick, { passive: false });
  const endStick = e => {
    for (const t of e.changedTouches) if (t.identifier === sid) {
      sid = null; knob.style.transform = '';
      input.f = input.b = input.l = input.r = input.sprint = 0;
    }
  };
  stick.addEventListener('touchend', endStick);
  stick.addEventListener('touchcancel', endStick);

  let lid = null, lx = 0, ly = 0;
  canvas.addEventListener('touchstart', e => {
    if (state === 'menu') { startGame(); return; }
    const t = e.changedTouches[0];
    lid = t.identifier; lx = t.clientX; ly = t.clientY;
  }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== lid) continue;
      const s = (S.sens / 100) * 0.005;
      player.yawT -= (t.clientX - lx) * s;
      player.pitchT += (S.invertY ? 1 : -1) * (t.clientY - ly) * s;
      player.pitchT = clamp(player.pitchT, -1.553, 1.553);
      lx = t.clientX; ly = t.clientY;
    }
  }, { passive: true });
  canvas.addEventListener('touchend', () => lid = null);

  const hold = (el, on, off) => {
    el.addEventListener('touchstart', e => { e.preventDefault(); on(); }, { passive: false });
    el.addEventListener('touchend', e => { e.preventDefault(); off && off(); }, { passive: false });
  };
  hold($('#tJump'), () => input.up = 1, () => input.up = 0);
  hold($('#tBreak'), () => { mouseDown = 1; digBlock(); digTimer = 0.26; }, () => mouseDown = 0);
  hold($('#tPlace'), () => { mouseDown = 2; placeBlock(); placeTimer = 0.26; }, () => mouseDown = 0);
  $('#tFly').addEventListener('touchstart', e => { e.preventDefault(); toggleFly(); }, { passive: false });
}

/* ═══════════ aksi blok ═══════════ */
function currentHit() {
  player.eyePos(tmpV); player.dirVec(tmpV2);
  return raycastVoxel(world, tmpV.x, tmpV.y, tmpV.z, tmpV2.x, tmpV2.y, tmpV2.z, 6.2);
}
function digBlock() {
  const h = currentHit();
  if (!h) return;
  const B = BLOCKS[h.id];
  if (!B || B.hardness < 0) { Audio3D.deny(); toast('Bedrock tidak bisa digali', true); return; }
  spawnParticles(h.x + 0.5, h.y + 0.5, h.z + 0.5, B, 14);
  world.setBlock(h.x, h.y, h.z, 0);
  refreshLights(h.x, h.z);
  Audio3D.dig(h.id);
  handSwing = 1;
}
function placeBlock() {
  const h = currentHit();
  if (!h) return;
  const id = currentBlock();
  if (!id) { Audio3D.deny(); return; }
  const x = h.x + h.nx, y = h.y + h.ny, z = h.z + h.nz;
  if (y < 0 || y >= WH) return;
  const cur = world.getBlock(x, y, z);
  if (cur > 0 && IS_OPAQUE[cur]) return;
  if (IS_SOLID[id] && boxHitsPlayer(player.pos.x, player.pos.y, player.pos.z, x, y, z)) {
    Audio3D.deny(); toast('Tidak ada ruang di situ', true); return;
  }
  world.setBlock(x, y, z, id);
  refreshLights(x, z);
  Audio3D.place();
  handSwing = 1;
}
function pickBlock() {
  const h = currentHit();
  if (!h) return;
  const i = S.hotbar.indexOf(h.id);
  if (i >= 0) setHot(i);
  else { setHotSlot(hotIndex, h.id); showItemName(); }
  Audio3D.ui();
}
function refreshLights(x, z) {
  const c = world.chunks.get((x >> 4) + ',' + (z >> 4));
  if (c) scanChunkLights(c);
}

function spawnParticles(x, y, z, B, n) {
  const pos = particles.geometry.attributes.position.array;
  const col = particles.geometry.attributes.color.array;
  const c = TEX_AVG[B.side] || [140, 140, 140];
  for (let k = 0; k < n; k++) {
    const i = pData.head; pData.head = (pData.head + 1) % pData.n;
    pos[i * 3] = x + (Math.random() - 0.5) * 0.8;
    pos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.8;
    pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.8;
    pData.vel[i * 3] = (Math.random() - 0.5) * 3.2;
    pData.vel[i * 3 + 1] = Math.random() * 3.6 + 0.6;
    pData.vel[i * 3 + 2] = (Math.random() - 0.5) * 3.2;
    pData.life[i] = 0.75 + Math.random() * 0.5;
    const j = 0.75 + Math.random() * 0.5;
    col[i * 3] = Math.pow(Math.min(1, c[0] / 255 * j), 2.2);
    col[i * 3 + 1] = Math.pow(Math.min(1, c[1] / 255 * j), 2.2);
    col[i * 3 + 2] = Math.pow(Math.min(1, c[2] / 255 * j), 2.2);
  }
  particles.geometry.attributes.position.needsUpdate = true;
  particles.geometry.attributes.color.needsUpdate = true;
}
function updateParticles(dt) {
  const pos = particles.geometry.attributes.position.array;
  let any = false;
  for (let i = 0; i < pData.n; i++) {
    if (pData.life[i] <= 0) continue;
    any = true;
    pData.life[i] -= dt;
    pData.vel[i * 3 + 1] -= 16 * dt;
    pos[i * 3] += pData.vel[i * 3] * dt;
    pos[i * 3 + 1] += pData.vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += pData.vel[i * 3 + 2] * dt;
    if (pData.life[i] <= 0) pos[i * 3 + 1] = -9999;
  }
  if (any) particles.geometry.attributes.position.needsUpdate = true;
}

/* ═══════════ gelung utama ═══════════ */
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  frame++;
  fpsAcc++; fpsT += dt;
  if (fpsT >= 0.5) { fps = fpsAcc / fpsT; fpsAcc = 0; fpsT = 0; }

  U.uTime.value = now / 1000;
  updateSky(dt);

  if (state === 'play') {
    player.update(dt, input);
    if (mouseDown === 1) { digTimer -= dt; if (digTimer <= 0) { digBlock(); digTimer = 0.22; } }
    if (mouseDown === 2) { placeTimer -= dt; if (placeTimer <= 0) { placeBlock(); placeTimer = 0.22; } }
    updateFootsteps(dt);
    const bio = world.biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z));
    if (bio !== lastBiome) { lastBiome = bio; announceBiome(bio); }
  }
  updateParticles(dt);

  // kamera
  if (state === 'menu' || state === 'boot') {
    // ayunan sangat pelan di satu sisi, bukan berputar mengelilingi dunia
    menuAngle += dt * 0.10;
    const a = 0.95 + Math.sin(menuAngle) * 0.14;
    const cx = player.pos.x, cz = player.pos.z, cy = player.pos.y + 15;
    camera.position.set(cx + Math.cos(a) * 30, cy + Math.sin(menuAngle * 0.55) * 1.1, cz + Math.sin(a) * 30);
    camera.lookAt(cx, player.pos.y + 2.5, cz);
  } else {
    positionCamera(dt);
  }

  U.uCam.value.copy(camera.position);
  U.uTorch.value = lerp(U.uTorch.value, input.torch ? 1 : 0, Math.min(1, dt * 6));
  U.uUnder.value = lerp(U.uUnder.value, player.eyeInWater ? 1 : 0, Math.min(1, dt * 7));
  U.uLightN.value = chunks.collectLights(camera.position.x, camera.position.y, camera.position.z, U.uLights.value, MAX_LIGHTS);

  sky.position.copy(camera.position);
  sky.scale.setScalar(camera.far * 0.5);
  clouds.position.x = Math.round(camera.position.x / 40) * 40;
  clouds.position.z = Math.round(camera.position.z / 40) * 40;

  chunks.update(player.pos.x, player.pos.z, state === 'play' ? 7 : 5);

  // sorotan blok
  if (state === 'play' && player.mode !== 2) {
    const h = currentHit();
    if (h) { selBox.visible = true; selBox.position.set(h.x + 0.5, h.y + 0.5, h.z + 0.5); }
    else selBox.visible = false;
  } else selBox.visible = false;

  updateWorldCharacter(dt);
  if (state !== 'menu' && state !== 'boot') updateHUD();

  // ═══ render ═══
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.autoClear = true;
  renderer.render(scene, camera);

  if (state !== 'menu' && state !== 'boot' && player.mode === 0) {
    renderer.autoClear = false;
    renderer.clearDepth();
    updateHand(dt);
    renderer.render(handScene, handCam);
  }

  if (screenNow === 'chars') renderCharStage(dt);

  renderer.autoClear = true;
  const eyeId = player.eyeInWater ? world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y + EYE), Math.floor(player.pos.z)) : 0;
  const tint = $('#tint');
  tint.style.opacity = eyeId === 30 ? 0.72 : (player.eyeInWater ? 0.26 : 0);
  if (eyeId === 30) tint.style.background = '#c8501e';
  else if (player.eyeInWater) tint.style.background = '#1e5a8c';
}

const _tp = new THREE.Vector3();
let _tpReady = false, _lastMode = 0;
function positionCamera(dt) {
  player.eyePos(tmpV);
  const sp = clamp(player.speedNow / 7, 0, 1);
  bob += dt * player.speedNow * 1.9;
  // goyangan langkah: mati secara bawaan, dan tidak pernah memiringkan kamera
  const bobA = (S.bob && player.onGround) ? sp * 0.030 : 0;
  const bx = Math.cos(bob) * bobA, by = Math.abs(Math.sin(bob)) * bobA;

  if (player.mode !== _lastMode) { _lastMode = player.mode; _tpReady = false; }

  if (player.mode === 0) {
    camera.position.set(
      tmpV.x + Math.cos(player.yaw) * bx,
      tmpV.y + by,
      tmpV.z - Math.sin(player.yaw) * bx);
    camera.rotation.set(player.pitch, player.yaw, 0);
  } else {
    const back = player.mode === 1 ? 1 : -1;
    player.dirVec(tmpV2);
    let dist = 4.4;
    const rd = raycastVoxel(world, tmpV.x, tmpV.y, tmpV.z, -tmpV2.x * back, -tmpV2.y * back, -tmpV2.z * back, dist + 0.4);
    if (rd) dist = Math.max(0.7, rd.dist - 0.35);
    _tp.set(tmpV.x - tmpV2.x * back * dist, tmpV.y - tmpV2.y * back * dist + 0.25, tmpV.z - tmpV2.z * back * dist);
    if (!_tpReady) { camera.position.copy(_tp); _tpReady = true; }
    else camera.position.lerp(_tp, Math.min(1, dt * 16));
    camera.lookAt(tmpV.x, tmpV.y + 0.1, tmpV.z);
  }
}

function updateWorldCharacter(dt) {
  if (!worldChar) return;
  const show = state !== 'menu' && state !== 'boot' && player.mode !== 0;
  worldChar.root.visible = show;
  if (!show) return;
  worldChar.root.position.set(player.pos.x, player.pos.y, player.pos.z);
  worldChar.root.rotation.y = player.yaw + Math.PI;
  animateCharacter(worldChar, U.uTime.value, clamp(player.speedNow / 5, 0, 1), -player.pitch, player.walkPhase);
}

function updateHand(dt) {
  handSwing = Math.max(0, handSwing - dt * 3.6);
  const s = Math.sin((1 - handSwing) * Math.PI) * handSwing;
  const sp = clamp(player.speedNow / 7, 0, 1) * (S.bob ? 1 : 0.35);
  const sway = Math.sin(bob) * 0.035 * sp, sway2 = Math.abs(Math.cos(bob)) * 0.03 * sp;
  if (handMesh) {
    handMesh.position.set(0.46 + sway, -0.40 - sway2 - s * 0.30, -0.66 + s * 0.16);
    handMesh.rotation.set(0.12 + s * 1.15, -0.62 - s * 0.35, 0.16);
    handMesh.visible = true;
  }
  if (handArm) {
    handArm.position.set(0.42 + sway, -0.46 - sway2 - s * 0.26, -0.62 + s * 0.14);
    handArm.rotation.set(-0.35 + s * 1.05, 0.2, -0.16);
  }
  handLight.position.copy(U.uSunDir.value).multiplyScalar(1).add(new THREE.Vector3(0.4, 0.9, 0.9));
}

function updateFootsteps(dt) {
  if (!player.onGround || player.speedNow < 1.2) return;
  lastStepD += player.speedNow * dt;
  const stride = player.sprint ? 2.0 : 2.6;
  if (lastStepD > stride) {
    lastStepD = 0;
    const id = world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.2), Math.floor(player.pos.z));
    if (id > 0) Audio3D.step(id);
  }
}

function renderCharStage(dt) {
  const r = $('#charStage').getBoundingClientRect();
  if (r.width < 40 || r.height < 40) return;
  const x = r.left, y = innerHeight - r.bottom, w = r.width, h = r.height;
  renderer.setViewport(x, y, w, h);
  renderer.setScissor(x, y, w, h);
  renderer.setScissorTest(true);
  renderer.autoClear = false;
  renderer.clearDepth();
  charCam.aspect = r.width / r.height;
  charCam.updateProjectionMatrix();
  const cx = Math.sin(charSpin.y) * charSpin.z, cz = Math.cos(charSpin.y) * charSpin.z;
  charCam.position.set(cx, 1.00 + charSpin.x * -2.4, cz);
  charCam.lookAt(0, 0.90, 0);
  if (charModel) animateCharacter(charModel, U.uTime.value, 0, 0, U.uTime.value * 1.6);
  if (charPivot) charPivot.rotation.y = 0;
  renderer.render(charScene, charCam);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
}

function updateHUD() {
  if (!S.debug) { $('#debug').classList.remove('on'); return; }
  $('#debug').classList.add('on');
  const p = player.pos;
  const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
  const bio = world.biomeAt(bx, bz);
  const under = world.getBlock(bx, by - 1, bz);
  const B = BLOCKS[under];
  const info = renderer.info.render;
  $('#debug').innerHTML =
    `VOXELIA 1.0 · <b>${fps.toFixed(0)} fps</b> <span class="dim">(${(1000 / Math.max(fps, 1)).toFixed(1)} ms)</span><br>` +
    `XYZ <b>${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}</b><br>` +
    `chunk <b>${bx >> 4}, ${bz >> 4}</b> <span class="dim">lokal ${((bx % 16) + 16) % 16}, ${((bz % 16) + 16) % 16}</span><br>` +
    `bioma <b>${bio.id}</b><br>` +
    `pijakan <b>${B ? B.name : 'udara'}</b> <span class="dim">#${String(under).padStart(3, '0')}</span><br>` +
    `<span class="dim">${chunks.stats.chunks} chunk · ${chunks.stats.meshes} mesh · ${(chunks.stats.tris / 1000).toFixed(0)}k tri · ${info.calls} draw</span><br>` +
    `<span class="dim">waktu ${clockLabel(timeOfDay)} · matahari ${(Math.asin(clamp(U.uSunDir.value.y, -1, 1)) * 57.3).toFixed(0)}° · cahaya ${U.uLightN.value}</span><br>` +
    `<span class="dim">${player.flying ? 'terbang' : (player.inWater ? 'berenang' : (player.onGround ? 'di tanah' : 'jatuh'))} · ${player.speedNow.toFixed(1)} blok/d</span>`;
}

/* mulai */
boot().catch(e => {
  console.error(e);
  bootLog('galat saat memuat: ' + (e && e.message ? e.message : e), 'GAGAL');
});
