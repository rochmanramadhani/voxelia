'use strict';
/* Explored-terrain map.

   Rather than rendering the world a second time from an overhead camera, each
   chunk is painted once into a 16x16 tile: one pixel per column, coloured by the
   average colour of the topmost block's texture and shaded by slope and height.
   Tiles are cached independently of the chunks they came from, so the map keeps
   everything you have walked past even after those chunks are evicted. */

const MAP_MAX_TILES = 2048;
const MAP_BUILDS_PER_DRAW = 24;      // keeps a first pan over new ground smooth

const WorldMap = {
  tiles: new Map(),                  // "cx,cz" -> HTMLCanvasElement (16x16)
  order: [],                         // insertion order, for eviction

  key(cx, cz) { return cx + ',' + cz; },

  invalidate(cx, cz) { this.tiles.delete(this.key(cx, cz)); },
  clear() { this.tiles.clear(); this.order.length = 0; },

  store(key, cv) {
    if (!this.tiles.has(key)) {
      this.order.push(key);
      while (this.order.length > MAP_MAX_TILES) {
        const old = this.order.shift();
        if (old !== key) this.tiles.delete(old);
      }
    }
    this.tiles.set(key, cv);
  },

  /** Paint one chunk into a tile. Returns the canvas. */
  build(world, chunk) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = CH;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(CH, CH);
    const d = img.data;
    const water = TEX_AVG[T.water] || [46, 108, 176];

    for (let lz = 0; lz < CH; lz++) {
      for (let lx = 0; lx < CH; lx++) {
        const h = chunk.top[(lz << 4) | lx];
        let r, g, b, surface = h;

        if (h < SEA) {
          // open water: darken with depth so shelves and trenches read apart
          const depth = clamp((SEA - h) / 15, 0, 1);
          r = water[0] * (1 - depth * 0.55);
          g = water[1] * (1 - depth * 0.48);
          b = water[2] * (1 - depth * 0.30);
          surface = SEA;
        } else {
          const id = chunk.blocks[IDX(lx, h, lz)];
          const B = BLOCKS[id];
          const c = (B && TEX_AVG[B.top]) || [124, 124, 124];
          r = c[0]; g = c[1]; b = c[2];
        }

        // relief: compare against the column to the north
        const hn = lz > 0 ? chunk.top[((lz - 1) << 4) | lx] : h;
        const slope = clamp((h - hn) * 0.14, -0.30, 0.30);
        const lift = 0.74 + 0.26 * clamp((surface - SEA) / 40, -0.7, 1) + slope;

        const i = ((lz * CH) + lx) * 4;
        d[i] = clamp(r * lift, 0, 255);
        d[i + 1] = clamp(g * lift, 0, 255);
        d[i + 2] = clamp(b * lift, 0, 255);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.store(this.key(chunk.cx, chunk.cz), cv);
    return cv;
  },

  /** Draw the map centred on world (cx, cz). `px` = screen pixels per block. */
  draw(ctx, world, w, h, centreX, centreZ, px, opts) {
    opts = opts || {};
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = opts.background || '#0a0d12';
    ctx.fillRect(0, 0, w, h);

    const span = CH * px;
    const halfW = w / 2, halfH = h / 2;
    const cx0 = Math.floor((centreX - halfW / px) / CH);
    const cx1 = Math.floor((centreX + halfW / px) / CH);
    const cz0 = Math.floor((centreZ - halfH / px) / CH);
    const cz1 = Math.floor((centreZ + halfH / px) / CH);

    let built = 0;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = this.key(cx, cz);
        let tile = this.tiles.get(key);
        if (!tile && built < MAP_BUILDS_PER_DRAW) {
          const chunk = world.chunks.get(key);
          if (chunk && chunk.ready) { tile = this.build(world, chunk); built++; }
        }
        if (!tile) continue;
        const sx = Math.round(halfW + (cx * CH - centreX) * px);
        const sy = Math.round(halfH + (cz * CH - centreZ) * px);
        ctx.drawImage(tile, sx, sy, Math.ceil(span), Math.ceil(span));
      }
    }
  },

  /** A marker at world (x, z), drawn relative to the same centre as draw(). */
  markerPos(w, h, centreX, centreZ, px, x, z) {
    return [w / 2 + (x - centreX) * px, h / 2 + (z - centreZ) * px];
  },

  /** The player arrow. yaw 0 points north (-Z), which is up on the map. */
  drawPlayer(ctx, x, y, yaw, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.68, size * 0.78);
    ctx.lineTo(0, size * 0.34);
    ctx.lineTo(-size * 0.68, size * 0.78);
    ctx.closePath();
    ctx.fillStyle = '#f0a53c';
    ctx.strokeStyle = '#0a0d12';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  },

  drawSpawn(ctx, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#4fbfa8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.moveTo(-size * 1.7, 0); ctx.lineTo(size * 1.7, 0);
    ctx.moveTo(0, -size * 1.7); ctx.lineTo(0, size * 1.7);
    ctx.stroke();
    ctx.restore();
  },

  count() { return this.tiles.size; }
};
