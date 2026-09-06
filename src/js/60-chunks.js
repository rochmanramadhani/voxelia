'use strict';
/* Chunk manager: loads, meshes and evicts chunks under a per-frame time budget
   so generating the world never tanks the frame rate. */

function scanChunkLights(chunk) {
  const out = [];
  const ox = chunk.cx << 4, oz = chunk.cz << 4;
  for (let y = 0; y < WH && out.length < 40; y++) {
    for (let i = 0; i < CH2; i++) {
      const id = chunk.blocks[(y << 8) | i];
      if (!id || !LIGHT_EMIT[id]) continue;
      if (id === 30) {                                  // lava: only where it is exposed
        const above = chunk.blocks[((y + 1) << 8) | i];
        if (above !== 0) continue;
      }
      out.push(ox + (i & 15), y, oz + (i >> 4));
      if (out.length >= 40) break;
    }
  }
  chunk.lights = out;
}

class ChunkManager {
  constructor(world, scene, matSolid, matLiquid) {
    this.world = world; this.scene = scene;
    this.matSolid = matSolid; this.matLiquid = matLiquid;
    this.dist = 6;
    this.offsets = null; this._offDist = -1;
    this.stats = { chunks: 0, meshes: 0, tris: 0, pending: 0 };
    this.onProgress = null;
  }
  setDistance(d) { this.dist = d; }
  buildOffsets(d) {
    const o = [];
    for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) {
      const r = Math.hypot(dx, dz);
      if (r <= d + 0.5) o.push({ dx, dz, r });
    }
    o.sort((a, b) => a.r - b.r);
    this.offsets = o; this._offDist = d;
  }
  neighborsReady(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = this.world.chunks.get((cx + dx) + ',' + (cz + dz));
      if (!c || !c.ready) return false;
    }
    return true;
  }
  ensure(cx, cz) {
    let c = this.world.chunks.get(cx + ',' + cz);
    if (c && c.ready) return c;
    if (!c) { c = new Chunk(cx, cz); this.world.chunks.set(cx + ',' + cz, c); }
    this.world.generate(c);
    scanChunkLights(c);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.world.chunks.get((cx + dx) + ',' + (cz + dz));
      if (n && n.ready) n.dirty = true;
    }
    return c;
  }
  buildMesh(chunk) {
    const r = meshChunk(this.world, chunk);
    if (chunk.mesh) { this.scene.remove(chunk.mesh); chunk.mesh.geometry.dispose(); chunk.mesh = null; }
    if (chunk.meshT) { this.scene.remove(chunk.meshT); chunk.meshT.geometry.dispose(); chunk.meshT = null; }
    const ox = chunk.cx << 4, oz = chunk.cz << 4;
    if (r.solid) {
      const m = new THREE.Mesh(r.solid, this.matSolid);
      m.position.set(ox, 0, oz); m.renderOrder = 0;
      chunk.mesh = m; this.scene.add(m);
    }
    if (r.liquid) {
      const m = new THREE.Mesh(r.liquid, this.matLiquid);
      m.position.set(ox, 0, oz); m.renderOrder = 5;
      chunk.meshT = m; this.scene.add(m);
    }
    chunk.tris = r.tris;
    chunk.dirty = false;
  }
  /** Do as much work as fits in `budget` milliseconds. */
  update(px, pz, budget = 8) {
    const d = this.dist;
    if (this._offDist !== d) this.buildOffsets(d);
    const ccx = Math.floor(px / CH), ccz = Math.floor(pz / CH);
    const t0 = performance.now();
    let pending = 0, done = 0;

    for (const o of this.offsets) {
      const cx = ccx + o.dx, cz = ccz + o.dz;
      const key = cx + ',' + cz;
      let c = this.world.chunks.get(key);
      if (!c || !c.ready) {
        pending++;
        if (performance.now() - t0 < budget) { this.ensure(cx, cz); done++; }
        continue;
      }
      if (c.dirty) {
        if (!this.neighborsReady(cx, cz)) {
          // generate the neighbours first so border AO comes out right
          pending++;
          if (performance.now() - t0 < budget) {
            for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
              const n = this.world.chunks.get((cx + dx) + ',' + (cz + dz));
              if ((!n || !n.ready) && performance.now() - t0 < budget) this.ensure(cx + dx, cz + dz);
            }
          }
          continue;
        }
        pending++;
        if (performance.now() - t0 < budget) { this.buildMesh(c); done++; }
      }
    }

    // evict anything far away
    const lim = d + 2;
    for (const [key, c] of this.world.chunks) {
      if (Math.abs(c.cx - ccx) > lim || Math.abs(c.cz - ccz) > lim) {
        if (c.mesh) this.scene.remove(c.mesh);
        if (c.meshT) this.scene.remove(c.meshT);
        c.dispose();
        this.world.chunks.delete(key);
        if (this.world._lastKey === key) { this.world._lastKey = null; this.world._lastChunk = null; }
      }
    }

    let meshes = 0, tris = 0;
    for (const c of this.world.chunks.values()) {
      if (c.mesh) { meshes++; tris += c.tris || 0; }
      if (c.meshT) meshes++;
    }
    this.stats = { chunks: this.world.chunks.size, meshes, tris, pending };
    return pending;
  }
  /** Collect the nearest light sources for the shader. */
  collectLights(px, py, pz, out, max) {
    const ccx = Math.floor(px / CH), ccz = Math.floor(pz / CH);
    const cand = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const c = this.world.chunks.get((ccx + dx) + ',' + (ccz + dz));
      if (!c || !c.lights) continue;
      const L = c.lights;
      for (let i = 0; i < L.length; i += 3) {
        const x = L[i] + 0.5, y = L[i + 1] + 0.5, z = L[i + 2] + 0.5;
        const dd = (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2;
        if (dd < 18 * 18) cand.push([dd, x, y, z]);
      }
    }
    cand.sort((a, b) => a[0] - b[0]);
    const n = Math.min(max, cand.length);
    for (let i = 0; i < n; i++) out[i].set(cand[i][1], cand[i][2], cand[i][3], 13);
    for (let i = n; i < max; i++) out[i].set(0, -9999, 0, 1);
    return n;
  }
  clear() {
    for (const c of this.world.chunks.values()) {
      if (c.mesh) this.scene.remove(c.mesh);
      if (c.meshT) this.scene.remove(c.meshT);
      c.dispose();
    }
    this.world.chunks.clear();
    this.world._lastKey = null; this.world._lastChunk = null;
  }
}
