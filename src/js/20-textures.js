'use strict';
/* Procedural 16x16 textures, all drawn here. Zero external assets.
   The result is one DataArrayTexture (one layer per texture), so mipmaps never
   bleed between tiles the way they do in a packed atlas. */

const TILE = 16;

class Pix {
  constructor(size, seed) {
    this.s = size;
    this.d = new Uint8ClampedArray(size * size * 4);
    this.rnd = mulberry32(seed);
    this._h = seed | 0;
  }
  set(x, y, c, a = 255) {
    x = ((x % this.s) + this.s) % this.s; y = ((y % this.s) + this.s) % this.s;
    const i = (y * this.s + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  get(x, y) {
    x = ((x % this.s) + this.s) % this.s; y = ((y % this.s) + this.s) % this.s;
    const i = (y * this.s + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  fill(c, a = 255) { for (let y = 0; y < this.s; y++) for (let x = 0; x < this.s; x++) this.set(x, y, c, a); }
  clear() { this.d.fill(0); }
  /** Value noise that wraps cleanly on multiples of `period`, so tiles repeat seamlessly. */
  vn(x, y, period) {
    const p = period, fx = x / (this.s / p), fy = y / (this.s / p);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0);
    const h = (a, b) => hash2(((a % p) + p) % p, ((b % p) + p) % p, this._h);
    return lerp(lerp(h(x0, y0), h(x0 + 1, y0), tx), lerp(h(x0, y0 + 1), h(x0 + 1, y0 + 1), tx), ty);
  }
}

const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f];

/** Grainy base: a colour plus soft blotches plus per-pixel jitter. */
function grain(p, col, blotch = 0.10, jitter = 0.10, period = 4) {
  for (let y = 0; y < p.s; y++) for (let x = 0; x < p.s; x++) {
    const n = (p.vn(x, y, period) - 0.5) * 2 * blotch;
    const j = (p.rnd() - 0.5) * 2 * jitter;
    p.set(x, y, shade(col, 1 + n + j));
  }
}

/** Irregular blobs (ore, gravel, moss). */
function blobs(p, n, col, rad, jitter = 0.12, alpha = 255) {
  for (let i = 0; i < n; i++) {
    const cx = p.rnd() * p.s, cy = p.rnd() * p.s;
    const r = rad * (0.6 + p.rnd() * 0.8);
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const dx = x - cx, dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy) + (p.rnd() - 0.5) * 0.9;
        if (d <= r) p.set(x, y, shade(col, 1 + (p.rnd() - 0.5) * 2 * jitter), alpha);
      }
  }
}

/* ---- palette ---- */
const C = {
  stone: [124, 124, 124], dirt: [122, 84, 55], grass: [96, 154, 68], grassDry: [140, 152, 74],
  sand: [219, 207, 156], redSand: [176, 96, 56], gravel: [131, 128, 124], clay: [160, 166, 179],
  oak: [110, 82, 48], oakTop: [155, 122, 76], leafOak: [70, 130, 52], leafBirch: [116, 164, 74],
  leafPine: [50, 100, 66], birch: [216, 214, 204], birchTop: [188, 176, 140],
  plank: [162, 124, 76], brick: [150, 76, 62], mortar: [176, 168, 158],
  snow: [242, 246, 250], ice: [156, 200, 232], cactus: [72, 122, 60],
  obsidian: [26, 20, 40], glow: [230, 180, 92], bedrock: [72, 72, 78],
  water: [46, 108, 176], lava: [214, 92, 30],
  coal: [34, 34, 38], iron: [190, 146, 112], gold: [230, 190, 72], diamond: [110, 226, 226],
};

