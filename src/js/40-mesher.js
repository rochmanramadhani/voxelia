'use strict';
/* Mesher: turns a chunk into geometry. Face culling, per-vertex ambient
   occlusion, and skylight derived from column height (a pure function, so
   chunks never disagree at their seams). Positions are packed as Uint16 at
   1/8 scale; everything else fits in 4 more bytes per vertex. */

const P = CH + 2;                              // 18
const pIdx = (x, y, z) => (y * P + z) * P + x;

/* The six cube faces. Corners wind counter-clockwise seen from outside. */
const RAW_FACES = [
  { n: [-1, 0, 0], c: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]], uv: [[0, 0], [0, 1], [1, 1], [1, 0]] }, // 0 -X
  { n: [1, 0, 0], c: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]], uv: [[0, 0], [0, 1], [1, 1], [1, 0]] }, // 1 +X
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] }, // 2 -Y
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] }, // 3 +Y
  { n: [0, 0, -1], c: [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] }, // 4 -Z
  { n: [0, 0, 1], c: [[1, 1, 1], [0, 1, 1], [0, 0, 1], [1, 0, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] }  // 5 +Z
];

/* Pre-compute the neighbour offsets each corner needs for ambient occlusion. */
const FACES = RAW_FACES.map(f => {
  const n = f.n;
  const axes = [];
  for (let a = 0; a < 3; a++) if (n[a] === 0) axes.push(a);
  const corners = f.c.map((c, i) => {
    const s1 = [0, 0, 0], s2 = [0, 0, 0], sc = [0, 0, 0];
    const a1 = axes[0], a2 = axes[1];
    const d1 = c[a1] ? 1 : -1, d2 = c[a2] ? 1 : -1;
    for (let a = 0; a < 3; a++) { s1[a] = n[a]; s2[a] = n[a]; sc[a] = n[a]; }
    s1[a1] += d1; s2[a2] += d2; sc[a1] += d1; sc[a2] += d2;
    return { pos: c, uv: f.uv[i], s1, s2, sc };
  });
  return { n, corners };
});

const AO_LEVEL = [0.54, 0.72, 0.88, 1.0];

/* Scratch buffers, reused across chunks. */
const MAXV = 200000;
const sPos = new Uint16Array(MAXV * 3);
const sDat = new Uint8Array(MAXV * 4);
const sIdx = new Uint32Array(MAXV * 2);
const lPos = new Uint16Array(60000 * 3);
const lDat = new Uint8Array(60000 * 4);
const lIdx = new Uint32Array(90000);
const padded = new Uint8Array(P * WH * P);
const padTop = new Int16Array(P * P);

const LAVA_LAYER = T.lava;

