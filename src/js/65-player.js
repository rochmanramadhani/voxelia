'use strict';
/* Pemain: tabrakan AABB, gravitasi, renang, terbang, dan raycast voxel DDA. */

const PW = 0.62;        // lebar (setengahnya dipakai)
const PH = 1.78;        // tinggi
const EYE = 1.62;
const GRAV = 30;
const JUMP = 8.9;

class Player {
  constructor(world) {
    this.w = world;
    this.pos = new THREE.Vector3(0, 80, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.yawT = 0; this.pitchT = 0;      // sasaran arah pandang; yaw/pitch mengejarnya
    this.onGround = false;
    this.flying = false;
    this.inWater = false;
    this.eyeInWater = false;
    this.sprint = false;
    this.stepSmooth = 0;      // offset kamera untuk melembutkan naik-tangga
    this.walkPhase = 0;
    this.speedNow = 0;
    this.mode = 0;            // 0 = orang pertama, 1 = orang ketiga, 2 = depan
  }
  solidAt(x, y, z) {
    const id = this.w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    if (id <= 0) return false;
    return IS_SOLID[id] === 1;
  }
  collides(x, y, z) {
    const hw = PW / 2;
    const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw);
    const z0 = Math.floor(z - hw), z1 = Math.floor(z + hw);
    const y0 = Math.floor(y + 0.001), y1 = Math.floor(y + PH - 0.001);
    for (let yy = y0; yy <= y1; yy++)
      for (let zz = z0; zz <= z1; zz++)
        for (let xx = x0; xx <= x1; xx++) {
          const id = this.w.getBlock(xx, yy, zz);
          if (id > 0 && IS_SOLID[id]) return true;
        }
    return false;
  }
  liquidAt(x, y, z) {
    const id = this.w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    return id === 29 || id === 30 ? id : 0;
  }

  /** Set arah pandang sekaligus sasarannya (tanpa animasi kejar). */
  setLook(yaw, pitch) {
    this.yaw = this.yawT = yaw;
    this.pitch = this.pitchT = clamp(pitch, -1.553, 1.553);
  }

  update(dt, input) {
    const hw = PW / 2, eps = 1e-3;
    const p = this.pos;

    // ---- menoleh: tombol panah + pelembutan ----
    const turn = 2.0 * dt;
    if (input.lookL) this.yawT += turn;
    if (input.lookR) this.yawT -= turn;
    if (input.lookU) this.pitchT += turn * (S.invertY ? -1 : 1);
    if (input.lookD) this.pitchT -= turn * (S.invertY ? -1 : 1);
    this.pitchT = clamp(this.pitchT, -1.553, 1.553);
    const sm = clamp((S.lookSmooth || 0) / 100, 0, 1);
    if (sm <= 0.001) { this.yaw = this.yawT; this.pitch = this.pitchT; }
    else {
      const f = 1 - Math.exp(-lerp(110, 7, sm) * dt);
      this.yaw += (this.yawT - this.yaw) * f;
      this.pitch += (this.pitchT - this.pitch) * f;
    }

    this.inWater = !!this.liquidAt(p.x, p.y + 0.4, p.z);
    this.eyeInWater = !!this.liquidAt(p.x, p.y + EYE, p.z);

    // ---- arah gerak relatif yaw ----
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    let mx = 0, mz = 0;
    if (input.f) { mx -= sy; mz -= cy; }
    if (input.b) { mx += sy; mz += cy; }
    if (input.l) { mx -= cy; mz += sy; }
    if (input.r) { mx += cy; mz -= sy; }
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }

    const sprinting = input.sprint && ml > 0;
    this.sprint = sprinting;
    let speed;
    if (this.flying) speed = sprinting ? 26 : 11;
    else if (this.inWater) speed = sprinting ? 5.2 : 3.9;
    else speed = sprinting ? 7.4 : 4.5;