/* ---- one generator per texture ---- */
const GEN = {
  stone: p => { grain(p, C.stone, 0.13, 0.06, 4); },
  dirt: p => { grain(p, C.dirt, 0.14, 0.10, 4); blobs(p, 5, shade(C.dirt, 0.78), 1.4, 0.1); },
  grass_top: p => { grain(p, C.grass, 0.13, 0.11, 4); blobs(p, 4, shade(C.grass, 1.14), 1.5, 0.08); },
  grass_side: p => {
    grain(p, C.dirt, 0.14, 0.10, 4);
    for (let x = 0; x < p.s; x++) {
      const h = 3 + Math.round(p.vn(x, 0, 8) * 2.6);
      for (let y = 0; y < h; y++) p.set(x, y, shade(C.grass, 0.92 + p.rnd() * 0.24));
      p.set(x, h, mixc(C.grass, C.dirt, 0.5));
    }
  },
  cobble: p => {
    grain(p, shade(C.stone, 0.82), 0.10, 0.05, 4);
    blobs(p, 9, shade(C.stone, 1.14), 2.1, 0.09);
    blobs(p, 5, shade(C.stone, 0.62), 1.0, 0.12);
  },
  stone_brick: p => {
    grain(p, shade(C.stone, 0.96), 0.09, 0.05, 4);
    const dark = shade(C.stone, 0.6);
    for (let x = 0; x < p.s; x++) { p.set(x, 7, dark); p.set(x, 15, dark); }
    for (let y = 0; y < 8; y++) p.set(3, y, dark);
    for (let y = 8; y < 16; y++) p.set(11, y, dark);
  },
  mossy: p => {
    GEN.cobble(p);
    for (let y = 0; y < p.s; y++) for (let x = 0; x < p.s; x++) {
      const n = p.vn(x, y, 4);
      if (n > 0.52) p.set(x, y, mixc(p.get(x, y), shade(C.leafPine, 0.9 + p.rnd() * 0.3), clamp((n - 0.52) * 3.2, 0, 0.92)));
    }
  },
  sand: p => { grain(p, C.sand, 0.07, 0.07, 8); },
  red_sand: p => { grain(p, C.redSand, 0.09, 0.08, 8); },
  sandstone_top: p => { grain(p, shade(C.sand, 1.02), 0.05, 0.05, 8); },
  sandstone_side: p => {
    grain(p, C.sand, 0.05, 0.05, 8);
    for (let x = 0; x < p.s; x++) {
      p.set(x, 0, shade(C.sand, 1.1)); p.set(x, 1, shade(C.sand, 1.06));
      p.set(x, 12, shade(C.sand, 0.86)); p.set(x, 13, shade(C.sand, 0.9));
    }
  },
  gravel: p => {
    grain(p, C.gravel, 0.10, 0.08, 4);
    blobs(p, 12, shade(C.gravel, 1.18), 1.5, 0.1);
    blobs(p, 8, shade(C.gravel, 0.7), 1.2, 0.1);
  },
  clay: p => { grain(p, C.clay, 0.06, 0.05, 8); },
  oak_side: p => {
    grain(p, C.oak, 0.10, 0.07, 4);
    for (let x = 0; x < p.s; x++) {
      if (p.rnd() < 0.42) { const f = 0.76 + p.rnd() * 0.14; for (let y = 0; y < p.s; y++) if (p.rnd() < 0.85) p.set(x, y, shade(C.oak, f)); }
    }
  },
  oak_top: p => {
    grain(p, C.oakTop, 0.07, 0.06, 8);
    for (let y = 0; y < p.s; y++) for (let x = 0; x < p.s; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (Math.abs((d % 3) - 1.4) < 0.55) p.set(x, y, shade(C.oakTop, 0.78));
    }
  },
  birch_side: p => {
    grain(p, C.birch, 0.05, 0.05, 8);
    for (let i = 0; i < 5; i++) {
      const x = (p.rnd() * 13) | 0, y = (p.rnd() * 16) | 0, w = 2 + ((p.rnd() * 3) | 0);
      for (let k = 0; k < w; k++) { p.set(x + k, y, [46, 44, 40]); if (p.rnd() < 0.5) p.set(x + k, y + 1, [72, 68, 62]); }
    }
  },
  birch_top: p => { grain(p, C.birchTop, 0.07, 0.06, 8); blobs(p, 3, shade(C.birchTop, 0.84), 1.6, 0.08); },
  oak_leaves: p => leafTex(p, C.leafOak),
  birch_leaves: p => leafTex(p, C.leafBirch),
  pine_leaves: p => leafTex(p, C.leafPine),
  planks: p => {
    grain(p, C.plank, 0.06, 0.07, 8);
    const dark = shade(C.plank, 0.62);
    for (let x = 0; x < p.s; x++) { p.set(x, 3, dark); p.set(x, 11, dark); }
    for (let y = 0; y < p.s; y++) {
      if (y !== 3 && y !== 11 && p.rnd() < 0.30) p.set((p.rnd() * 16) | 0, y, shade(C.plank, 0.82));
    }
    for (let y = 4; y < 11; y++) p.set(9, y, dark);
    for (let y = 12; y < 16; y++) p.set(4, y, dark);
    for (let y = 0; y < 3; y++) p.set(4, y, dark);
  },
  bricks: p => {
    p.fill(C.mortar);
    const put = (x0, y0, w) => {
      for (let y = y0; y < y0 + 3; y++) for (let x = x0; x < x0 + w; x++)
        p.set(x, y, shade(C.brick, 0.9 + p.rnd() * 0.22));
    };
    for (let r = 0; r < 4; r++) {
      const y0 = r * 4, off = (r % 2) ? 4 : 0;
      for (let c = -1; c < 3; c++) put(off + c * 8, y0, 7);
    }
  },
  glass: p => {
    p.clear();
    const g = [214, 236, 246];
    for (let x = 0; x < p.s; x++) { p.set(x, 0, g, 150); p.set(x, 15, g, 150); }
    for (let y = 0; y < p.s; y++) { p.set(0, y, g, 150); p.set(15, y, g, 150); }
    for (let i = 0; i < 5; i++) { p.set(3 + i, 4 + i, g, 110); p.set(4 + i, 4 + i, g, 70); }
    for (let i = 0; i < 3; i++) p.set(9 + i, 3 + i, g, 80);
  },
  snow: p => { grain(p, C.snow, 0.03, 0.04, 8); },
  snow_side: p => {
    grain(p, C.dirt, 0.14, 0.10, 4);
    for (let x = 0; x < p.s; x++) {
      const h = 4 + Math.round(p.vn(x, 0, 8) * 2);
      for (let y = 0; y < h; y++) p.set(x, y, shade(C.snow, 0.96 + p.rnd() * 0.08));
    }
  },
  ice: p => {
    grain(p, C.ice, 0.08, 0.05, 4);
    for (let i = 0; i < p.s * p.s; i++) p.d[i * 4 + 3] = 205;
    for (let i = 0; i < 4; i++) {
      let x = (p.rnd() * 16) | 0, y = (p.rnd() * 16) | 0;
      for (let k = 0; k < 7; k++) { p.set(x, y, shade(C.ice, 1.16), 225); x += (p.rnd() * 3 | 0) - 1; y += (p.rnd() * 3 | 0) - 1; }
    }
  },
  cactus_top: p => { grain(p, shade(C.cactus, 1.1), 0.08, 0.06, 4); blobs(p, 1, shade(C.cactus, 0.8), 3.4, 0.06); },
  cactus_side: p => {
    grain(p, C.cactus, 0.08, 0.06, 4);
    for (let y = 0; y < p.s; y++) { p.set(0, y, shade(C.cactus, 0.68)); p.set(15, y, shade(C.cactus, 0.68)); }
    for (let i = 0; i < 8; i++) { const x = 2 + ((p.rnd() * 12) | 0), y = (p.rnd() * 16) | 0; p.set(x, y, [226, 226, 200]); }
  },
  obsidian: p => {
    grain(p, C.obsidian, 0.22, 0.10, 4);
    for (let i = 0; i < 7; i++) p.set((p.rnd() * 16) | 0, (p.rnd() * 16) | 0, [150, 120, 200]);
  },
  bedrock: p => { grain(p, C.bedrock, 0.20, 0.14, 4); blobs(p, 10, shade(C.bedrock, 0.5), 1.6, 0.15); },
  glowstone: p => {
    grain(p, C.glow, 0.10, 0.08, 4);
    blobs(p, 7, [255, 236, 176], 1.6, 0.06);
    for (let i = 0; i < 10; i++) p.set((p.rnd() * 16) | 0, (p.rnd() * 16) | 0, [255, 250, 220]);
  },
  water: p => {
    grain(p, C.water, 0.05, 0.015, 8);
    for (let i = 0; i < p.s * p.s; i++) p.d[i * 4 + 3] = 190;
  },
  lava: p => {
    grain(p, C.lava, 0.20, 0.08, 4);
    blobs(p, 5, [255, 196, 72], 1.8, 0.08);
    blobs(p, 4, [140, 40, 16], 1.4, 0.08);
  },
  coal_ore: p => { GEN.stone(p); blobs(p, 4, C.coal, 1.7, 0.18); },
  iron_ore: p => { GEN.stone(p); blobs(p, 4, C.iron, 1.6, 0.14); },
  gold_ore: p => { GEN.stone(p); blobs(p, 4, C.gold, 1.5, 0.14); },
  diamond_ore: p => { GEN.stone(p); blobs(p, 4, C.diamond, 1.4, 0.14); },
  tallgrass: p => crossPlant(p, [{ col: C.grass, n: 7, h: 11, base: 15 }]),
  flower_yellow: p => flowerTex(p, [244, 206, 66], [150, 106, 32]),
  flower_red: p => flowerTex(p, [206, 64, 54], [250, 232, 146]),
  deadbush: p => crossPlant(p, [{ col: [124, 96, 52], n: 5, h: 9, base: 14 }]),
};

