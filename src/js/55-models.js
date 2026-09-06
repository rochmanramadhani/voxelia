'use strict';
/* Model 3D: geometri kubus item, ikon blok yang dirender, dan penjelajah.
   Semua dibangun dari kotak + tekstur kanvas prosedural. */

/* ---------- geometri satu blok (format atribut sama dengan mesher) ---------- */
function blockCubeGeom(id) {
  const B = BLOCKS[id];
  const pos = [], dat = [], idx = [];
  let vc = 0;
  const push = (x, y, z, layer, u, v, face, ao) => {
    pos.push(x * 8, y * 8, z * 8);
    dat.push(ao, 255, layer, face | (u << 3) | (v << 4));
    vc++;
  };
  if (B.kind === K_CROSS) {
    const quads = [
      [[0, 0, 0], [1, 0, 1], [1, 1, 1], [0, 1, 0]],
      [[1, 0, 0], [0, 0, 1], [0, 1, 1], [1, 1, 0]]
    ];
    for (const q of quads) {
      const base = vc;
      for (let k = 0; k < 4; k++) {
        const c = q[k];
        const u = (k === 1 || k === 2) ? 1 : 0, v = (k === 0 || k === 1) ? 1 : 0;
        push(c[0], c[1], c[2], B.side, u, v, 6, 255);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  } else {
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const layer = f === 3 ? B.top : (f === 2 ? B.bottom : B.side);
      const base = vc;
      for (let k = 0; k < 4; k++) {
        const c = F.corners[k];
        push(c.pos[0], c.pos[1], c.pos[2], layer, c.uv[0], c.uv[1], f, 255);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('aPos', new THREE.BufferAttribute(new Uint16Array(pos), 3));
  g.setAttribute('aData', new THREE.BufferAttribute(new Uint8Array(dat), 4));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.5, 0.5, 0.5), 1.2);
  return g;
}

/* ---------- ikon blok: render 3D asli -> dataURL ---------- */
function bakeBlockIcons(renderer, itemMat, size = 96) {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat
  });
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-0.98, 0.98, 0.98, -0.98, 0.01, 12);
  cam.position.set(2.2, 2.0, 2.6);
  cam.lookAt(0, 0, 0);
  const holder = new THREE.Group();
  scene.add(holder);

  const buf = new Uint8Array(size * size * 4);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);

  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearAlpha();
  renderer.setClearAlpha(0);

  const icons = {};
  for (let id = 1; id < BLOCKS.length; id++) {
    if (!BLOCKS[id]) continue;
    const mesh = new THREE.Mesh(blockCubeGeom(id), itemMat);
    mesh.position.set(-0.5, -0.5, -0.5);
    mesh.frustumCulled = false;
    holder.add(mesh);

    renderer.setRenderTarget(rt);
    renderer.clear(true, true, true);
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);

    for (let y = 0; y < size; y++) {                 // WebGL membaca dari bawah
      const src = (size - 1 - y) * size * 4, dst = y * size * 4;
      img.data.set(buf.subarray(src, src + size * 4), dst);
    }
    ctx.putImageData(img, 0, 0);
    icons[id] = cv.toDataURL('image/png');

    holder.remove(mesh);
    mesh.geometry.dispose();
  }

  renderer.setRenderTarget(prevTarget);
  renderer.setClearAlpha(prevClear);
  rt.dispose();
  return icons;
}

