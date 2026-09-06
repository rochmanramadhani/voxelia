'use strict';
/* The voxel world: chunks, terrain generation, biomes, structures, player edits. */

const CH = 16;            // chunk width
const WH = 128;           // world height
const SEA = 44;           // sea level
const CH2 = CH * CH;      // 256
const IDX = (x, y, z) => (y << 8) | (z << 4) | x;   // y*256 + z*16 + x

const BIOMES = {
  ocean:    { key: 'ocean',     top: 7,  fill: 7,  tree: 0,        plant: 0 },
  beach:    { key: 'beach',     top: 7,  fill: 9,  tree: 0,        plant: 0.004 },
  desert:   { key: 'desert',    top: 7,  fill: 9,  tree: 'cactus', treeD: 0.010, plant: 0.010, plantSet: [35] },
  redDesert:{ key: 'redDesert', top: 8,  fill: 9,  tree: 'cactus', treeD: 0.014, plant: 0.012, plantSet: [35] },
  savanna:  { key: 'savanna',   top: 1,  fill: 2,  tree: 'oak',    treeD: 0.004, plant: 0.10,  plantSet: [32, 32, 33] },
  plains:   { key: 'plains',    top: 1,  fill: 2,  tree: 'oak',    treeD: 0.006, plant: 0.16,  plantSet: [32, 32, 32, 33, 34] },
  forest:   { key: 'forest',    top: 1,  fill: 2,  tree: 'forest', treeD: 0.062, plant: 0.20,  plantSet: [32, 32, 33, 34] },
  taiga:    { key: 'taiga',     top: 1,  fill: 2,  tree: 'pine',   treeD: 0.048, plant: 0.10,  plantSet: [32] },
  swamp:    { key: 'swamp',     top: 1,  fill: 11, tree: 'oak',    treeD: 0.020, plant: 0.22,  plantSet: [32, 32, 32] },
  tundra:   { key: 'tundra',    top: 20, fill: 2,  tree: 'pine',   treeD: 0.010, plant: 0.02,  plantSet: [35] },
  mountain: { key: 'mountain',  top: 3,  fill: 3,  tree: 'pine',   treeD: 0.006, plant: 0.02,  plantSet: [32] },
  peak:     { key: 'peak',      top: 20, fill: 3,  tree: 0,        plant: 0 }
};
/** Localised biome name / subtitle. */
const biomeName = b => t('biome.' + b.key);
const biomeSub = b => t('biome.' + b.key + '.sub');
const BIOME_KEYS = Object.keys(BIOMES);

class World {
  constructor(seed) {
    this.seed = seed;
    this.n = {
      cont: new Perlin(seed ^ 0x1a2b), hill: new Perlin(seed ^ 0x33cd), mount: new Perlin(seed ^ 0x77ef),
      temp: new Perlin(seed ^ 0xbe11), humid: new Perlin(seed ^ 0x5eed), cave: new Perlin(seed ^ 0xca7e),
      cave2: new Perlin(seed ^ 0x9a1f), ore: new Perlin(seed ^ 0x0e3d), rough: new Perlin(seed ^ 0x4411)
    };
    this.chunks = new Map();
    this.edits = new Map();        // "cx,cz" -> Map("x,y,z" -> id)
    this._lastKey = null; this._lastChunk = null;
    this._hCache = new Map();
  }

  /* ---------- pure terrain functions (no chunk needed) ---------- */
  heightAt(x, z) {
    const k = (x + 1048576) * 2097152 + (z + 1048576);
    const c = this._hCache.get(k);
    if (c !== undefined) return c;
    const n = this.n;
    const cont = n.cont.fbm2(x * 0.0011, z * 0.0011, 4);
    const land = clamp((cont + 0.15) / 0.40, 0, 1);
    const hills = n.hill.fbm2(x * 0.0060, z * 0.0060, 4);
    const rough = n.rough.fbm2(x * 0.022, z * 0.022, 2);
    const ridge = n.mount.ridged2(x * 0.0022, z * 0.0022, 4);
    const mMask = clamp((ridge - 0.18) / 0.55, 0, 1) * land * land;
    let h = 30 + land * 22 + hills * 7 * land + rough * 1.6 * land;
    h += mMask * 48;
    h = Math.round(h);
    h = clamp(h, 4, WH - 12);
    if (this._hCache.size > 400000) this._hCache.clear();
    this._hCache.set(k, h);
    return h;
  }
  climateAt(x, z) {
    return {
      t: this.n.temp.fbm2(x * 0.0013 + 91.3, z * 0.0013 - 40.7, 3),
      h: this.n.humid.fbm2(x * 0.0017 - 220.1, z * 0.0017 + 63.9, 3)
    };
  }
  biomeAt(x, z, hIn) {
    const h = hIn === undefined ? this.heightAt(x, z) : hIn;
    if (h < SEA - 2) return BIOMES.ocean;
    if (h <= SEA + 1) return BIOMES.beach;
    const { t, h: hum } = this.climateAt(x, z);
    if (h > 84) return t < -0.05 || h > 92 ? BIOMES.peak : BIOMES.mountain;
    if (h > 72) return t < -0.15 ? BIOMES.peak : BIOMES.mountain;
    if (t < -0.30) return BIOMES.tundra;
    if (t > 0.30 && hum < -0.05) return t > 0.52 && hum < -0.28 ? BIOMES.redDesert : BIOMES.desert;
    if (t > 0.22 && hum < 0.14) return BIOMES.savanna;
    if (hum > 0.34 && h <= SEA + 4) return BIOMES.swamp;
    if (t < -0.05 && hum > 0.02) return BIOMES.taiga;
    if (hum > 0.16) return BIOMES.forest;
    return BIOMES.plains;
  }