function leafTex(p, col) {
  p.clear();
  for (let y = 0; y < p.s; y++) for (let x = 0; x < p.s; x++) {
    const n = p.vn(x, y, 4), j = (p.rnd() - 0.5) * 0.34;
    if (p.rnd() < 0.075) continue;                      // see-through gaps
    p.set(x, y, shade(col, 0.74 + n * 0.5 + j), 255);
  }
  // a few dark twigs so the canopy does not read flat
  for (let i = 0; i < 3; i++) {
    let x = (p.rnd() * 16) | 0, y = (p.rnd() * 16) | 0;
    for (let k = 0; k < 5; k++) { p.set(x, y, shade(col, 0.5), 255); x += (p.rnd() * 3 | 0) - 1; y += (p.rnd() * 3 | 0) - 1; }
  }
}

function crossPlant(p, blades) {
  p.clear();
  for (const b of blades) {
    for (let i = 0; i < b.n; i++) {
      let x = 2 + ((p.rnd() * 12) | 0);
      const h = (b.h * (0.55 + p.rnd() * 0.45)) | 0;
      for (let k = 0; k < h; k++) {
        const y = b.base - k;
        p.set(x, y, shade(b.col, 0.72 + (k / h) * 0.5 + (p.rnd() - 0.5) * 0.2), 255);
        if (k > h * 0.5 && p.rnd() < 0.35) x += p.rnd() < 0.5 ? -1 : 1;
      }
    }
  }
}