/* ---------- tekstur kulit karakter ---------- */
function skinTex(baseHex, opts = {}) {
  const p = new Pix(16, opts.seed || 1234);
  const base = hexRgb(baseHex);
  grain(p, base, opts.blotch === undefined ? 0.05 : opts.blotch, 0.045, 4);
  if (opts.stripe) {
    const s = hexRgb(opts.stripe);
    for (let y = 0; y < 16; y++) if ((y % 6) < 2) for (let x = 0; x < 16; x++) p.set(x, y, shade(s, 0.92 + p.rnd() * 0.16));
  }
  if (opts.panel) {
    const s = hexRgb(opts.panel);
    for (let y = 2; y < 14; y++) for (let x = 5; x < 11; x++) p.set(x, y, shade(s, 0.9 + p.rnd() * 0.2));
  }
  if (opts.speck) {
    const s = hexRgb(opts.speck);
    for (let i = 0; i < 18; i++) p.set((p.rnd() * 16) | 0, (p.rnd() * 16) | 0, s);
  }
  return canvasTexFromPix(p);
}
function faceTex(skinHex, opts = {}) {
  const p = new Pix(16, opts.seed || 77);
  grain(p, hexRgb(skinHex), 0.05, 0.04, 4);
  const eye = hexRgb(opts.eye || '#241d18');
  const white = hexRgb(opts.white || '#f2f0e8');
  const ey = opts.eyeY === undefined ? 6 : opts.eyeY;
  for (const ex of [3, 9]) {
    for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 2; dy++) p.set(ex + dx, ey + dy, white);
    p.set(ex + (opts.pupil === undefined ? 2 : opts.pupil), ey, eye);
    p.set(ex + (opts.pupil === undefined ? 2 : opts.pupil), ey + 1, eye);
  }
  if (opts.brow) { const b = hexRgb(opts.brow); for (let x = 3; x < 13; x++) if (x < 7 || x > 8) p.set(x, ey - 2, b); }
  const mouth = hexRgb(opts.mouth || '#6b4038');
  for (let x = 6; x < 10; x++) p.set(x, 11, mouth);
  if (opts.glow) {
    const g = hexRgb(opts.glow);
    for (const ex of [3, 9]) for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 2; dy++) p.set(ex + dx, ey + dy, g);
  }
  return canvasTexFromPix(p);
}
function hexRgb(h) {
  h = h.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function canvasTexFromPix(p) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = p.s;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(p.s, p.s);
  img.data.set(p.d);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- daftar penjelajah ---------- */
const CHARS = [
  {
    key: 'rana', name: 'Rana', role: 'Ahli Geologi', sw: '#2E8B7A',
    bio: 'Memetakan strata sejak sektor pertama dibuka. Jaket lapangan tahan abrasi, palu selalu di pinggang.',
    skin: '#c98d63', shirt: '#2e8b7a', pants: '#3a4553', shoe: '#20262f',
    hat: { type: 'cap', color: '#e0a63c' }
  },
  {
    key: 'bagas', name: 'Bagas', role: 'Penambang', sw: '#E0A63C',
    bio: 'Turun ke terowongan sebelum matahari terbit. Helm bercahaya, jadi gua paling gelap pun terbaca.',
    skin: '#a9744a', shirt: '#c46a2c', pants: '#4a4038', shoe: '#26201a',
    hat: { type: 'helmet', color: '#f0c33c', lamp: true }
  },
  {
    key: 'nuri', name: 'Nuri', role: 'Perintis Hutan', sw: '#4E9A3E',
    bio: 'Hafal setiap jenis dedaunan di sektor utara. Berjalan tanpa suara, menanam lebih banyak dari yang ditebang.',
    skin: '#d8a377', shirt: '#4e9a3e', pants: '#3d5730', shoe: '#2a2118',
    hat: { type: 'hood', color: '#3f7d33' }
  },
  {
    key: 'ombak', name: 'Ombak', role: 'Penyelam Cekungan', sw: '#2C6FA8',
    bio: 'Memetakan dasar laut dan gua bawah air. Setelan selam rapat, visor kaca tahan tekanan.',
    skin: '#8f6a4e', shirt: '#22394f', pants: '#1b2c3d', shoe: '#14202c',
    hat: { type: 'visor', color: '#2c6fa8' }, faceOpts: { glow: '#9fd8ff', mouth: '#2a3a4a' }
  },
  {
    key: 'mk3', name: 'MK-3', role: 'Unit Otomat', sw: '#9C8BE8',
    bio: 'Rangka logam hasil daur ulang bijih besi. Tidak butuh tidur, tidak pernah tersesat, sesekali berdengung.',
    skin: '#9aa3ad', shirt: '#6f7883', pants: '#5b636d', shoe: '#3c424a',
    hat: { type: 'antenna', color: '#9c8be8' },
    faceOpts: { glow: '#a48cff', mouth: '#3a3f46', eyeY: 7 },
    metal: true
  },
  {
    key: 'rubah', name: 'Sengu', role: 'Rubah Pendamping', sw: '#D2703A',
    bio: 'Bukan manusia, dan tidak keberatan soal itu. Ikut ke mana pun, berhenti tiap kali mencium bijih.',
    quad: true, skin: '#d2703a', shirt: '#d2703a', pants: '#f0e6d8', shoe: '#2a2018'
  }
];

/** Bangun model penjelajah. Kembalikan { root, parts } untuk dianimasikan. */
function buildCharacter(def) {
  const U = 1 / 16;
  const mat = (tex, extra = {}) => new THREE.MeshLambertMaterial(Object.assign({ map: tex }, extra));
  const texSkin = skinTex(def.skin, { seed: 11, speck: def.metal ? '#c8d0da' : null });
  const texShirt = skinTex(def.shirt, { seed: 22, blotch: 0.07 });
  const texPants = skinTex(def.pants, { seed: 33, blotch: 0.07 });
  const texShoe = skinTex(def.shoe, { seed: 44 });
  const texFace = faceTex(def.skin, Object.assign({ seed: 55 }, def.faceOpts || {}));

  const mSkin = mat(texSkin), mShirt = mat(texShirt), mPants = mat(texPants), mShoe = mat(texShoe);
  const mFace = mat(texFace);

  const box = (w, h, d, m) => {
    const g = new THREE.BoxGeometry(w * U, h * U, d * U);
    return new THREE.Mesh(g, m);
  };
  const root = new THREE.Group();
  const parts = {};

  if (def.quad) {
    /* --- rubah: kuadruped --- */
    const body = new THREE.Group(); body.position.y = 10 * U; root.add(body);
    const torso = box(7, 6, 14, mSkin); body.add(torso);
    const headP = new THREE.Group(); headP.position.set(0, 2 * U, 7 * U); body.add(headP);
    const head = box(7, 6, 6, mSkin); head.position.z = 2 * U; headP.add(head);
    const snout = box(4, 3, 3, mat(skinTex(def.pants, { seed: 66 })));
    snout.position.set(0, -1.2 * U, 6 * U); headP.add(snout);
    for (const s of [-1, 1]) {
      const ear = box(2.4, 3.2, 1.4, mSkin);
      ear.position.set(s * 2.2 * U, 4 * U, 1.6 * U); headP.add(ear);
    }
    const tailP = new THREE.Group(); tailP.position.set(0, 2 * U, -7 * U); body.add(tailP);
    const tail = box(4, 4, 9, mSkin); tail.position.z = -4 * U; tailP.add(tail);
    const tip = box(4.2, 4.2, 3, mat(skinTex(def.pants, { seed: 77 }))); tip.position.z = -9 * U; tailP.add(tip);
    parts.tail = tailP; parts.head = headP;
    parts.legs = [];
    let i = 0;
    for (const dz of [5, -5]) for (const dx of [-2.4, 2.4]) {
      const lp = new THREE.Group(); lp.position.set(dx * U, 0, dz * U); body.add(lp);
      const leg = box(2.6, 10, 2.6, i < 2 ? mSkin : mSkin); leg.position.y = -5 * U; lp.add(leg);
      const paw = box(2.8, 2, 2.8, mat(skinTex(def.shoe, { seed: 88 }))); paw.position.y = -9 * U; lp.add(paw);
      parts.legs.push(lp); i++;
    }
    root.scale.setScalar(0.95);
    parts.isQuad = true;
    return { root, parts, def };
  }

  /* --- humanoid --- */
  const body = new THREE.Group(); root.add(body); parts.body = body;
  const torso = box(8, 12, 4, mShirt); torso.position.y = 18 * U; body.add(torso);

  const headP = new THREE.Group(); headP.position.y = 24 * U; body.add(headP);
  const head = new THREE.Mesh(new THREE.BoxGeometry(8 * U, 8 * U, 8 * U),
    [mSkin, mSkin, mSkin, mSkin, mFace, mSkin]);       // +X,-X,+Y,-Y,+Z,-Z
  head.position.y = 4 * U; headP.add(head);
  parts.head = headP;

  const hat = def.hat;
  if (hat) {
    const hm = mat(skinTex(hat.color, { seed: 99 }));
    if (hat.type === 'cap') {
      const c = box(8.6, 2.2, 8.6, hm); c.position.y = 7.4 * U; headP.add(c);
      const brim = box(8.6, 0.8, 3.2, hm); brim.position.set(0, 6.2 * U, 5.2 * U); headP.add(brim);
    } else if (hat.type === 'helmet') {
      const c = box(8.8, 4.4, 8.8, hm); c.position.y = 6.4 * U; headP.add(c);
      const brim = box(9.2, 0.9, 3.6, hm); brim.position.set(0, 4.6 * U, 5.4 * U); headP.add(brim);
      if (hat.lamp) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.4 * U, 2.4 * U, 1.6 * U),
          new THREE.MeshBasicMaterial({ color: 0xffe6a8 }));
        lamp.position.set(0, 6.6 * U, 5.2 * U); headP.add(lamp);
        parts.lamp = lamp;
      }
    } else if (hat.type === 'hood') {
      const c = box(9.4, 9.4, 9.4, hm); c.position.y = 4 * U; c.scale.z = 1.05; headP.add(c);
      const face = box(6.2, 5.4, 1.2, mFace); face.position.set(0, 4 * U, 4.8 * U); headP.add(face);
    } else if (hat.type === 'visor') {
      const c = box(9, 9, 9, hm); c.position.y = 4 * U; headP.add(c);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(6.4 * U, 4.4 * U, 1 * U),
        new THREE.MeshLambertMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.62 }));
      glass.position.set(0, 4.4 * U, 4.7 * U); headP.add(glass);
    } else if (hat.type === 'antenna') {
      const st = box(1, 4, 1, hm); st.position.y = 10 * U; headP.add(st);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(2 * U, 2 * U, 2 * U),
        new THREE.MeshBasicMaterial({ color: 0xb8a2ff }));
      bulb.position.y = 12.5 * U; headP.add(bulb);
      parts.lamp = bulb;
    }
  }

  parts.arms = [];
  for (const s of [-1, 1]) {
    const ap = new THREE.Group(); ap.position.set(s * 6 * U, 23 * U, 0); body.add(ap);
    const arm = box(4, 12, 4, mShirt); arm.position.y = -6 * U; ap.add(arm);
    const hand = box(4.1, 2.4, 4.1, mSkin); hand.position.y = -11 * U; ap.add(hand);
    parts.arms.push(ap);
  }
  parts.legs = [];
  for (const s of [-1, 1]) {
    const lp = new THREE.Group(); lp.position.set(s * 2 * U, 12 * U, 0); body.add(lp);
    const leg = box(4, 12, 4, mPants); leg.position.y = -6 * U; lp.add(leg);
    const shoe = box(4.2, 2.4, 5, mShoe); shoe.position.set(0, -11 * U, 0.4 * U); lp.add(shoe);
    parts.legs.push(lp);
  }
  root.scale.setScalar(0.9);      // 32 px -> 1.8 unit
  return { root, parts, def };
}