  /* ---------- block access ---------- */
  chunkAt(cx, cz, create) {
    const key = cx + ',' + cz;
    if (this._lastKey === key) return this._lastChunk;
    let c = this.chunks.get(key);
    if (!c && create) { c = new Chunk(cx, cz); this.chunks.set(key, c); }
    if (c) { this._lastKey = key; this._lastChunk = c; }
    return c;
  }
  getBlock(x, y, z) {
    if (y < 0 || y >= WH) return 0;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunkAt(cx, cz, false);
    if (!c || !c.ready) return -1;                    // -1 = not generated yet
    return c.blocks[IDX(x - (cx << 4), y, z - (cz << 4))];
  }
  getBlockSafe(x, y, z) { const b = this.getBlock(x, y, z); return b < 0 ? 0 : b; }
  setBlock(x, y, z, id, record = true) {
    if (y < 0 || y >= WH) return false;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunkAt(cx, cz, false);
    if (!c || !c.ready) return false;
    const lx = x - (cx << 4), lz = z - (cz << 4);
    const i = IDX(lx, y, z - (cz << 4));
    if (c.blocks[i] === id) return false;
    c.blocks[i] = id;
    c.recalcColumn(lx, lz);
    if (record) {
      const ck = cx + ',' + cz;
      let m = this.edits.get(ck);
      if (!m) { m = new Map(); this.edits.set(ck, m); }
      m.set(x + ',' + y + ',' + z, id);
    }
    c.dirty = true;
    // a block on the border also dirties the neighbouring chunk
    if (lx === 0) this.markDirty(cx - 1, cz); if (lx === 15) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1); if (lz === 15) this.markDirty(cx, cz + 1);
    return true;
  }
  markDirty(cx, cz) { const c = this.chunks.get(cx + ',' + cz); if (c && c.ready) c.dirty = true; }
  topAt(x, z) {
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunkAt(cx, cz, false);
    if (!c || !c.ready) return SEA;
    return c.top[((z - (cz << 4)) << 4) | (x - (cx << 4))];
  }

  /* ---------- generation ---------- */
  generate(chunk) {
    const { cx, cz } = chunk, b = chunk.blocks, n = this.n;
    const ox = cx << 4, oz = cz << 4;
    for (let lz = 0; lz < CH; lz++) {
      for (let lx = 0; lx < CH; lx++) {
        const wx = ox + lx, wz = oz + lz;
        const h = this.heightAt(wx, wz);
        const bio = this.biomeAt(wx, wz, h);
        const beachy = h <= SEA + 1 && h >= SEA - 3;
        for (let y = 0; y <= Math.max(h, SEA); y++) {
          let id = 0;
          if (y <= h) {
            if (y <= 1 + (hash2(wx, wz, y * 31) * 3 | 0)) id = 31;               // jagged bedrock
            else if (y === h) id = beachy && bio !== BIOMES.ocean ? 7 : bio.top;
            else if (y > h - 4) id = beachy ? 7 : bio.fill;
            else id = 3;
            // ores
            if (id === 3) {
              const o = n.ore.noise3(wx * 0.09, y * 0.09, wz * 0.09);
              if (y < 16 && o > 0.74) id = 27;
              else if (y < 30 && o > 0.70) id = 26;
              else if (y < 52 && o > 0.655) id = 25;
              else if (y < 68 && o > 0.62) id = 24;
              else if (o < -0.76) id = 10;
            }
            // caves
            if (y > 2 && y < h - 1) {
              const t1 = n.cave.fbm3(wx * 0.021, y * 0.038, wz * 0.021, 2);
              const t2 = n.cave2.fbm3(wx * 0.021 + 51.4, y * 0.038, wz * 0.021 - 17.2, 2);
              const cheese = n.cave.noise3(wx * 0.012, y * 0.026, wz * 0.012);
              const near = clamp((h - y) / 8, 0, 1);
              if ((Math.abs(t1) < 0.052 * near && Math.abs(t2) < 0.052 * near) || cheese > 0.70 + (1 - near) * 0.4) {
                id = y < 11 ? (y < 8 ? 30 : 0) : 0;
              }
            }
          } else if (y <= SEA) id = 29;                                          // sea and lake water
          b[IDX(lx, y, lz)] = id;
        }
        // a thin snow cap on peaks
        if (bio === BIOMES.peak && h > SEA) b[IDX(lx, h, lz)] = 20;
      }
    }
    chunk.ready = true;
    this.decorate(chunk);
    this.applyEdits(chunk);
    chunk.recalcAll();
  }

  /** Plants and trees. Scans a 3x3 chunk area so trees on a border stay whole. */
  decorate(chunk) {
    const { cx, cz } = chunk;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      this.structuresOf(cx + dx, cz + dz, chunk);
    }
    // grass and flowers are per-chunk only; they never cross a border
    const ox = cx << 4, oz = cz << 4, b = chunk.blocks;
    for (let lz = 0; lz < CH; lz++) for (let lx = 0; lx < CH; lx++) {
      const wx = ox + lx, wz = oz + lz, h = this.heightAt(wx, wz);
      if (h <= SEA) continue;
      const bio = this.biomeAt(wx, wz, h);
      if (!bio.plant) continue;
      const ground = b[IDX(lx, h, lz)];
      if (ground !== 1 && ground !== 7 && ground !== 8 && ground !== 20) continue;
      if (b[IDX(lx, h + 1, lz)] !== 0) continue;
      if (hash2(wx, wz, 771) < bio.plant) {
        const set = bio.plantSet || [32];
        b[IDX(lx, h + 1, lz)] = set[(hash2(wx, wz, 991) * set.length) | 0];
      }
    }
  }

  structuresOf(scx, scz, target) {
    const rnd = mulberry32((Math.imul(scx, 374761393) ^ Math.imul(scz, 668265263) ^ this.seed) | 0);
    const ox = scx << 4, oz = scz << 4;
    const tries = 14;
    for (let i = 0; i < tries; i++) {
      const lx = (rnd() * CH) | 0, lz = (rnd() * CH) | 0;
      const wx = ox + lx, wz = oz + lz;
      const h = this.heightAt(wx, wz);
      if (h <= SEA + 1) continue;
      const bio = this.biomeAt(wx, wz, h);
      if (!bio.tree) continue;
      if (rnd() > bio.treeD * 16) continue;
      const kind = bio.tree === 'forest' ? (rnd() < 0.42 ? 'birch' : 'oak') : bio.tree;
      this.placeTree(target, wx, h + 1, wz, kind, rnd);
    }
  }

  placeTree(target, wx, wy, wz, kind, rnd) {
    const put = (x, y, z, id, soft) => {
      if (y < 0 || y >= WH) return;
      const cx = x >> 4, cz = z >> 4;
      if (cx !== target.cx || cz !== target.cz) return;
      const i = IDX(x - (cx << 4), y, z - (cz << 4));
      if (soft && target.blocks[i] !== 0) return;
      target.blocks[i] = id;
    };
    if (kind === 'cactus') {
      const hgt = 2 + ((rnd() * 3) | 0);
      for (let k = 0; k < hgt; k++) put(wx, wy + k, wz, 22);
      return;
    }
    if (kind === 'pine') {
      const trunk = 7 + ((rnd() * 5) | 0);
      for (let k = 0; k < trunk; k++) put(wx, wy + k, wz, 12);
      let r = 3;
      for (let y = wy + 3; y <= wy + trunk + 1; y++) {
        const rr = Math.max(0, r * (1 - (y - wy - 3) / (trunk - 1)) + ((y & 1) ? 0 : 0.5));
        const ri = Math.round(rr);
        for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
          if (dx * dx + dz * dz > ri * ri + 1) continue;
          if (dx === 0 && dz === 0 && y <= wy + trunk - 1) continue;
          put(wx + dx, y, wz + dz, 16, true);
        }
      }
      put(wx, wy + trunk + 1, wz, 16, true);
      return;
    }
    const birch = kind === 'birch';
    const log = birch ? 14 : 12, leaf = birch ? 15 : 13;
    const trunk = (birch ? 6 : 4) + ((rnd() * 3) | 0);
    for (let k = 0; k < trunk; k++) put(wx, wy + k, wz, log);
    const top = wy + trunk;
    for (let dy = -2; dy <= 1; dy++) {
      const ri = dy <= -1 ? 2 : (dy === 0 ? 2 : 1);
      for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
        if (Math.abs(dx) === ri && Math.abs(dz) === ri && (dy > -1 || rnd() < 0.6)) continue;
        if (dx === 0 && dz === 0 && dy < 1) continue;
        put(wx + dx, top + dy, wz + dz, leaf, true);
      }
    }
    put(wx, top + 1, wz, leaf, true);
  }

  applyEdits(chunk) {
    const m = this.edits.get(chunk.cx + ',' + chunk.cz);
    if (!m) return;
    const ox = chunk.cx << 4, oz = chunk.cz << 4;
    for (const [k, id] of m) {
      const p = k.split(',');
      chunk.blocks[IDX((+p[0]) - ox, +p[1], (+p[2]) - oz)] = id;
    }
  }

  /** Every edit as a flat [x,y,z,id,...] array, ready to save. */
  exportEdits() {
    const out = [];
    for (const m of this.edits.values())
      for (const [k, id] of m) { const p = k.split(','); out.push(+p[0], +p[1], +p[2], id); }
    return out;
  }
  importEdits(arr) {
    this.edits.clear();
    for (let i = 0; i + 3 < arr.length; i += 4) {
      const x = arr[i], y = arr[i + 1], z = arr[i + 2], id = arr[i + 3];
      const ck = (x >> 4) + ',' + (z >> 4);
      let m = this.edits.get(ck);
      if (!m) { m = new Map(); this.edits.set(ck, m); }
      m.set(x + ',' + y + ',' + z, id);
    }
  }
  editCount() { let n = 0; for (const m of this.edits.values()) n += m.size; return n; }

  /** Copy a chunk plus its neighbour edges into an 18x128x18 padded buffer for the mesher. */
  fillPadded(cx, cz, out, tops) {
    const P = CH + 2;
    out.fill(0);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = this.chunks.get((cx + dx) + ',' + (cz + dz));
      const x0 = dx === -1 ? CH - 1 : 0, x1 = dx === 1 ? 1 : CH;
      const z0 = dz === -1 ? CH - 1 : 0, z1 = dz === 1 ? 1 : CH;
      for (let lz = z0; lz < z1; lz++) {
        const pz = dz * CH + lz + 1;
        if (pz < 0 || pz >= P) continue;
        for (let lx = x0; lx < x1; lx++) {
          const px = dx * CH + lx + 1;
          if (px < 0 || px >= P) continue;
          if (!c || !c.ready) {
            // neighbour missing: treat it as solid so the seam does not turn into a wall
            for (let y = 0; y < WH; y++) out[(y * P + pz) * P + px] = 3;
            tops[pz * P + px] = WH;
            continue;
          }
          tops[pz * P + px] = c.top[(lz << 4) | lx];
          for (let y = 0; y < WH; y++) out[(y * P + pz) * P + px] = c.blocks[IDX(lx, y, lz)];
        }
      }
    }
  }
}

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint8Array(CH * WH * CH);
    this.top = new Int16Array(CH2);        // highest opaque block y, drives skylight
    this.ready = false; this.dirty = true;
    this.mesh = null; this.meshT = null;
    this.minY = 0; this.maxY = WH - 1;
  }
  recalcColumn(lx, lz) {
    let t = 0;
    for (let y = WH - 1; y >= 0; y--) {
      const id = this.blocks[IDX(lx, y, lz)];
      if (id && IS_SHADE[id]) { t = y; break; }
    }
    this.top[(lz << 4) | lx] = t;
  }
  recalcAll() {
    let lo = WH, hi = 0;
    for (let lz = 0; lz < CH; lz++) for (let lx = 0; lx < CH; lx++) {
      this.recalcColumn(lx, lz);
    }
    for (let y = 0; y < WH; y++) {
      let any = false;
      for (let i = 0; i < CH2; i++) if (this.blocks[(y << 8) | i]) { any = true; break; }
      if (any) { if (y < lo) lo = y; if (y > hi) hi = y; }
    }
    this.minY = Math.max(0, lo - 1); this.maxY = Math.min(WH - 1, hi + 1);
  }
  dispose() {
    if (this.mesh) { this.mesh.geometry.dispose(); this.mesh = null; }
    if (this.meshT) { this.meshT.geometry.dispose(); this.meshT = null; }
  }
}