    // percepatan halus
    const accel = this.onGround || this.flying ? 22 : 8;
    const tx = mx * speed, tz = mz * speed;
    this.vel.x += (tx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (tz - this.vel.z) * Math.min(1, accel * dt);

    if (this.flying) {
      let vy = 0;
      if (input.up) vy += speed;
      if (input.down) vy -= speed;
      this.vel.y += (vy - this.vel.y) * Math.min(1, 18 * dt);
    } else if (this.inWater) {
      this.vel.y += (-GRAV * 0.22) * dt;
      if (input.up) this.vel.y = Math.min(this.vel.y + 26 * dt, 4.0);
      if (input.down) this.vel.y = Math.max(this.vel.y - 26 * dt, -4.0);
      this.vel.y *= Math.pow(0.06, dt);           // hambatan air
      this.vel.x *= Math.pow(0.30, dt);
      this.vel.z *= Math.pow(0.30, dt);
    } else {
      this.vel.y -= GRAV * dt;
      if (this.vel.y < -55) this.vel.y = -55;
      if (input.up && this.onGround) { this.vel.y = JUMP; this.onGround = false; }
    }

    // ---- integrasi dengan sub-langkah ----
    let remain = dt;
    while (remain > 0) {
      const step = Math.min(remain, 0.012);
      remain -= step;
      let dx = this.vel.x * step, dy = this.vel.y * step, dz = this.vel.z * step;

      // Y
      p.y += dy;
      if (this.collides(p.x, p.y, p.z)) {
        if (dy > 0) { p.y = Math.floor(p.y + PH) - PH - eps; this.vel.y = 0; }
        else { p.y = Math.floor(p.y) + 1 + eps; this.vel.y = 0; }
      }
      this.onGround = !this.flying && this.collides(p.x, p.y - 0.04, p.z);

      // X
      if (dx !== 0) {
        const oy = p.y;
        p.x += dx;
        if (this.collides(p.x, p.y, p.z)) {
          const stepUp = this.canStep(p.x, p.y, p.z);
          if (stepUp !== null) { this.stepSmooth += stepUp - p.y; p.y = stepUp; }
          else {
            p.x = dx > 0 ? Math.floor(p.x + hw) - hw - eps : Math.floor(p.x - hw) + 1 + hw + eps;
            this.vel.x = 0;
          }
        }
        if (p.y !== oy && this.collides(p.x, p.y, p.z)) { p.y = oy; p.x -= dx; this.vel.x = 0; }
      }
      // Z
      if (dz !== 0) {
        const oy = p.y;
        p.z += dz;
        if (this.collides(p.x, p.y, p.z)) {
          const stepUp = this.canStep(p.x, p.y, p.z);
          if (stepUp !== null) { this.stepSmooth += stepUp - p.y; p.y = stepUp; }
          else {
            p.z = dz > 0 ? Math.floor(p.z + hw) - hw - eps : Math.floor(p.z - hw) + 1 + hw + eps;
            this.vel.z = 0;
          }
        }
        if (p.y !== oy && this.collides(p.x, p.y, p.z)) { p.y = oy; p.z -= dz; this.vel.z = 0; }
      }
    }

    if (p.y < -8) { p.y = 90; this.vel.set(0, 0, 0); }
    this.stepSmooth *= Math.pow(0.0006, dt);
    if (Math.abs(this.stepSmooth) < 0.002) this.stepSmooth = 0;

    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speedNow = hs;
    this.walkPhase += hs * dt * 2.2;
  }

  /** Naik satu blok otomatis. Kembalikan y baru atau null. */
  canStep(x, y, z) {
    if (!S.autoStep) return null;
    if (!this.onGround && !this.inWater) return null;
    for (const up of [1.0, 0.5]) {
      const ny = Math.floor(y) + up;
      if (ny - y > 1.05) continue;
      if (!this.collides(x, ny + 0.02, z)) return ny + 0.02;
    }
    return null;
  }

  eyePos(out) {
    return out.set(this.pos.x, this.pos.y + EYE - this.stepSmooth, this.pos.z);
  }
  dirVec(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
}

/* ---------- raycast voxel (Amanatides & Woo) ---------- */
const _rc = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, id: 0, dist: 0 };
function raycastVoxel(world, ox, oy, oz, dx, dy, dz, maxD) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
  let tmx = (dx > 0 ? (x + 1 - ox) : (ox - x)) * tdx;
  let tmy = (dy > 0 ? (y + 1 - oy) : (oy - y)) * tdy;
  let tmz = (dz > 0 ? (z + 1 - oz) : (oz - z)) * tdz;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 300; i++) {
    const id = world.getBlock(x, y, z);
    if (id > 0 && id !== 29 && id !== 30) {
      _rc.x = x; _rc.y = y; _rc.z = z; _rc.nx = nx; _rc.ny = ny; _rc.nz = nz; _rc.id = id; _rc.dist = t;
      return _rc;
    }
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    if (t > maxD) return null;
  }
  return null;
}

/** Apakah AABB pemain menabrak sel blok ini? */
function boxHitsPlayer(px, py, pz, bx, by, bz) {
  const hw = PW / 2;
  return (px + hw > bx && px - hw < bx + 1 &&
          py + PH > by && py < by + 1 &&
          pz + hw > bz && pz - hw < bz + 1);
}