/** Animasi berjalan / diam. `speed` 0..1, `t` waktu, `yaw/pitch` arah kepala. */
function animateCharacter(m, t, speed, pitch = 0, walkPhase = 0) {
  const p = m.parts;
  const sw = Math.sin(walkPhase) * clamp(speed, 0, 1);
  const sw2 = Math.sin(walkPhase * 2) * clamp(speed, 0, 1);
  if (p.isQuad) {
    if (p.legs) p.legs.forEach((l, i) => { l.rotation.x = Math.sin(walkPhase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.85 * clamp(speed, 0, 1); });
    if (p.tail) { p.tail.rotation.y = Math.sin(t * 2.2) * 0.28; p.tail.rotation.x = -0.25 + Math.sin(t * 1.6) * 0.12; }
    if (p.head) { p.head.rotation.x = clamp(pitch, -0.5, 0.5) * 0.6 + Math.sin(t * 1.1) * 0.05; }
    return;
  }
  if (p.arms) {
    p.arms[0].rotation.x = sw * 0.95;
    p.arms[1].rotation.x = -sw * 0.95;
    p.arms[0].rotation.z = 0.06 + Math.sin(t * 1.3) * 0.03 * (1 - speed);
    p.arms[1].rotation.z = -0.06 - Math.sin(t * 1.3) * 0.03 * (1 - speed);
  }
  if (p.legs) {
    p.legs[0].rotation.x = -sw * 1.05;
    p.legs[1].rotation.x = sw * 1.05;
  }
  if (p.body) p.body.position.y = Math.abs(sw2) * 0.035 + Math.sin(t * 1.4) * 0.006;
  if (p.head) {
    p.head.rotation.x = clamp(pitch, -0.9, 0.9) * 0.75;
    p.head.rotation.y = Math.sin(t * 0.7) * 0.09 * (1 - clamp(speed, 0, 1));
  }
}