function flowerTex(p, petal, core) {
  crossPlant(p, [{ col: shade(C.grass, 0.90), n: 3, h: 10, base: 15 }]);
  // dua daun kecil di batang
  p.set(5, 10, shade(C.grass, 0.78), 255);
  p.set(9, 12, shade(C.grass, 0.78), 255);
  // 5x5 blossom with the corners trimmed
  const cx = 7, cy = 5, R = 2;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (Math.abs(dx) === R && Math.abs(dy) === R) continue;
    p.set(cx + dx, cy + dy, shade(petal, 0.84 + p.rnd() * 0.30), 255);
  }
  p.set(cx, cy, core, 255);
  p.set(cx - 1, cy, shade(core, 0.88), 255);
  p.set(cx, cy - 1, shade(core, 0.94), 255);
  p.set(cx - 1, cy - 1, shade(core, 0.82), 255);
}

/** Build the DataArrayTexture holding every layer. */
function buildBlockTextures(renderer) {
  const n = TEX.length, sz = TILE;
  const data = new Uint8Array(sz * sz * 4 * n);
  for (let i = 0; i < n; i++) {
    const name = TEX[i];
    const p = new Pix(sz, 0x9E37 + i * 7919);
    const g = GEN[name];
    if (g) g(p); else grain(p, [200, 60, 200], 0.2, 0.1, 4);   // magenta = a layer nobody registered
    data.set(p.d, i * sz * sz * 4);
  }
  const tex = new THREE.DataArrayTexture(data, sz, sz, n);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

/** Average colour of a layer, used for particles and UI swatches. */
const TEX_AVG = [];
function computeTexAverages() {
  for (let i = 0; i < TEX.length; i++) {
    const p = new Pix(TILE, 0x9E37 + i * 7919);
    const g = GEN[TEX[i]]; if (g) g(p);
    let r = 0, gg = 0, b = 0, c = 0;
    for (let k = 0; k < TILE * TILE; k++) {
      if (p.d[k * 4 + 3] < 40) continue;
      r += p.d[k * 4]; gg += p.d[k * 4 + 1]; b += p.d[k * 4 + 2]; c++;
    }
    c = c || 1;
    TEX_AVG[i] = [Math.round(r / c), Math.round(gg / c), Math.round(b / c)];
  }
}
