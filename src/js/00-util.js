'use strict';
/* Utilities: deterministic PRNG, Perlin noise, small maths helpers. */

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Any seed text -> 32-bit integer. A plain number is used as-is. */
function seedToInt(str) {
  str = String(str).trim();
  if (/^-?\d+$/.test(str)) return (parseInt(str, 10) | 0) || 1;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h | 0) || 1;
}

/** 2D/3D Perlin gradient noise with a seeded permutation table. */
class Perlin {
  constructor(seed) {
    const rnd = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }
  grad2(hash, x, y) {
    switch (hash & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  }
  noise2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y), p = this.perm;
    const A = p[X] + Y, B = p[X + 1] + Y;
    return lerp(
      lerp(this.grad2(p[A], x, y), this.grad2(p[B], x - 1, y), u),
      lerp(this.grad2(p[A + 1], x, y - 1), this.grad2(p[B + 1], x - 1, y - 1), u), v);
  }
  grad3(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }
  noise3(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z), p = this.perm;
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(lerp(
      lerp(this.grad3(p[AA], x, y, z), this.grad3(p[BA], x - 1, y, z), u),
      lerp(this.grad3(p[AB], x, y - 1, z), this.grad3(p[BB], x - 1, y - 1, z), u), v),
      lerp(
        lerp(this.grad3(p[AA + 1], x, y, z - 1), this.grad3(p[BA + 1], x - 1, y, z - 1), u),
        lerp(this.grad3(p[AB + 1], x, y - 1, z - 1), this.grad3(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  }
  /** 2D fractional Brownian motion */
  fbm2(x, y, oct, lac = 2.0, gain = 0.5) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let i = 0; i < oct; i++) { s += a * this.noise2(x * f, y * f); norm += a; a *= gain; f *= lac; }
    return s / norm;
  }
  fbm3(x, y, z, oct, lac = 2.0, gain = 0.5) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let i = 0; i < oct; i++) { s += a * this.noise3(x * f, y * f, z * f); norm += a; a *= gain; f *= lac; }
    return s / norm;
  }
  /** Ridged noise: good for mountain ridges and cave tunnels. */
  ridged2(x, y, oct, lac = 2.0, gain = 0.5) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += a * (1 - Math.abs(this.noise2(x * f, y * f)) * 2);
      norm += a; a *= gain; f *= lac;
    }
    return s / norm;
  }
}

/** Deterministic 2D hash -> [0,1), for per-block tree and grass placement. */
function hash2(x, z, salt) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fmt = (n, d = 1) => n.toFixed(d);
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
