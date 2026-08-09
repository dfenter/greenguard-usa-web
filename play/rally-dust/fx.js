// fx.js — pooled particle systems for Rally Dust.
//
// House procedural VFX pattern: fixed-size pools, one shared material per
// system, ballistic update, colour-ramp fade, hidden when the pool is dead.
// Nothing in the update path allocates or splices.
//
// Four systems ship: the rolling dust plume behind the car, a hard gravel
// spray off the driven wheels, impact debris, and speed streaks. The skid
// ribbon is a fifth, growing-strip system.
//
// Adapted from the sibling title Redline GT's fx module; nothing is imported.
import * as THREE from 'three';

const DEAD_Y = -9999;

// Sprite family. Each surface throws a different SHAPE of material, not the
// same puff in a different tint: a soft billow for dry dust, a hard chip for
// gravel, a wet lump for mud, a broad flake for snow, a thin lance for spray.
const spriteCache = new Map();
export function sprite(kind) {
  if (spriteCache.has(kind)) return spriteCache.get(kind);
  const s = 32;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const c = s / 2;
  if (kind === 'puff') {
    // Three overlapping lobes: a billow silhouette, not a perfect disc.
    for (const [ox, oy, r] of [[-4, 2, 11], [5, -3, 10], [0, 5, 9]]) {
      const grad = g.createRadialGradient(c + ox, c + oy, 0.5, c + ox, c + oy, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.85)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.4)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(c + ox, c + oy, r, 0, Math.PI * 2); g.fill();
    }
  } else if (kind === 'grit') {
    // Angular chip with a hard edge; gravel does not have soft edges.
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    g.moveTo(c - 7, c - 5); g.lineTo(c + 6, c - 8); g.lineTo(c + 8, c + 4);
    g.lineTo(c + 1, c + 8); g.lineTo(c - 8, c + 3);
    g.closePath(); g.fill();
  } else if (kind === 'clod') {
    // Wet lump: dense core, ragged rim, no falloff halo.
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath(); g.arc(c, c, 9, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      g.beginPath();
      g.arc(c + Math.cos(a) * 8, c + Math.sin(a) * 8, 3.2 + (i % 3), 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'flake') {
    // Snow: a broad soft disc with a bright centre, reads as powder.
    const grad = g.createRadialGradient(c, c, 0.5, c, c, 15);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  } else {
    // 'spray': a vertical lance for water off a wet surface.
    const grad = g.createLinearGradient(c, 0, c, s);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(c - 3, 0, 6, s);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  spriteCache.set(kind, tex);
  return tex;
}
function softTexture() { return sprite('puff'); }

export class ParticleSystem {
  constructor(count, size, color, opts) {
    const o = opts || {};
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    this.next = 0;
    this.gravity = o.gravity != null ? o.gravity : -14;
    this.drag = o.drag != null ? o.drag : 1.6;
    this.baseCol = new THREE.Color(color);
    this.fadeColor = o.fadeColor != null ? new THREE.Color(o.fadeColor) : null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setDrawRange(0, count);
    const mat = new THREE.PointsMaterial({
      size, sizeAttenuation: true, vertexColors: true, transparent: true,
      opacity: o.opacity != null ? o.opacity : 0.85,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      map: o.shape ? sprite(o.shape) : (o.soft ? softTexture() : null),
      // A meaningful alpha test rejects the transparent skirt of every sprite
      // before it is blended. On a soft billow that is most of the quad, and
      // overdraw is the largest single term in the frame on a phone GPU.
      alphaTest: (o.shape || o.soft) ? (o.alphaTest != null ? o.alphaTest : 0.16) : 0,
    });
    this.geo = geo; this.mat = mat;
    this.pts = new THREE.Points(geo, mat);
    this.pts.frustumCulled = false;
    this.pts.visible = false;
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = DEAD_Y;
    geo.attributes.position.needsUpdate = true;
  }

  setColor(hex) { this.baseCol.setHex(hex); }
  setFade(hex) { if (this.fadeColor) this.fadeColor.setHex(hex); else this.fadeColor = new THREE.Color(hex); }

  emit(x, y, z, vx, vy, vz, life, color) {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    const p = i * 3;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
    this.vel[p] = vx; this.vel[p + 1] = vy; this.vel[p + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    const c = color || this.baseCol;
    this.col[p] = c.r; this.col[p + 1] = c.g; this.col[p + 2] = c.b;
  }

  update(dt) {
    const { pos, vel, life, maxLife, col } = this;
    const dragF = Math.max(0, 1 - this.drag * dt);
    let live = false;
    for (let i = 0; i < this.count; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const p = i * 3;
      if (life[i] <= 0) { pos[p + 1] = DEAD_Y; continue; }
      live = true;
      vel[p] *= dragF; vel[p + 2] *= dragF;
      vel[p + 1] = vel[p + 1] * dragF + this.gravity * dt;
      pos[p] += vel[p] * dt;
      pos[p + 1] += vel[p + 1] * dt;
      pos[p + 2] += vel[p + 2] * dt;
      // PointsMaterial carries no per-vertex alpha, so the fade is a colour
      // ramp toward the fog tone; against these scenes it reads as a dissolve.
      const t = life[i] / maxLife[i];
      if (this.fadeColor) {
        const f = this.fadeColor;
        col[p] = f.r + (this.baseCol.r - f.r) * t;
        col[p + 1] = f.g + (this.baseCol.g - f.g) * t;
        col[p + 2] = f.b + (this.baseCol.b - f.b) * t;
      } else {
        col[p] *= 0.986; col[p + 1] *= 0.986; col[p + 2] *= 0.986;
      }
    }
    // Only flag the attributes when something moved: a dead pool re-uploading
    // both full buffers every frame shows up in the feel trace as periodic
    // upload stalls with nothing on screen.
    if (live || this.wasLive) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
    this.wasLive = live;
    this.pts.visible = live;
  }

  reset() {
    for (let i = 0; i < this.count; i++) {
      this.life[i] = 0;
      this.pos[i * 3 + 1] = DEAD_Y;
    }
    this.next = 0;
    this.wasLive = false;
    this.geo.attributes.position.needsUpdate = true;
    this.pts.visible = false;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// Biome atmosphere: a drifting field that follows the car so every stage has
// air in it. Pine gets low mist, Ember Basin hanging dust, Frost Ridge falling
// snow, Nightfall Run sea spray glimmer. One draw call, one wrap per particle.
export class AtmosphereField {
  constructor(count, opts) {
    const o = opts || {};
    this.count = count;
    this.range = o.range || 46;
    this.fall = o.fall != null ? o.fall : -1.2;
    this.drift = o.drift || 1.4;
    this.pos = new Float32Array(count * 3);
    this.phase = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.PointsMaterial({
      size: o.size || 1.4, sizeAttenuation: true, color: o.color == null ? 0xffffff : o.color,
      transparent: true, opacity: o.opacity == null ? 0.22 : o.opacity, depthWrite: false,
      map: sprite(o.shape || 'puff'), alphaTest: 0.14, fog: true,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.geo = geo; this.mat = mat;
    this.pts = new THREE.Points(geo, mat);
    this.pts.frustumCulled = false;
    for (let i = 0; i < count; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * this.range * 2;
      this.pos[i * 3 + 1] = Math.random() * 14;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.range * 2;
      this.phase[i] = Math.random() * 6.28;
    }
    this.t = 0;
  }

  update(dt, cx, cy, cz) {
    this.t += dt;
    const p = this.pos, R = this.range;
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      p[k] += Math.sin(this.t * 0.5 + this.phase[i]) * this.drift * dt;
      p[k + 1] += this.fall * dt;
      p[k + 2] += Math.cos(this.t * 0.4 + this.phase[i]) * this.drift * dt;
      // Wrap into the box that follows the car.
      const dx = p[k] - cx, dy = p[k + 1] - cy, dz = p[k + 2] - cz;
      if (dx > R) p[k] -= R * 2; else if (dx < -R) p[k] += R * 2;
      if (dz > R) p[k + 2] -= R * 2; else if (dz < -R) p[k + 2] += R * 2;
      if (dy < -2) p[k + 1] = cy + 16; else if (dy > 18) p[k + 1] = cy - 1;
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  reset(cx, cy, cz) {
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3] = cx + (Math.random() - 0.5) * this.range * 2;
      this.pos[i * 3 + 1] = cy + Math.random() * 14;
      this.pos[i * 3 + 2] = cz + (Math.random() - 0.5) * this.range * 2;
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// Speed streaks: short line segments rushing past the camera at high pace.
export class StreakSystem {
  constructor(count, color) {
    this.count = count;
    this.pos = new Float32Array(count * 6);
    this.col = new Float32Array(count * 6);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.5,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.geo = geo; this.mat = mat;
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.baseCol = new THREE.Color(color);
    for (let i = 0; i < count * 6; i += 3) this.pos[i + 1] = DEAD_Y;
    geo.attributes.position.needsUpdate = true;
  }

  setColor(hex) { this.baseCol.setHex(hex); }

  emit(x, y, z, vx, vy, vz, life, len) {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    const p = i * 6;
    const n = Math.hypot(vx, vy, vz) || 1;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
    this.pos[p + 3] = x - vx / n * len;
    this.pos[p + 4] = y - vy / n * len;
    this.pos[p + 5] = z - vz / n * len;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    const c = this.baseCol;
    for (let k = 0; k < 2; k++) {
      this.col[p + k * 3] = c.r; this.col[p + k * 3 + 1] = c.g; this.col[p + k * 3 + 2] = c.b;
    }
  }

  update(dt) {
    let live = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const p = i * 6, v = i * 3;
      if (this.life[i] <= 0) { this.pos[p + 1] = DEAD_Y; this.pos[p + 4] = DEAD_Y; continue; }
      live = true;
      const dx = this.vel[v] * dt, dy = this.vel[v + 1] * dt, dz = this.vel[v + 2] * dt;
      this.pos[p] += dx; this.pos[p + 1] += dy; this.pos[p + 2] += dz;
      this.pos[p + 3] += dx; this.pos[p + 4] += dy; this.pos[p + 5] += dz;
      const t = this.life[i] / this.maxLife[i];
      for (let k = 0; k < 2; k++) {
        this.col[p + k * 3] = this.baseCol.r * t;
        this.col[p + k * 3 + 1] = this.baseCol.g * t;
        this.col[p + k * 3 + 2] = this.baseCol.b * t;
      }
    }
    if (live || this.wasLive) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
    this.wasLive = live;
    this.lines.visible = live;
  }

  reset() {
    for (let i = 0; i < this.count; i++) {
      this.life[i] = 0;
      this.pos[i * 6 + 1] = DEAD_Y; this.pos[i * 6 + 4] = DEAD_Y;
    }
    this.next = 0;
    this.wasLive = false;
    this.geo.attributes.position.needsUpdate = true;
    this.lines.visible = false;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// Skid ruts: a growing ribbon laid on the road while the car slides. Fixed
// vertex budget with the oldest quads recycled.
export class SkidTrail {
  constructor(maxQuads, color) {
    this.max = maxQuads;
    this.pos = new Float32Array(maxQuads * 18);   // 6 verts * 3
    this.next = 0;
    this.used = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.MeshBasicMaterial({
      color: color == null ? 0x241c12 : color, transparent: true, opacity: 0.38,
      depthWrite: false, fog: true,
    });
    this.geo = geo; this.mat = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    for (let i = 1; i < maxQuads * 18; i += 3) this.pos[i] = DEAD_Y;
    // Preallocated contact pair: pushing a quad runs every frame while sliding
    // and used to allocate an object plus an 18-slot literal each time.
    this.prev = { on: false, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 };
  }

  push(ax, ay, az, bx, by, bz) {
    const p = this.prev;
    if (p.on) {
      const i = this.next * 18;
      this.next = (this.next + 1) % this.max;
      if (this.used < this.max) this.used++;
      const q = this.pos;
      q[i] = p.ax; q[i + 1] = p.ay; q[i + 2] = p.az;
      q[i + 3] = p.bx; q[i + 4] = p.by; q[i + 5] = p.bz;
      q[i + 6] = bx; q[i + 7] = by; q[i + 8] = bz;
      q[i + 9] = p.ax; q[i + 10] = p.ay; q[i + 11] = p.az;
      q[i + 12] = bx; q[i + 13] = by; q[i + 14] = bz;
      q[i + 15] = ax; q[i + 16] = ay; q[i + 17] = az;
      this.geo.attributes.position.needsUpdate = true;
      this.mesh.visible = true;
    }
    p.on = true;
    p.ax = ax; p.ay = ay; p.az = az;
    p.bx = bx; p.by = by; p.bz = bz;
  }

  break() { this.prev.on = false; }

  reset() {
    for (let i = 1; i < this.max * 18; i += 3) this.pos[i] = DEAD_Y;
    this.next = 0; this.used = 0; this.prev.on = false;
    this.geo.attributes.position.needsUpdate = true;
    this.mesh.visible = false;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