function meshChunk(world, chunk) {
  world.fillPadded(chunk.cx, chunk.cz, padded, padTop);

  let vc = 0, ic = 0, lvc = 0, lic = 0;

  const opaqueAt = (x, y, z) => {
    if (y < 0 || y >= WH) return y < 0 ? 1 : 0;
    return IS_OPAQUE[padded[pIdx(x, y, z)]];
  };
  const skyAt = (x, y, z) => {
    const t = padTop[z * P + x];
    if (y > t) return 1.0;
    const v = 1 - (t - y) * 0.11;
    return v < 0.055 ? 0.055 : v;
  };

  const y0 = chunk.minY, y1 = chunk.maxY;

  for (let y = y0; y <= y1; y++) {
    for (let lz = 0; lz < CH; lz++) {
      const pz = lz + 1;
      for (let lx = 0; lx < CH; lx++) {
        const px = lx + 1;
        const id = padded[pIdx(px, y, pz)];
        if (id === 0) continue;
        const B = BLOCKS[id];
        if (!B) continue;

        /* ---- cross-shaped plants ---- */
        if (B.kind === K_CROSS) {
          if (vc + 8 > MAXV) continue;
          const layer = B.side;
          const lig = (skyAt(px, y, pz) * 255) | 0;
          const quads = [
            [[0, 0, 0], [1, 0, 1], [1, 1, 1], [0, 1, 0]],
            [[1, 0, 0], [0, 0, 1], [0, 1, 1], [1, 1, 0]]
          ];
          for (const q of quads) {
            const base = vc;
            for (let k = 0; k < 4; k++) {
              const c = q[k];
              sPos[vc * 3] = (lx + c[0]) * 8; sPos[vc * 3 + 1] = (y + c[1]) * 8; sPos[vc * 3 + 2] = (lz + c[2]) * 8;
              const u = (k === 1 || k === 2) ? 1 : 0, v = (k === 0 || k === 1) ? 1 : 0;
              sDat[vc * 4] = 236; sDat[vc * 4 + 1] = lig; sDat[vc * 4 + 2] = layer;
              sDat[vc * 4 + 3] = 6 | (u << 3) | (v << 4) | (c[1] ? 32 : 0);
              vc++;
            }
            sIdx[ic++] = base; sIdx[ic++] = base + 1; sIdx[ic++] = base + 2;
            sIdx[ic++] = base; sIdx[ic++] = base + 2; sIdx[ic++] = base + 3;
            sIdx[ic++] = base; sIdx[ic++] = base + 2; sIdx[ic++] = base + 1;
            sIdx[ic++] = base; sIdx[ic++] = base + 3; sIdx[ic++] = base + 2;
          }
          continue;
        }

        /* ---- fluids ---- */
        if (B.kind === K_LIQUID) {
          const above = padded[pIdx(px, y + 1, pz)];
          const topH = (above === id) ? 8 : 7;      // permukaan sedikit turun
          const isLava = id === 30;
          for (let f = 0; f < 6; f++) {
            const F = FACES[f], n = F.n;
            const nx = px + n[0], ny = y + n[1], nz = pz + n[2];
            const nb = (ny < 0 || ny >= WH) ? (ny < 0 ? 3 : 0) : padded[pIdx(nx, ny, nz)];
            if (nb === id) continue;
            if (nb !== 0 && IS_OPAQUE[nb]) continue;
            if (nb !== 0 && KIND[nb] === K_LIQUID) continue;
            if (lvc + 4 > 60000) continue;
            const lig = isLava ? 255 : (skyAt(nx, Math.max(0, Math.min(WH - 1, ny)), nz) * 255) | 0;
            const base = lvc;
            for (let k = 0; k < 4; k++) {
              const c = F.corners[k];
              const cy = c.pos[1] === 1 ? topH : 0;
              lPos[lvc * 3] = (lx + c.pos[0]) * 8;
              lPos[lvc * 3 + 1] = y * 8 + cy;
              lPos[lvc * 3 + 2] = (lz + c.pos[2]) * 8;
              lDat[lvc * 4] = 255; lDat[lvc * 4 + 1] = lig; lDat[lvc * 4 + 2] = B.side;
              lDat[lvc * 4 + 3] = f | (c.uv[0] << 3) | (c.uv[1] << 4) | ((f === 3 && !isLava) ? 32 : 0);
              lvc++;
            }
            lIdx[lic++] = base; lIdx[lic++] = base + 1; lIdx[lic++] = base + 2;
            lIdx[lic++] = base; lIdx[lic++] = base + 2; lIdx[lic++] = base + 3;
          }
          continue;
        }

        /* ---- ordinary cubes ---- */
        for (let f = 0; f < 6; f++) {
          const F = FACES[f], n = F.n;
          const nx = px + n[0], ny = y + n[1], nz = pz + n[2];
          let nb;
          if (ny < 0) nb = 3; else if (ny >= WH) nb = 0;
          else nb = padded[pIdx(nx, ny, nz)];
          if (nb === id) continue;                       // face between two of the same block
          if (nb !== 0 && IS_OPAQUE[nb]) continue;
          if (vc + 4 > MAXV) continue;

          const layer = f === 3 ? B.top : (f === 2 ? B.bottom : B.side);
          const base = vc;
          const aoq = [0, 0, 0, 0];
          for (let k = 0; k < 4; k++) {
            const c = F.corners[k];
            const s1 = opaqueAt(px + c.s1[0], y + c.s1[1], pz + c.s1[2]);
            const s2 = opaqueAt(px + c.s2[0], y + c.s2[1], pz + c.s2[2]);
            const sc = (s1 && s2) ? 1 : opaqueAt(px + c.sc[0], y + c.sc[1], pz + c.sc[2]);
            const ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + sc);
            aoq[k] = ao;

            // light: average the air cells touching this corner
            let sum = skyAt(nx, clamp(ny, 0, WH - 1), nz), cnt = 1;
            const add = (o) => {
              const ax = px + o[0], ay = y + o[1], az = pz + o[2];
              if (ay < 0 || ay >= WH) return;
              if (IS_OPAQUE[padded[pIdx(ax, ay, az)]]) return;
              sum += skyAt(ax, ay, az); cnt++;
            };
            add(c.s1); add(c.s2); add(c.sc);

            sPos[vc * 3] = (lx + c.pos[0]) * 8;
            sPos[vc * 3 + 1] = (y + c.pos[1]) * 8;
            sPos[vc * 3 + 2] = (lz + c.pos[2]) * 8;
            sDat[vc * 4] = (AO_LEVEL[ao] * 255) | 0;
            sDat[vc * 4 + 1] = ((sum / cnt) * 255) | 0;
            sDat[vc * 4 + 2] = layer;
            sDat[vc * 4 + 3] = f | (c.uv[0] << 3) | (c.uv[1] << 4);
            vc++;
          }
          // flip the quad's triangulation so the AO gradient does not twist
          if (aoq[0] + aoq[2] > aoq[1] + aoq[3]) {
            sIdx[ic++] = base; sIdx[ic++] = base + 1; sIdx[ic++] = base + 2;
            sIdx[ic++] = base; sIdx[ic++] = base + 2; sIdx[ic++] = base + 3;
          } else {
            sIdx[ic++] = base + 1; sIdx[ic++] = base + 2; sIdx[ic++] = base + 3;
            sIdx[ic++] = base + 1; sIdx[ic++] = base + 3; sIdx[ic++] = base;
          }
        }
      }
    }
  }

  return {
    solid: vc ? packGeom(sPos, sDat, sIdx, vc, ic) : null,
    liquid: lvc ? packGeom(lPos, lDat, lIdx, lvc, lic) : null,
    tris: (ic + lic) / 3
  };
}

function packGeom(pos, dat, idx, vc, ic) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('aPos', new THREE.BufferAttribute(pos.slice(0, vc * 3), 3));
  g.setAttribute('aData', new THREE.BufferAttribute(dat.slice(0, vc * 4), 4));
  g.setIndex(new THREE.BufferAttribute(idx.slice(0, ic), 1));
  // bounding sphere set by hand: this geometry has no `position` attribute
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CH / 2, WH / 2, CH / 2), Math.sqrt(8 * 8 + 64 * 64 + 8 * 8) + 1);
  return g;
}
