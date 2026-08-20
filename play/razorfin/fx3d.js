/* Razorfin 3D effects, juice, audio, and music. Lane F3. */
import * as THREE from 'three';

const root = typeof window !== 'undefined' ? window : globalThis;
const RF = root.RF = root.RF || {};
const EMPTY = Object.freeze({});
const TAU = Math.PI * 2;
const WHITE = 0xffffff;
const GOLD = 0xffd98a;

function data() { return root.RFD || {}; }
function finite(value, fallback) {
  return (typeof value === 'number' && isFinite(value)) ? value : fallback;
}
function clamp(value, low, high) {
  value = finite(value, low);
  return value < low ? low : value > high ? high : value;
}
function mixColor(a, b, amount) {
  const aa = (a == null ? WHITE : a) >>> 0;
  const bb = (b == null ? WHITE : b) >>> 0;
  const t = clamp(amount, 0, 1);
  const ar = (aa >>> 16) & 255, ag = (aa >>> 8) & 255, ab = aa & 255;
  const br = (bb >>> 16) & 255, bg = (bb >>> 8) & 255, bc = bb & 255;
  return ((Math.round(ar + (br - ar) * t) << 16)
    | (Math.round(ag + (bg - ag) * t) << 8)
    | Math.round(ab + (bc - ab) * t)) >>> 0;
}
function eachKey(obj, fn) {
  if (!obj) return;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) fn(key, obj[key]);
  }
}
function writeColor(target, offset, value, amount) {
  const hex = (value == null ? WHITE : value) >>> 0;
  const scale = amount == null ? 1 : amount;
  target[offset] = ((hex >>> 16) & 255) / 255 * scale;
  target[offset + 1] = ((hex >>> 8) & 255) / 255 * scale;
  target[offset + 2] = (hex & 255) / 255 * scale;
}
function colorCss(value) {
  return '#' + ((value == null ? WHITE : value) >>> 0).toString(16).padStart(6, '0');
}

function tintFromOptions(opts, fallback) {
  const owner = opts && (opts.entity || opts.ent || opts.source);
  if (owner && typeof owner._tint === 'number' && isFinite(owner._tint)) return owner._tint >>> 0;
  if (opts && typeof opts._tint === 'number' && isFinite(opts._tint)) return opts._tint >>> 0;
  return opts && opts.tint != null ? opts.tint : fallback;
}

const BLOOD_MIST_OPTS = Object.freeze({
  count: 1, tint: 0xb3122a, tint2: 0x5a0812, scale: 0.78, life: 760,
  angle: 0, speed: 18, cue: 'blood', blood: true,
});
const BLOOD_EDGE_OPTS = Object.freeze({
  count: 1, tint: 0xb3122a, scale: 0.72, alpha: 0.13, life: 960, cue: 'blood',
});
const SCHOOL_RING_OPTS = Object.freeze({
  count: 1, tint: 0xdbe8f5, scale: 1.18, life: 420, cue: 'school',
});
const GOLDEN_EDGE_OPTS = Object.freeze({
  count: 1, tint: GOLD, scale: 0.9, alpha: 0.24, life: 980, cue: 'golden',
});
const GOLDEN_GLINT_OPTS = Object.freeze({
  count: 8, tint: GOLD, scale: 1.12, life: 480, cue: 'golden',
});

const PARTICLE_VERT = `
attribute float aSize;
attribute float aAlpha;
attribute float aRotation;
attribute float aAspect;
attribute float aShape;
attribute vec3 aColor;
varying float vAlpha;
varying float vRotation;
varying float vAspect;
varying float vShape;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vRotation = aRotation;
  vAspect = max(1.0, aAspect);
  vShape = aShape;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, aSize) * 620.0 / max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FRAG = `
precision mediump float;
varying float vAlpha;
varying float vRotation;
varying float vAspect;
varying float vShape;
varying vec3 vColor;
void main() {
  if (vAlpha <= 0.002) discard;
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRotation), s = sin(vRotation);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  float alpha = 1.0;
  if (vShape > 2.5) {
    float d = length(p) * 2.0;
    alpha = smoothstep(1.0, 0.05, d);
  } else if (vShape > 1.5) {
    if (abs(p.y) > 0.5 / vAspect) discard;
    alpha = smoothstep(0.5, 0.16, abs(p.y) * vAspect);
    alpha *= smoothstep(0.58, 0.18, abs(p.x));
  } else if (vShape > 0.5) {
    /* Shape 1 is a hollow ring: keep the centre clear while the outer edge
       fades softly. The frenzy school cue reuses this shader path. */
    float r = length(p);
    alpha = smoothstep(0.52, 0.40, r) * smoothstep(0.22, 0.34, r);
  } else {
    alpha = smoothstep(0.54, 0.08, length(p));
  }
  gl_FragColor = vec4(vColor, alpha * vAlpha);
}`;

const POOL_NAMES = Object.freeze([
  'bubbles', 'motes', 'elementSpark', 'ring', 'beamCore',
  'swimtrail', 'speedlines', 'breach', 'ambient', 'goldpulse',
]);

const POOL_CONFIG = Object.freeze({
  bubbles: { size: 96, life: 850, scale: 0.42, speed: 34, mode: 0, z: 18, pointSize: 40, shape: 0, additive: true },
  motes: { size: 96, life: 560, scale: 0.34, speed: 145, mode: 1, z: 50, pointSize: 38, shape: 0, additive: true },
  elementSpark: { size: 64, life: 430, scale: 0.27, speed: 190, mode: 2, z: 58, pointSize: 34, shape: 0, additive: true },
  ring: { size: 24, life: 560, scale: 0.5, speed: 0, mode: 3, z: 40, pointSize: 54, shape: 1, additive: true },
  beamCore: { size: 12, life: 92, scale: 1, speed: 0, mode: 4, z: 45, pointSize: 26, shape: 2, additive: true },
  swimtrail: { size: 128, life: 720, scale: 0.23, speed: 26, mode: 5, z: 65, pointSize: 30, shape: 0, additive: true, boostRate: 2.5, boostScale: 1.4, boostTaperMs: 300 },
  speedlines: { size: 72, life: 170, scale: 0.42, speed: 220, mode: 6, z: 72, pointSize: 48, shape: 2, additive: true },
  breach: { size: 96, life: 720, scale: 0.34, speed: 118, mode: 7, z: 50, pointSize: 40, shape: 0, additive: true },
  ambient: { size: 160, life: 1700, scale: 0.32, speed: 5, mode: 9, z: -40, pointSize: 18, shape: 3, additive: false },
  goldpulse: { size: 16, life: 980, scale: 1, speed: 0, mode: 8, z: 0, pointSize: 0, shape: 0, additive: false },
});

/* Nine GPU pools are each one reusable Points draw. goldpulse is a DOM-only
   UI effect and therefore contributes zero WebGL draws. */
const FX_DRAW_CALLS = POOL_NAMES.length - 1;

function angleFromOptions(opts, mode) {
  if (opts.angle == null) return null;
  const value = finite(opts.angle, 0);
  /* Existing callers authored legacy FX angles as degrees. Rev 4 game
     motion uses radians, so the new water/boost families accept either:
     small values are radians, larger values are degrees. */
  if (mode >= 5 && Math.abs(value) <= TAU * 2.1) return value;
  return value * Math.PI / 180;
}

const Fx = (() => {
  let scene = null;
  let pools = Object.create(null);
  let initialized = false;
  let goldEdges = [null, null, null, null];
  let goldOverlayReady = false;
  let goldOverlayHost = null;
  let frenzyCue = null;
  let bloodMistCarry = 0;
  let bloodEdgeClock = 0;
  let trailBoostMix = 0;
  let trailBoosting = false;
  let trailEmitCarry = 0;
  const GOLD_SIDES = ['top', 'right', 'bottom', 'left'];

  function addEdgeClass(edge, name) {
    if (!edge) return;
    if (edge.classList && typeof edge.classList.add === 'function') edge.classList.add(name);
  }

  function removeEdgeClass(edge, name) {
    if (!edge) return;
    if (edge.classList && typeof edge.classList.remove === 'function') edge.classList.remove(name);
  }

  function playerOf(ctx) { return ctx && ctx.player ? ctx.player : null; }

  function playerBoosting(ctx) {
    const player = playerOf(ctx);
    const state = player && player.anim && player.anim.state;
    if (state && state.boosting != null) return !!state.boosting;
    return !!(player && player.ctl && player.ctl.boosting);
  }

  function deltaMs(dt) {
    return clamp(dt == null ? 16.6667 : (dt <= 2 ? dt * 1000 : dt), 1, 50);
  }

  function syncTrailBoost(ctx, dt) {
    const boosting = playerBoosting(ctx);
    if (boosting) {
      trailBoostMix = 1;
      trailBoosting = true;
      return;
    }
    trailBoosting = false;
    if (trailBoostMix > 0) {
      trailBoostMix -= deltaMs(dt) / POOL_CONFIG.swimtrail.boostTaperMs;
      if (trailBoostMix < 0) trailBoostMix = 0;
    }
    if (trailBoostMix <= 0) trailEmitCarry = 0;
  }

  function cueName(value) {
    if (value === 'blood' || value === 'school' || value === 'golden' || value === 'goldRush') return value;
    return null;
  }

  function cueUi(value) {
    const ui = RF.UI;
    if (ui && typeof ui.frenzyCue === 'function') {
      try { ui.frenzyCue(value); } catch (err) {}
    }
  }

  function clearBloodEdges() {
    const pool = pools.goldpulse;
    if (!pool) return;
    for (let i = 0; i < pool.items.length; i++) {
      const item = pool.items[i];
      if (item.active && item.variant === 1) hide(item, pool);
    }
  }

  function makePointMaterial(additive) {
    return new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }

  function createGoldOverlay() {
    if (goldOverlayReady && goldEdges[0]) return;
    if (typeof document === 'undefined' || !document.createElement) return;
    const host = document.body || document.documentElement;
    if (!host) return;
    for (let i = 0; i < 4; i++) {
      const edge = document.createElement('div');
      edge.className = 'rf-gold-edge rf-gold-edge-' + GOLD_SIDES[i];
      edge.setAttribute('aria-hidden', 'true');
      edge.style.cssText = 'position:fixed;z-index:6;pointer-events:none;display:block;opacity:0;';
      if (i === 0) {
        edge.style.top = '0'; edge.style.left = '0'; edge.style.right = '0';
        edge.style.height = 'max(16px,3.8vmin)';
        edge.style.background = 'linear-gradient(180deg,var(--rf-gold),transparent)';
      } else if (i === 1) {
        edge.style.top = '0'; edge.style.right = '0'; edge.style.bottom = '0';
        edge.style.width = 'max(16px,3.8vmin)';
        edge.style.background = 'linear-gradient(270deg,var(--rf-gold),transparent)';
      } else if (i === 2) {
        edge.style.right = '0'; edge.style.bottom = '0'; edge.style.left = '0';
        edge.style.height = 'max(16px,3.8vmin)';
        edge.style.background = 'linear-gradient(0deg,var(--rf-gold),transparent)';
      } else {
        edge.style.top = '0'; edge.style.bottom = '0'; edge.style.left = '0';
        edge.style.width = 'max(16px,3.8vmin)';
        edge.style.background = 'linear-gradient(90deg,var(--rf-gold),transparent)';
      }
      host.appendChild(edge);
      goldEdges[i] = edge;
    }
    goldOverlayHost = host;
    goldOverlayReady = true;
  }

  function removeGoldOverlay() {
    for (let i = 0; i < goldEdges.length; i++) {
      const edge = goldEdges[i];
      if (!edge) continue;
      edge.style.opacity = 0;
      removeEdgeClass(edge, 'rf-frenzy-blood');
      const host = edge.parentNode || goldOverlayHost;
      if (host && typeof host.removeChild === 'function') {
        try { host.removeChild(edge); } catch (err) {}
      }
      goldEdges[i] = null;
    }
    goldOverlayHost = null;
    goldOverlayReady = false;
  }

  function removeSceneObject(object) {
    if (!object || !scene) return;
    if (typeof scene.remove === 'function') scene.remove(object);
    else if (scene.children) {
      const index = scene.children.indexOf(object);
      if (index >= 0) scene.children.splice(index, 1);
    }
  }

  function disposeMaterial(material) {
    if (!material) return;
    if (Array.isArray(material)) {
      for (let i = 0; i < material.length; i++) disposeMaterial(material[i]);
      return;
    }
    if (typeof material.dispose === 'function') material.dispose();
  }

  function disposeObject(object) {
    if (!object) return;
    removeSceneObject(object);
    if (object.geometry && typeof object.geometry.dispose === 'function') object.geometry.dispose();
    disposeMaterial(object.material);
  }

  function buildPool(name, config) {
    const count = config.size;
    const pool = {
      name: name,
      config: config,
      cursor: 0,
      items: [],
      positions: new Float32Array(count * 3),
      colors: new Float32Array(count * 3),
      sizes: new Float32Array(count),
      alphas: new Float32Array(count),
      rotations: new Float32Array(count),
      aspects: new Float32Array(count),
      shapes: new Float32Array(count),
      geometry: null,
      points: null,
    };
    if (config.mode !== 8) {
      pool.geometry = new THREE.BufferGeometry();
      pool.geometry.setAttribute('position', new THREE.BufferAttribute(pool.positions, 3));
      pool.geometry.setAttribute('aColor', new THREE.BufferAttribute(pool.colors, 3));
      pool.geometry.setAttribute('aSize', new THREE.BufferAttribute(pool.sizes, 1));
      pool.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(pool.alphas, 1));
      pool.geometry.setAttribute('aRotation', new THREE.BufferAttribute(pool.rotations, 1));
      pool.geometry.setAttribute('aAspect', new THREE.BufferAttribute(pool.aspects, 1));
      pool.geometry.setAttribute('aShape', new THREE.BufferAttribute(pool.shapes, 1));
      pool.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10000000);
      pool.points = new THREE.Points(pool.geometry, makePointMaterial(config.additive));
      pool.points.frustumCulled = false;
      pool.points.renderOrder = config.mode === 9 ? 2 : 7;
      scene.add(pool.points);
    }

    for (let i = 0; i < count; i++) {
      pool.items[i] = {
        active: false,
        age: 0,
        life: 0,
        maxLife: config.life,
        x: 0,
        y: 0,
        z: config.z,
        vx: 0,
        vy: 0,
        gravity: 0,
        rotation: 0,
        spin: 0,
        baseScale: config.scale,
        length: 0,
        width: 0,
        tint: null,
        slot: i,
        variant: 0,
        side: -1,
        isRing: false,
        ringRadius: 0,
        edge: null,
      };
    }
    return pool;
  }

  function hide(item, pool) {
    item.active = false;
    pool.alphas[item.slot] = 0;
    if (item.edge) {
      item.edge.style.opacity = 0;
      removeEdgeClass(item.edge, 'rf-frenzy-blood');
    }
    item.edge = null;
  }

  function show(item, pool) {
    item.active = true;
    pool.alphas[item.slot] = 1;
  }

  function acquire(pool) {
    const count = pool.items.length;
    for (let i = 0; i < count; i++) {
      const item = pool.items[(pool.cursor + i) % count];
      if (!item.active) {
        pool.cursor = (item.slot + 1) % count;
        return item;
      }
    }
    const item = pool.items[pool.cursor];
    pool.cursor = (pool.cursor + 1) % count;
    hide(item, pool);
    return item;
  }

  function syncItem(item, pool, alpha) {
    const slot = item.slot;
    const p = slot * 3;
    pool.positions[p] = item.x;
    pool.positions[p + 1] = -item.y;
    pool.positions[p + 2] = item.z;
    pool.alphas[slot] = alpha;
    pool.rotations[slot] = -item.rotation;
    pool.aspects[slot] = item.width > 0 ? Math.max(1, item.length / item.width) : 1;
  }

  function tintItem(item, pool, value, amount) {
    item.tint = value;
    writeColor(pool.colors, item.slot * 3, value, amount == null ? 1 : amount);
  }

  function activate(item, x, y, opts, pool) {
    const config = pool.config;
    const mode = config.mode;
    const angleValue = angleFromOptions(opts, mode);
    const angleProvided = angleValue != null;
    let angle = angleProvided ? angleValue : (mode === 5 || mode === 6 ? Math.PI : mode === 7 ? -Math.PI / 2 : 0);
    if (mode === 9 && !angleProvided) angle = (item.slot % 13) * 0.61;
    const spread = mode === 0 ? 0.18 : (mode === 3 || mode === 4 ? 0 : mode === 5 ? 0.42 : mode === 6 ? 0.07 : mode === 7 ? 1.18 : mode === 9 ? 0.32 : 0.72);
    const ordinal = item.slot;
    const offset = ((ordinal % 11) - 5) / 5;
    const theta = angle + offset * spread;
    let speed = finite(opts.speed, config.speed);
    const scale = clamp(opts.scale == null ? config.scale : opts.scale, 0.05, 8);
    const life = clamp(opts.life == null ? config.life : opts.life, 20, 2500);
    let tintValue = tintFromOptions(opts, mode === 7 ? WHITE : null);
    const blood = opts.cue === 'blood' || opts.blood === true;

    item.life = life;
    item.maxLife = life;
    item.age = 0;
    item.x = finite(x, 0);
    item.y = finite(y, 0);
    item.z = finite(opts.z, config.z);
    item.baseScale = scale;
    item.tint = tintValue;
    item.variant = 0;
    item.side = -1;
    item.isRing = false;
    item.ringRadius = 0;
    item.length = 0;
    item.width = 0;
    item.rotation = mode === 6 ? angle : (angleProvided ? angle : (ordinal % 16) * (TAU / 16));
    item.spin = mode === 3 || mode === 4 || mode === 6 ? 0 : (0.5 + (ordinal % 5) * 0.16) * (ordinal % 2 ? -1 : 1);
    item.gravity = 0;

    /* Bite bursts get a stable, pooled mix of base motes, larger chunks,
       and one pin-prick score sparkle. `tint2` is optional so blood bursts
       can keep their own second tone without a second pool. */
    if (mode === 1) {
      item.variant = ordinal % 8;
      if (item.variant === 0 || item.variant === 1) {
        item.baseScale = scale * (item.variant === 0 ? 1.65 : 1.35);
        speed *= item.variant === 0 ? 0.72 : 0.88;
      } else if (item.variant === 2) {
        item.baseScale = scale * 0.48;
        speed *= 1.32;
        tintValue = blood ? (opts.tint2 == null ? tintValue : opts.tint2) : WHITE;
      } else {
        item.baseScale = scale;
        if (item.variant % 2 === 0) tintValue = opts.tint2 == null ? mixColor(tintValue, WHITE, 0.34) : opts.tint2;
      }
      item.tint = tintValue;
    }
    if (mode === 5) {
      speed = opts.speed == null ? config.speed : clamp(speed * 0.08, 8, 62);
      item.gravity = -18;
      item.baseScale *= 1 + trailBoostMix * (config.boostScale - 1);
    } else if (mode === 6) {
      speed = clamp(speed, 60, 540);
      item.length = clamp(opts.length == null ? 42 : opts.length, 12, 180) * scale;
      item.width = clamp(opts.width == null ? 3.2 : opts.width, 1.2, 12) * scale;
    } else if (mode === 7) {
      speed = clamp(speed, 58, 270);
      item.gravity = 270;
    } else if (mode === 9) {
      speed = clamp(speed, 0.5, 30);
      item.x += ((ordinal % 13) - 6) * finite(opts.radius, 14);
      item.y += (((ordinal * 7) % 13) - 6) * finite(opts.radius, 8);
    }
    if (mode !== 1 && mode !== 2 && mode !== 5 && mode !== 7 && mode !== 9) item.gravity = 0;
    if (mode === 1) item.gravity = 150;
    else if (mode === 2) item.gravity = 75;
    item.vx = Math.cos(theta) * speed;
    item.vy = Math.sin(theta) * speed;
    pool.shapes[item.slot] = config.shape;
    pool.sizes[item.slot] = config.pointSize * item.baseScale;
    pool.aspects[item.slot] = 1;
    tintItem(item, pool, tintValue);
    show(item, pool);
    syncItem(item, pool, mode === 3 ? 0.75 : mode === 6 ? 0.86 : 0.88);
    if (mode === 3) item.ringRadius = item.baseScale * 36;
  }

  function activateBreachRing(item, x, y, opts, pool) {
    activate(item, x, y, opts, pool);
    item.isRing = true;
    item.vx = 0;
    item.vy = 0;
    item.gravity = 0;
    item.rotation = 0;
    item.baseScale = clamp(opts.scale == null ? pool.config.scale : opts.scale, 0.05, 8) * 0.78;
    item.tint = opts.tint == null ? WHITE : opts.tint;
    item.ringRadius = item.baseScale * 34;
    pool.shapes[item.slot] = 1;
    pool.sizes[item.slot] = pool.config.pointSize * item.baseScale;
    tintItem(item, pool, item.tint);
    syncItem(item, pool, 0.78);
  }

  function activateGold(item, opts, side) {
    const config = pools.goldpulse.config;
    const scale = clamp(opts.scale == null ? config.scale : opts.scale, 0.5, 3);
    const life = clamp(opts.life == null ? config.life : opts.life, 120, 3000);
    item.life = life;
    item.maxLife = life;
    item.age = 0;
    item.x = 0;
    item.y = 0;
    item.z = 0;
    item.vx = 0;
    item.vy = 0;
    item.gravity = 0;
    item.rotation = 0;
    item.spin = 0;
    item.baseScale = scale;
    item.tint = tintFromOptions(opts, GOLD);
    item.side = side;
    item.variant = 0;
    item.width = clamp(opts.alpha == null ? 0.26 : opts.alpha, 0.08, 0.42);
    item.edge = goldEdges[side];
    show(item, pools.goldpulse);
    if (item.edge) {
      if (opts.cue === 'blood') {
        item.variant = 1;
        addEdgeClass(item.edge, 'rf-frenzy-blood');
      } else {
        removeEdgeClass(item.edge, 'rf-frenzy-blood');
      }
      item.edge.style.setProperty('--rf-gold', colorCss(item.tint));
      item.edge.style.opacity = 0.01;
      if (side === 0 || side === 2) item.edge.style.height = 'max(' + (16 * scale) + 'px,3.8vmin)';
      else item.edge.style.width = 'max(' + (16 * scale) + 'px,3.8vmin)';
    }
  }

  function emitBreach(x, y, opts, pool) {
    const requested = opts.count == null ? 9 : Math.floor(finite(opts.count, 9));
    const count = requested < 0 ? 0 : requested > 24 ? 24 : requested;
    let emitted = 0;
    for (let i = 0; i < count; i++) {
      const item = acquire(pool);
      activate(item, x, y, opts, pool);
      emitted++;
    }
    const ring = acquire(pool);
    activateBreachRing(ring, x, y, opts, pool);
    emitted++;
    return emitted;
  }

  function emitGoldPulse(opts, pool) {
    const requested = opts.count == null ? 1 : Math.floor(finite(opts.count, 1));
    const pulses = requested < 0 ? 0 : requested > 3 ? 3 : requested;
    let emitted = 0;
    for (let pulse = 0; pulse < pulses; pulse++) {
      for (let side = 0; side < 4; side++) {
        const item = acquire(pool);
        activateGold(item, opts, side);
        emitted++;
      }
    }
    return emitted;
  }

  function poolFor(name) {
    if (!initialized) return null;
    if (name === 'bubbles') return pools.bubbles;
    if (name === 'motes' || name === 'chomp' || name === 'deathBurst') return pools.motes;
    if (name === 'elementSpark') return pools.elementSpark;
    if (name === 'ring') return pools.ring;
    if (name === 'beamCore') return pools.beamCore;
    if (name === 'swimtrail') return pools.swimtrail;
    if (name === 'speedlines') return pools.speedlines;
    if (name === 'breach') return pools.breach;
    if (name === 'ambient') return pools.ambient;
    if (name === 'goldpulse') return pools.goldpulse;
    return null;
  }

  function emit(name, x, y, opts) {
    const pool = poolFor(name);
    if (!pool) return 0;
    opts = opts || EMPTY;
    if (name === 'swimtrail') {
      const boosting = playerBoosting(RF.ctx);
      if (boosting) {
        trailBoostMix = 1;
        trailBoosting = true;
      }
    }
    if (name === 'goldpulse') return emitGoldPulse(opts, pool);
    if (name === 'breach') {
      const breachCount = emitBreach(x, y, opts, pool);
      if (breachCount && RF.Sound && typeof RF.Sound.play === 'function') RF.Sound.play('breach', { vol: 0.34, rate: 0.92 });
      return breachCount;
    }
    const requested = opts.count == null ? (name === 'bubbles' ? 3 : 1) : Math.floor(finite(opts.count, 1));
    let count = requested < 0 ? 0 : requested > 24 ? 24 : requested;
    /* engine3d already sends three trail particles during a live boost. For
       direct callers and for the 300 ms release taper, add the remaining
       fractional 1.5x through a scalar carry so the average is 2.5x. */
    if (name === 'swimtrail' && trailBoostMix > 0 && !(trailBoosting && requested >= 2)) {
      const desiredExtra = requested * (POOL_CONFIG.swimtrail.boostRate - 1) * trailBoostMix + trailEmitCarry;
      const extra = Math.floor(desiredExtra);
      trailEmitCarry = desiredExtra - extra;
      count = Math.min(24, count + extra);
    } else if (name !== 'swimtrail' || trailBoostMix <= 0) {
      trailEmitCarry = 0;
    }
    let emitted = 0;
    for (let i = 0; i < count; i++) {
      const item = acquire(pool);
      activate(item, x, y, opts, pool);
      emitted++;
    }
    if (emitted && name === 'swimtrail' && RF.Sound && typeof RF.Sound.play === 'function') {
      RF.Sound.play('swimtrail', { vol: 0.055, rate: 1 });
    }
    return emitted;
  }

  function beam(x1, y1, x2, y2, opts) {
    const pool = pools.beamCore;
    if (!initialized || !pool) return false;
    opts = opts || EMPTY;
    const ax = finite(x1, 0), ay = finite(y1, 0), bx = finite(x2, 0), by = finite(y2, 0);
    const dx = bx - ax, dy = by - ay;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 1) return false;
    const item = acquire(pool);
    const width = clamp(opts.width == null ? 18 : opts.width, 2, 160);
    const scale = clamp(opts.scale == null ? 1 : opts.scale, 0.05, 8);
    const config = pool.config;
    item.life = clamp(opts.life == null ? config.life : opts.life, 20, 400);
    item.maxLife = item.life;
    item.age = 0;
    item.x = (ax + bx) * 0.5;
    item.y = (ay + by) * 0.5;
    item.z = finite(opts.z, config.z);
    item.vx = 0;
    item.vy = 0;
    item.gravity = 0;
    item.length = length;
    item.width = width;
    item.baseScale = scale;
    item.rotation = Math.atan2(dy, dx);
    item.tint = opts.tint == null ? WHITE : opts.tint;
    item.isRing = false;
    pool.shapes[item.slot] = 2;
    pool.sizes[item.slot] = Math.max(width, 8) * scale;
    tintItem(item, pool, item.tint);
    show(item, pool);
    syncItem(item, pool, 0.9);
    return true;
  }

  function update(dt) {
    if (!initialized) return;
    const delta = clamp(dt == null ? 16.6667 : (dt <= 2 ? dt * 1000 : dt), 1, 50);
    for (let ni = 0; ni < POOL_NAMES.length; ni++) {
      const name = POOL_NAMES[ni];
      const pool = pools[name];
      if (!pool) continue;
      let live = 0;
      for (let i = 0; i < pool.items.length; i++) {
        const item = pool.items[i];
        if (!item.active) continue;
        item.age += delta;
        item.life -= delta;
        if (item.life <= 0) {
          if (name === 'goldpulse' && item.edge) item.edge.style.opacity = 0;
          hide(item, pool);
          continue;
        }
        live++;
        const lifeRatio = item.life / item.maxLife;
        const mode = pool.config.mode;
        if (name === 'goldpulse') {
          const breath = 0.5 + 0.5 * Math.sin((item.age / 1000) * TAU * 0.4);
          if (item.edge) item.edge.style.opacity = lifeRatio * (item.width / 0.26) * (0.1 + breath * 0.34);
          continue;
        }
        if (mode === 7 && item.isRing) {
          item.ringRadius = item.baseScale * 34 * (1 + (1 - lifeRatio) * 2.8);
          pool.sizes[item.slot] = pool.config.pointSize * item.baseScale * (1 + (1 - lifeRatio) * 2.8);
          syncItem(item, pool, lifeRatio * 0.86);
          continue;
        }
        if (mode === 0 || mode === 1 || mode === 2 || mode === 5 || mode === 7 || mode === 9) {
          item.vy += item.gravity * delta / 1000;
          item.x += item.vx * delta / 1000;
          item.y += item.vy * delta / 1000;
          item.rotation += item.spin * delta * 0.002;
          const scale = item.baseScale * (mode === 0 ? 0.78 + 0.22 * lifeRatio
            : mode === 5 ? 0.7 + 0.3 * lifeRatio + Math.sin(item.age * 0.012 + item.slot) * 0.035
              : mode === 7 ? 0.72 + 0.28 * lifeRatio
                : 0.72 + 0.28 * lifeRatio);
          pool.sizes[item.slot] = pool.config.pointSize * scale;
          syncItem(item, pool, lifeRatio * (mode === 0 ? 0.72 : mode === 5 ? 0.5 : mode === 9 ? 0.45 : 0.92));
        } else if (mode === 6) {
          item.x += item.vx * delta / 1000;
          item.y += item.vy * delta / 1000;
          syncItem(item, pool, lifeRatio * (0.55 + 0.25 * Math.sin(item.age * 0.03 + item.slot)));
        } else if (mode === 3) {
          item.ringRadius = item.baseScale * 36 * (1 + (1 - lifeRatio) * 2.6);
          pool.sizes[item.slot] = pool.config.pointSize * item.baseScale * (1 + (1 - lifeRatio) * 2.6);
          syncItem(item, pool, lifeRatio * 0.78);
        } else {
          pool.sizes[item.slot] = Math.max(item.width, 8) * item.baseScale
            * (0.9 + 0.1 * Math.sin(item.age * 0.035));
          syncItem(item, pool, lifeRatio * 0.94);
        }
      }
      if (pool.points) {
        pool.points.visible = live > 0;
        pool.geometry.attributes.position.needsUpdate = true;
        pool.geometry.attributes.aColor.needsUpdate = true;
        pool.geometry.attributes.aSize.needsUpdate = true;
        pool.geometry.attributes.aAlpha.needsUpdate = true;
        pool.geometry.attributes.aRotation.needsUpdate = true;
        pool.geometry.attributes.aAspect.needsUpdate = true;
        pool.geometry.attributes.aShape.needsUpdate = true;
      }
    }
  }

  function triggerFrenzyCue(cue, ctx) {
    const player = playerOf(ctx);
    const x = player ? finite(player.x, 0) : 0;
    const y = player ? finite(player.y, 0) : 0;
    if (cue === 'school') {
      emit('ring', x, y, SCHOOL_RING_OPTS);
      return;
    }
    if (cue === 'golden' || cue === 'goldRush') {
      emit('goldpulse', x, y, GOLDEN_EDGE_OPTS);
      emit('elementSpark', x, y, GOLDEN_GLINT_OPTS);
      if (RF.Sound && typeof RF.Sound.play === 'function') RF.Sound.play('coin', { vol: 0.28, rate: 1.12 });
    }
  }

  function updateBloodCue(ctx, delta) {
    const player = playerOf(ctx);
    if (player) {
      bloodMistCarry += delta * 0.012;
      while (bloodMistCarry >= 1) {
        emit('deathBurst', finite(player.x, 0), finite(player.y, 0), BLOOD_MIST_OPTS);
        bloodMistCarry -= 1;
      }
    }
    bloodEdgeClock -= delta;
    if (bloodEdgeClock <= 0) {
      emit('goldpulse', player ? finite(player.x, 0) : 0, player ? finite(player.y, 0) : 0, BLOOD_EDGE_OPTS);
      bloodEdgeClock = 900;
    }
  }

  function syncFrenzy(ctx, dt) {
    const run = ctx && ctx.run;
    const next = cueName(run && run.frenzyCue);
    const delta = deltaMs(dt);
    if (next !== frenzyCue) {
      if (frenzyCue === 'blood') clearBloodEdges();
      frenzyCue = next;
      bloodMistCarry = 0;
      bloodEdgeClock = next === 'blood' ? 0 : 900;
      cueUi(next);
      if (next !== 'blood') triggerFrenzyCue(next, ctx);
    }
    if (next === 'blood') updateBloodCue(ctx, delta);
  }

  /* Lane A's render loop uses the common render hook. Keep update(dt) as the
     direct three.js API while accepting the engine's `(ctx, dt)` call shape. */
  function render(ctx, dt) {
    const delta = deltaMs(dt);
    syncTrailBoost(ctx, delta);
    syncFrenzy(ctx, delta);
    update(dt);
    if (ctx && ctx.camera && RF.Juice && typeof RF.Juice.applyShake === 'function') RF.Juice.applyShake(ctx.camera, dt);
  }

  function init(scene3) {
    if (!scene3 || typeof scene3.add !== 'function') return Fx;
    /* Re-init against the currently live scene is intentionally a no-op: the
       caller can safely call init from boot/recovery without duplicating
       owned objects. Explicit teardown always removes and disposes them. */
    if (initialized && scene === scene3 && pools.bubbles) return Fx;
    if (initialized || scene) teardown();
    scene = scene3;
    pools = Object.create(null);
    initialized = true;
    for (let i = 0; i < POOL_NAMES.length; i++) {
      const name = POOL_NAMES[i];
      pools[name] = buildPool(name, POOL_CONFIG[name]);
    }
    createGoldOverlay();
    return Fx;
  }

  function activeEffectCount() {
    let count = 0;
    for (let ni = 0; ni < POOL_NAMES.length; ni++) {
      const pool = pools[POOL_NAMES[ni]];
      if (!pool) continue;
      for (let i = 0; i < pool.items.length; i++) if (pool.items[i].active) count++;
    }
    return count;
  }

  function cursorsReset() {
    for (let ni = 0; ni < POOL_NAMES.length; ni++) {
      const pool = pools[POOL_NAMES[ni]];
      if (pool && pool.cursor !== 0) return false;
    }
    return true;
  }

  function poolIntegrity(requireReady) {
    for (let i = 0; i < POOL_NAMES.length; i++) {
      const name = POOL_NAMES[i];
      const pool = pools[name];
      if (!pool || pool.items.length !== POOL_CONFIG[name].size || pool.cursor !== 0) return false;
      if (requireReady && name !== 'goldpulse' && (!pool.points || pool.points.type !== 'Points')) return false;
      if (!requireReady && (pool.points || pool.geometry)) return false;
      if (pool.points && (pool.line || pool.beams)) return false;
    }
    return true;
  }

  function teardown() {
    for (let i = 0; i < POOL_NAMES.length; i++) {
      const pool = pools[POOL_NAMES[i]];
      if (!pool) continue;
      for (let j = 0; j < pool.items.length; j++) hide(pool.items[j], pool);
      pool.cursor = 0;
      if (pool.points) disposeObject(pool.points);
      pool.points = null;
      pool.geometry = null;
      for (let j = 0; j < pool.positions.length; j++) pool.positions[j] = 0;
      for (let j = 0; j < pool.colors.length; j++) pool.colors[j] = 0;
      for (let j = 0; j < pool.sizes.length; j++) pool.sizes[j] = 0;
      for (let j = 0; j < pool.alphas.length; j++) pool.alphas[j] = 0;
    }
    removeGoldOverlay();
    initialized = false;
    scene = null;
    frenzyCue = null;
    bloodMistCarry = 0;
    bloodEdgeClock = 0;
    trailBoostMix = 0;
    trailBoosting = false;
    trailEmitCarry = 0;
    cueUi(null);
    resetJuiceState();
    return Fx;
  }

  function poolInventory() {
    return POOL_NAMES;
  }

  function drawCallContribution() {
    return FX_DRAW_CALLS;
  }

  function selftest() {
    const oldScene = scene;
    const oldPools = pools;
    const oldInitialized = initialized;
    const oldDocument = globalThis.document;
    const oldGoldEdges = goldEdges;
    const oldGoldOverlayReady = goldOverlayReady;
    const oldGoldOverlayHost = goldOverlayHost;
    const oldFrenzyCue = frenzyCue;
    const oldBloodMistCarry = bloodMistCarry;
    const oldBloodEdgeClock = bloodEdgeClock;
    const oldTrailBoostMix = trailBoostMix;
    const oldTrailBoosting = trailBoosting;
    const oldTrailEmitCarry = trailEmitCarry;
    const oldContext = RF.ctx;
    const testDomHost = {
      children: [],
      appendChild(node) { node.parentNode = this; this.children.push(node); return node; },
      removeChild(node) {
        const index = this.children.indexOf(node);
        if (index >= 0) this.children.splice(index, 1);
        node.parentNode = null;
        return node;
      },
    };
    const testDocument = {
      body: testDomHost,
      documentElement: testDomHost,
      createElement(tag) {
        const classes = Object.create(null);
        const node = {
          tagName: String(tag).toUpperCase(),
          style: {
            cssText: '',
            setProperty(name, value) { this[name] = value; },
          },
          className: '',
          parentNode: null,
          setAttribute() {},
          classList: {
            add(name) { classes[name] = true; },
            remove(name) { delete classes[name]; },
            contains(name) { return !!classes[name]; },
          },
        };
        return node;
      },
    };
    globalThis.document = testDocument;
    const testScene = {
      children: [],
      add(object) { this.children.push(object); },
      remove(object) {
        const index = this.children.indexOf(object);
        if (index >= 0) this.children.splice(index, 1);
      },
    };
    const testCamera = { position: { x: 0, y: 0, z: 0 } };
    const kaijuMaterial = {
      color: {
        value: 0x123456,
        getHex() { return this.value; },
        setHex(value) { this.value = value; },
      },
    };
    const kaijuGroup = { isObject3D: true, userData: {}, children: [], material: kaijuMaterial };
    const kaijuBaseColor = kaijuMaterial.color.value;
    let pass = true;
    const notes = [];
    try {
      /* Isolate the probe from a live scene, then dispose every test cycle
         before restoring the caller's references. */
      scene = null;
      pools = Object.create(null);
      initialized = false;
      goldEdges = [null, null, null, null];
      goldOverlayReady = false;
      goldOverlayHost = null;
      frenzyCue = null;
      bloodMistCarry = 0;
      bloodEdgeClock = 0;
      trailBoostMix = 0;
      trailBoosting = false;
      trailEmitCarry = 0;
      RF.ctx = null;
      for (let cycle = 0; cycle < 5; cycle++) {
        init(testScene);
        if (!poolIntegrity(true) || drawCallContribution() !== FX_DRAW_CALLS) pass = false;
        for (let i = 0; i < POOL_NAMES.length; i++) {
          const name = POOL_NAMES[i];
          if (emit(name, 20 + i, 30 + i, { count: 1, tint: 0x74eaff, scale: 0.8 }) <= 0) pass = false;
        }
        if (!beam(0, 0, 100, 0, { tint: 0x8dffda })) pass = false;
        update(16);
        if (activeEffectCount() <= 0) pass = false;
        hitStop(42);
        slowmo(0.2, 100);
        shake(4, 100);
        applyShake(testCamera, 16);
        if (!kaijuGlow(kaijuGroup, { glow: 0xaaffdd }, 0)) pass = false;
        teardown();
        if (activeEffectCount() !== 0 || !cursorsReset() || !poolIntegrity(false) || testScene.children.length !== 0
          || consumeFreeze() !== 0 || consumeSlowmo() !== null
          || Math.abs(testCamera.position.x) > 0.001 || Math.abs(testCamera.position.y) > 0.001
          || Math.abs(testCamera.position.z) > 0.001 || kaijuMaterial.color.value !== kaijuBaseColor) pass = false;
        teardown();
        if (activeEffectCount() !== 0 || !cursorsReset() || testScene.children.length !== 0) pass = false;
      }
      init(testScene);
      const testCtx = {
        run: { frenzyCue: 'blood' },
        player: { x: 240, y: 360, anim: { state: { boosting: false } } },
      };
      RF.ctx = testCtx;
      render(testCtx, 16.6667);
      const redEdges = goldEdges[0] && goldEdges[0].classList && goldEdges[0].classList.contains('rf-frenzy-blood');
      for (let frame = 0; frame < 100; frame++) render(testCtx, 16.6667);
      let redMist = false;
      for (let i = 0; i < pools.motes.items.length; i++) {
        const item = pools.motes.items[i];
        if (item.active && (item.tint === 0xb3122a || item.tint === 0x5a0812)) { redMist = true; break; }
      }
      if (!redEdges || !redMist) pass = false;
      const schoolCursor = pools.ring.cursor;
      testCtx.run.frenzyCue = 'school';
      render(testCtx, 16.6667);
      const schoolTriggered = pools.ring.cursor !== schoolCursor;
      const schoolCursorAfter = pools.ring.cursor;
      render(testCtx, 16.6667);
      if (!schoolTriggered || pools.ring.cursor !== schoolCursorAfter) pass = false;
      testCtx.run.frenzyCue = 'goldRush';
      render(testCtx, 16.6667);
      let goldGlint = false;
      for (let i = 0; i < pools.elementSpark.items.length; i++) {
        const item = pools.elementSpark.items[i];
        if (item.active && item.tint === GOLD) { goldGlint = true; break; }
      }
      if (!goldGlint) pass = false;
      testCtx.run.frenzyCue = undefined;
      render(testCtx, 16.6667);
      if (goldEdges[0] && goldEdges[0].classList.contains('rf-frenzy-blood')) pass = false;
      teardown();
      init(testScene);
      testCtx.run.frenzyCue = undefined;
      testCtx.player.anim.state.boosting = true;
      render(testCtx, 16.6667);
      const boostCount = emit('swimtrail', 0, 0, { count: 1, speed: 40 });
      let boostedTrail = false;
      for (let i = 0; i < pools.swimtrail.items.length; i++) {
        const item = pools.swimtrail.items[i];
        if (item.active && item.age === 0 && item.baseScale > POOL_CONFIG.swimtrail.scale * 1.3) { boostedTrail = true; break; }
      }
      testCtx.player.anim.state.boosting = false;
      render(testCtx, 16.6667);
      const taperCount = emit('swimtrail', 0, 0, { count: 1, speed: 40 });
      let taperedTrail = false;
      for (let i = 0; i < pools.swimtrail.items.length; i++) {
        const item = pools.swimtrail.items[i];
        if (item.active && item.age === 0 && item.baseScale > POOL_CONFIG.swimtrail.scale
          && item.baseScale < POOL_CONFIG.swimtrail.scale * POOL_CONFIG.swimtrail.boostScale) {
          taperedTrail = true; break;
        }
      }
      const goldenEntity = { _tint: 0xffd98a };
      emit('elementSpark', 0, 0, { count: 1, entity: goldenEntity });
      let entityTinted = false;
      for (let i = 0; i < pools.elementSpark.items.length; i++) {
        const item = pools.elementSpark.items[i];
        if (item.active && item.age === 0 && item.tint === goldenEntity._tint) { entityTinted = true; break; }
      }
      if (boostCount < 2 || taperCount < 1 || !boostedTrail || !taperedTrail || !entityTinted) pass = false;
      teardown();
      if (testDomHost.children.length !== 0) pass = false;
      notes.push('five init/emit/update/teardown cycles passed: pool cursors reset and zero active effects after teardown');
      notes.push('teardown is synchronous and idempotent (double-teardown leaves the scene empty)');
      notes.push('teardown reset Juice accumulators, camera shake, and tracked kaiju pulse state');
      notes.push('nine GPU pools are one reusable THREE.Points draw each; goldpulse is four DOM edge bars with zero WebGL draws');
      notes.push('blood cue sustains red mist and four red DOM edge bars; school and golden cues are edge-triggered');
      notes.push('boost trail averages 2.5x emission, scales 1.4x, and tapers over 300 ms; entity _tint reaches glints');
    } catch (err) {
      pass = false;
      notes.push('pool self-test threw: ' + (err && err.message ? err.message : String(err)));
    }
    scene = oldScene;
    pools = oldPools;
    initialized = oldInitialized;
    goldEdges = oldGoldEdges;
    goldOverlayReady = oldGoldOverlayReady;
    goldOverlayHost = oldGoldOverlayHost;
    frenzyCue = oldFrenzyCue;
    bloodMistCarry = oldBloodMistCarry;
    bloodEdgeClock = oldBloodEdgeClock;
    trailBoostMix = oldTrailBoostMix;
    trailBoosting = oldTrailBoosting;
    trailEmitCarry = oldTrailEmitCarry;
    RF.ctx = oldContext;
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
    return { pass, notes, drawCalls: FX_DRAW_CALLS };
  }

  return { init, teardown, emit, beam, update, render, poolInventory, drawCallContribution, __selftest: selftest };
})();

/* --------------------------------------------------------------- Juice */
let pendingFreezeMs = 0;
let pendingSlowmoScale = 1;
let pendingSlowmoMs = 0;
const slowmoResult = { scale: 1, ms: 0 };
let shakeUntil = 0;
let shakeMax = 0;
let shakeClock = 0;
let shakeCamera = null;
let shakeOffsetX = 0;
let shakeOffsetY = 0;
let shakeOffsetZ = 0;
let shakeBaseX = 0;
let shakeBaseY = 0;
let shakeBaseZ = 0;
let juiceScene = null;
const kaijuPulseStates = [];
let kaijuPulseStateCount = 0;

function nowMs(target) {
  const ctx = RF.ctx;
  if (ctx && ctx.time) return finite(ctx.time.now, 0);
  if (target && target.time) return finite(target.time.now, 0);
  return shakeClock;
}

function hitStop(ms) {
  pendingFreezeMs = clamp(pendingFreezeMs + clamp(ms, 0, 500), 0, 500);
  return pendingFreezeMs;
}

function consumeFreeze() {
  const result = pendingFreezeMs;
  pendingFreezeMs = 0;
  return result;
}

function trackPulseState(state) {
  if (!state || state.__rfTracked) return;
  state.__rfTracked = true;
  kaijuPulseStates[kaijuPulseStateCount++] = state;
}

function capturePulseBases(state) {
  state.base.length = 0;
  state.baseColor.length = 0;
  for (let i = 0; i < state.materials.length; i++) {
    const material = state.materials[i];
    state.base[i] = finite(material && material.emissiveIntensity, 0);
    state.baseColor[i] = material && material.color && typeof material.color.getHex === 'function'
      ? material.color.getHex() : null;
  }
  state.needsCollect = false;
  trackPulseState(state);
}

function collectPulseState(state, node) {
  state.materials.length = 0;
  collectMaterials(node, state);
  capturePulseBases(state);
}

function restorePulseState(state) {
  if (!state || !state.materials) return;
  for (let i = 0; i < state.materials.length; i++) {
    const material = state.materials[i];
    if (!material) continue;
    if (state.base[i] != null) material.emissiveIntensity = state.base[i];
    if (state.baseColor[i] != null && material.color && typeof material.color.setHex === 'function') {
      material.color.setHex(state.baseColor[i]);
    }
  }
  if (state.legacy && state.sprite && typeof state.sprite.setTint === 'function') {
    try { state.sprite.setTint(state.baseTint); } catch (err) {}
  }
}

function legacyGlowState(sprite) {
  if (!sprite) return null;
  let state = sprite.__rfFxGlowState;
  if (!state) {
    state = {
      legacy: true,
      sprite,
      baseTint: finite(sprite.tint, 0),
      needsBase: false,
      materials: [],
      base: [],
      baseColor: [],
    };
    try { sprite.__rfFxGlowState = state; } catch (err) {}
  }
  if (state.needsBase) {
    state.baseTint = finite(sprite.tint, 0);
    state.needsBase = false;
  }
  trackPulseState(state);
  return state;
}

function resetJuiceState() {
  if (shakeCamera && shakeCamera.position) {
    shakeCamera.position.x -= shakeOffsetX;
    shakeCamera.position.y -= shakeOffsetY;
    shakeCamera.position.z -= shakeOffsetZ;
  }
  for (let i = 0; i < kaijuPulseStateCount; i++) {
    const state = kaijuPulseStates[i];
    restorePulseState(state);
    state.entered = false;
    state.nextBeat = 0;
    state.needsCollect = true;
    if (state.legacy) state.needsBase = true;
    state.__rfTracked = false;
  }
  kaijuPulseStateCount = 0;
  kaijuPulseStates.length = 0;
  pendingFreezeMs = 0;
  pendingSlowmoScale = 1;
  pendingSlowmoMs = 0;
  slowmoResult.scale = 1;
  slowmoResult.ms = 0;
  shakeUntil = 0;
  shakeMax = 0;
  shakeClock = 0;
  shakeCamera = null;
  shakeOffsetX = 0;
  shakeOffsetY = 0;
  shakeOffsetZ = 0;
  shakeBaseX = 0;
  shakeBaseY = 0;
  shakeBaseZ = 0;
  juiceScene = null;
}

function shake(intensity, ms) {
  const target = juiceScene || (RF.ctx && RF.ctx.scene);
  const duration = clamp(ms, 1, 500);
  const amount = clamp(intensity, 0, 40);
  const now = nowMs(target);
  shakeClock = Math.max(shakeClock, now);
  if (now >= shakeUntil) shakeMax = 0;
  shakeMax = Math.max(shakeMax, amount);
  shakeUntil = Math.max(shakeUntil, now + duration);
  return shakeMax;
}

function applyShake(camera, dt) {
  if (!camera || !camera.position) return camera;
  const frameMs = clamp(dt == null ? 16.6667 : (dt <= 2 ? dt * 1000 : dt), 1, 50);
  const clockFromContext = RF.ctx && RF.ctx.time && typeof RF.ctx.time.now === 'number';
  if (!clockFromContext) shakeClock += frameMs;
  const now = nowMs(null);
  if (shakeCamera && shakeCamera !== camera) {
    const oldPosition = shakeCamera.position;
    const oldWasUnchanged = oldPosition && Math.abs(oldPosition.x - (shakeBaseX + shakeOffsetX)) < 0.001
      && Math.abs(oldPosition.y - (shakeBaseY + shakeOffsetY)) < 0.001
      && Math.abs(oldPosition.z - (shakeBaseZ + shakeOffsetZ)) < 0.001;
    if (oldWasUnchanged) {
      oldPosition.x -= shakeOffsetX;
      oldPosition.y -= shakeOffsetY;
      oldPosition.z -= shakeOffsetZ;
    }
    shakeOffsetX = 0; shakeOffsetY = 0; shakeOffsetZ = 0;
  }
  if (shakeCamera === camera) {
    const followsPrevious = Math.abs(camera.position.x - (shakeBaseX + shakeOffsetX)) < 0.001
      && Math.abs(camera.position.y - (shakeBaseY + shakeOffsetY)) < 0.001
      && Math.abs(camera.position.z - (shakeBaseZ + shakeOffsetZ)) < 0.001;
    if (followsPrevious) {
      camera.position.x -= shakeOffsetX;
      camera.position.y -= shakeOffsetY;
      camera.position.z -= shakeOffsetZ;
    }
  }
  shakeCamera = camera;
  shakeBaseX = camera.position.x;
  shakeBaseY = camera.position.y;
  shakeBaseZ = camera.position.z;
  if (now >= shakeUntil || shakeMax <= 0) {
    shakeOffsetX = 0; shakeOffsetY = 0; shakeOffsetZ = 0;
    return camera;
  }
  const life = clamp((shakeUntil - now) / Math.max(1, shakeUntil - (now - frameMs)), 0, 1);
  const envelope = life * life;
  const amount = shakeMax * envelope;
  shakeOffsetX = Math.sin(now * 0.061) * amount * 0.46;
  shakeOffsetY = Math.cos(now * 0.079 + 0.8) * amount * 0.32;
  shakeOffsetZ = Math.sin(now * 0.043 + 1.7) * amount * 0.08;
  camera.position.x += shakeOffsetX;
  camera.position.y += shakeOffsetY;
  camera.position.z += shakeOffsetZ;
  return camera;
}

function slowmo(scale, ms) {
  pendingSlowmoScale = Math.min(pendingSlowmoScale, clamp(scale, 0.05, 1));
  pendingSlowmoMs = Math.max(pendingSlowmoMs, clamp(ms, 1, 5000));
  return pendingSlowmoMs;
}

function consumeSlowmo() {
  if (pendingSlowmoMs <= 0) return null;
  slowmoResult.scale = pendingSlowmoScale;
  slowmoResult.ms = pendingSlowmoMs;
  pendingSlowmoScale = 1;
  pendingSlowmoMs = 0;
  return slowmoResult;
}

function paletteGlow(ent, palette) {
  if (ent && typeof ent._tint === 'number' && isFinite(ent._tint)) return ent._tint >>> 0;
  if (palette && palette.glow != null) return finite(palette.glow, 0x9effcb) >>> 0;
  const def = ent && (ent.def || ent.sharkDef);
  const sil = def && def.sil;
  return sil && sil.palette && sil.palette.glow != null
    ? finite(sil.palette.glow, 0x9effcb) >>> 0 : 0x9effcb;
}

function collectMaterials(node, state) {
  if (!node) return;
  if (node.material) {
    if (Array.isArray(node.material)) {
      for (let i = 0; i < node.material.length; i++) state.materials.push(node.material[i]);
    } else state.materials.push(node.material);
  }
  if (node.children) for (let i = 0; i < node.children.length; i++) collectMaterials(node.children[i], state);
}

function groupGlowState(group) {
  if (!group.userData) group.userData = {};
  let state = group.userData.__rfKaijuGlow;
  if (!state) {
    state = group.userData.__rfKaijuGlow = { materials: [], base: [], baseColor: [], needsCollect: true };
  }
  if (state.needsCollect) collectPulseState(state, group);
  else trackPulseState(state);
  return state;
}

function pulseGroup(group, palette, time) {
  const state = groupGlowState(group);
  const glow = paletteGlow(null, palette);
  const breath = 0.5 + 0.5 * Math.sin((finite(time, nowMs(null)) / 1000) * TAU * 0.4 - Math.PI / 2);
  for (let i = 0; i < state.materials.length; i++) {
    const material = state.materials[i];
    if (material.emissive && typeof material.emissive.setHex === 'function') {
      material.emissive.setHex(glow);
      material.emissiveIntensity = state.base[i] + 0.35 + breath * 1.05;
    } else if (material.color && typeof material.color.setHex === 'function') {
      material.color.setHex(mixColor(glow, WHITE, breath));
    }
  }
  return state.materials.length > 0;
}

function kaijuGlow(sprite, palette, time) {
  if (sprite && sprite.isObject3D) return pulseGroup(sprite, palette, time);
  if (!sprite || typeof sprite.setTint !== 'function') return false;
  legacyGlowState(sprite);
  const glow = paletteGlow(null, palette);
  const clock = finite(time, nowMs(null));
  /* 0.4 Hz, beginning at the palette glow and breathing toward white. */
  const breath = 0.5 + 0.5 * Math.sin((clock / 1000) * TAU * 0.4 - Math.PI / 2);
  try { sprite.setTint(mixColor(glow, WHITE, breath)); } catch (err) { return false; }
  return true;
}

function kaiju(entOrGroup, sceneTarget) {
  const source = entOrGroup;
  const group = source && source.group && source.group.isObject3D ? source.group
    : source && source.isObject3D ? source : null;
  const userData = group && group.userData ? group.userData : source && source.userData;
  const def = source && source.def;
  const defId = source && (source.defId || (def && def.id)) || userData && (userData.defId || userData.rfSharkId || userData.id);
  if (defId !== 'leviathanrex' && defId !== 'leviathan_rex') return false;
  const bodySprite = arguments.length > 2 ? arguments[2] : source && (source.rigBody || source.sprite);
  let palette = arguments.length > 3 ? arguments[3] : null;
  sceneTarget = sceneTarget || (RF.ctx && RF.ctx.scene) || juiceScene;
  if (sceneTarget && sceneTarget !== juiceScene) juiceScene = sceneTarget;
  const scratch = source && (source.st || (source.st = {}));
  const stateBag = scratch || (userData || (group ? (group.userData = {}) : {}));
  let state = stateBag._rfKaiju;
  const entityId = source && source.id != null ? source.id : group && group.uuid ? group.uuid : defId;
  if (source && source.active === false) {
    restorePulseState(state);
    return false;
  }
  if (!state || state.entityId !== entityId) {
    state = stateBag._rfKaiju = { entityId, entered: false, nextBeat: 0, materials: [], base: [], baseColor: [], needsCollect: true };
  }
  if (state.needsCollect) {
    if (group) collectPulseState(state, group);
    else {
      state.materials.length = 0;
      capturePulseBases(state);
    }
  } else {
    trackPulseState(state);
  }
  const time = nowMs(sceneTarget);
  if (!palette && userData && userData.palette) palette = userData.palette;
  const glowColor = paletteGlow(source, palette);
  if (!palette && def && def.sil && def.sil.palette) palette = def.sil.palette;
  if (!state.entered) {
    state.entered = true;
    state.nextBeat = time;
    RF.Sound.play('roar', { vol: 0.95 });
    RF.Sound.play('power_quake', { vol: 0.45 });
    shake(14, 360);
    const x = source && typeof source.x === 'number' ? source.x : group ? group.position.x : 0;
    const y = source && typeof source.y === 'number' ? source.y : group ? -group.position.y : 0;
    RF.Fx.emit('elementSpark', x, y, { tint: glowColor, scale: 1.4, count: 6 });
  }
  if (time >= state.nextBeat) {
    RF.Sound.play('power_quake', { vol: 0.38 });
    state.nextBeat = time + 850;
  }
  if (group) pulseGroup(group, palette, time);
  else if (bodySprite) kaijuGlow(bodySprite, palette, time);
  return true;
}

const Juice = {
  hitStop,
  consumeFreeze,
  shake,
  applyShake,
  slowmo,
  consumeSlowmo,
  reset: resetJuiceState,
  kaiju,
  kaijuGlow,
  __selftest() {
    resetJuiceState();
    pendingFreezeMs = 0;
    pendingSlowmoScale = 1;
    pendingSlowmoMs = 0;
    hitStop(36);
    const value = consumeFreeze();
    slowmo(0.35, 240);
    slowmo(0.6, 120);
    const slow = consumeSlowmo();
    const body = { tint: 0, setTint(v) { this.tint = v; return this; }, clearTint() { this.tint = 0; return this; } };
    const glowTint = 0x2c8f78;
    kaijuGlow(body, { glow: glowTint }, 0);
    const atGlow = body.tint;
    kaijuGlow(body, { glow: glowTint }, 1250);
    const atWhite = body.tint;
    const pass = value === 36 && consumeFreeze() === 0 && slow && slow.scale === 0.35 && slow.ms === 240 && consumeSlowmo() === null && atGlow === glowTint && atWhite === WHITE;
    resetJuiceState();
    return { pass, notes: [pass ? 'hit-stop accumulator consumed and reset' : 'hit-stop cycle failed', pass ? 'slowmo combines lowest scale and longest duration, then resets' : 'slowmo cycle failed', 'three.js camera shake is applied by RF.Juice.applyShake(camera, dt)', 'kaiju emissive glow breathes from palette glow to white at 0.4 Hz'] };
  },
};

RF.Fx = Fx;
RF.Juice = Juice;

/* --------------------------------------------------------------- Sound */
const audioState = { kit: null, ctx: null, noiseCtx: null, noiseBuffer: null, registered: false };
const SYNTH_SFX = {
  chomp: 'chomp', bubble: 'bubble', splash: 'splash',
  boost: 'boost', swimtrail: 'swimtrail', breach: 'splash',
  power_fire: 'fire', power_ice: 'ice', power_volt: 'volt', power_toxin: 'toxin',
  power_sonic: 'sonic', power_vortex: 'vortex', power_phase: 'phase',
  power_quake: 'quake', power_chrono: 'chrono', power_atomic: 'atomic',
  hurt: 'hurt', death: 'death', coin: 'coin', levelup: 'levelup',
  goldrush: 'goldrush', roar: 'roar',
};
const SYNTH_DURATION = {
  fire: 0.55, ice: 0.42, volt: 0.44, toxin: 0.68, sonic: 0.76,
  vortex: 0.7, phase: 0.56, quake: 0.78, chrono: 0.68, atomic: 1.7,
  hurt: 0.24, death: 0.86, coin: 0.2, levelup: 0.74, goldrush: 0.62,
  roar: 1.8, chomp: 0.2, bubble: 0.25, splash: 0.5, boost: 0.34, swimtrail: 0.16,
};
let lastSwimtrailMs = -Infinity;
const SWIMTRAIL_MIN_MS = 120;

function kitFor() {
  const ctx = RF.ctx;
  return ctx && ctx.kit ? ctx.kit : null;
}

function registerAssets(kit) {
  if (!kit || !kit.audio) return;
  if (audioState.kit === kit && audioState.registered) return;
  audioState.kit = kit;
  audioState.registered = true;
  if (typeof kit.audio.register !== 'function') return;
  const sfx = {};
  const music = {};
  const rows = data().SFX || {};
  const musicRows = data().MUSIC || {};
  eachKey(rows, (name, file) => { if (file) sfx[name] = 'assets/' + file; });
  eachKey(musicRows, (name, file) => { if (file) music[name] = 'assets/' + file; });
  try { kit.audio.register(sfx); kit.audio.register(music); } catch (err) {}
}

function exposedContext(kit) {
  const audio = kit && kit.audio;
  if (!audio) return null;
  let ctx = null;
  try { ctx = audio.context || audio.ctx || (typeof audio.getContext === 'function' ? audio.getContext() : null); } catch (err) { ctx = null; }
  return ctx && typeof ctx.createGain === 'function' ? ctx : null;
}

function audioContext(kit) {
  const ctx = exposedContext(kit);
  if (ctx) {
    audioState.ctx = ctx;
    return ctx;
  }
  if (audioState.ctx) return audioState.ctx;
  let AC = root.AudioContext || root.webkitAudioContext;
  if (!AC && typeof globalThis !== 'undefined') AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try { audioState.ctx = new AC(); } catch (err2) { audioState.ctx = null; }
  return audioState.ctx;
}

function unlock(kit, ctx) {
  if (kit && kit.audio && typeof kit.audio.resume === 'function') {
    try { kit.audio.resume(); } catch (err) {}
  }
  if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
    try { ctx.resume(); } catch (err2) {}
  }
}

function pref(kit, channel) {
  const prefs = kit && kit.audio && kit.audio.prefs;
  if (!prefs) return 1;
  if (prefs.mute) return 0;
  return prefs[channel] == null ? 1 : clamp(prefs[channel], 0, 1);
}

function outputNode(ctx, kit, channel, volume) {
  if (!ctx || typeof ctx.createGain !== 'function') return null;
  const out = ctx.createGain();
  const gain = clamp(volume, 0, 1) * pref(kit, channel);
  if (out.gain) out.gain.value = gain;
  const bus = kit && kit.audio && (channel === 'music' ? (kit.audio.musicGain || kit.audio.musicBus) : (kit.audio.sfxGain || kit.audio.sfxBus));
  try { out.connect(bus && typeof bus.connect === 'function' ? bus : ctx.destination); } catch (err) {}
  return out;
}

function paramValue(param, value) {
  if (!param) return;
  if (typeof param.setValueAtTime === 'function') param.setValueAtTime(value, audioState.ctx ? audioState.ctx.currentTime : 0);
  else param.value = value;
}

function ramp(param, value, at, when) {
  if (!param) return;
  if (typeof param.linearRampToValueAtTime === 'function') param.linearRampToValueAtTime(value, when + at);
  else param.value = value;
}

function tone(ctx, out, start, from, to, duration, type, volume, rate) {
  if (!ctx || typeof ctx.createOscillator !== 'function' || !out) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = finite(start, 0);
  const dur = Math.max(0.03, duration);
  const level = clamp(volume, 0, 1);
  try {
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(Math.max(20, from * rate), now);
    if (typeof osc.frequency.exponentialRampToValueAtTime === 'function') osc.frequency.exponentialRampToValueAtTime(Math.max(20, to * rate), now + dur);
    if (gain.gain && typeof gain.gain.setValueAtTime === 'function') {
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(level, now + Math.min(0.025, dur * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    } else if (gain.gain) gain.gain.value = level;
    osc.connect(gain); gain.connect(out);
    osc.start(now); osc.stop(now + dur + 0.03);
  } catch (err) {}
}

function noiseBuffer(ctx) {
  if (!ctx || typeof ctx.createBuffer !== 'function') return null;
  if (audioState.noiseBuffer && audioState.noiseCtx === ctx) return audioState.noiseBuffer;
  try {
    const length = Math.max(1, Math.floor((ctx.sampleRate || 44100) * 0.9));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate || 44100);
    const channel = buffer.getChannelData(0);
    let seed = 0x51f15e;
    for (let i = 0; i < channel.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      channel[i] = (seed / 4294967296) * 2 - 1;
    }
    audioState.noiseCtx = ctx;
    audioState.noiseBuffer = buffer;
    return buffer;
  } catch (err) { return null; }
}

function noise(ctx, out, start, duration, volume, lowpass, highpass) {
  if (!ctx || typeof ctx.createBufferSource !== 'function' || !out) return;
  const buffer = noiseBuffer(ctx);
  if (!buffer) return;
  try {
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    let node = src;
    if (typeof ctx.createBiquadFilter === 'function') {
      node = ctx.createBiquadFilter();
      node.type = highpass ? 'highpass' : 'lowpass';
      node.frequency.value = highpass || lowpass || 900;
      src.connect(node);
    } else src.connect(gain);
    if (node !== src) node.connect(gain);
    gain.connect(out);
    src.buffer = buffer;
    src.loop = true;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(clamp(volume, 0, 1), start + Math.min(0.04, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.start(start); src.stop(start + duration + 0.03);
  } catch (err) {}
}

function synthesize(kind, ctx, out, start, rate) {
  const dur = SYNTH_DURATION[kind] || 0.45;
  const r = clamp(rate, 0.5, 2.5);
  switch (kind) {
    case 'fire': tone(ctx, out, start, 170, 48, dur, 'sawtooth', 0.42, r); noise(ctx, out, start, dur * 0.8, 0.34, 1600, 0); break;
    case 'ice': tone(ctx, out, start, 980, 1960, dur, 'sine', 0.42, r); tone(ctx, out, start, 1480, 2360, dur * 0.55, 'triangle', 0.18, r); break;
    case 'volt': tone(ctx, out, start, 140, 940, dur, 'square', 0.35, r); noise(ctx, out, start, dur * 0.6, 0.25, 0, 2400); break;
    case 'toxin': tone(ctx, out, start, 180, 85, dur, 'sine', 0.28, r); noise(ctx, out, start, dur * 0.8, 0.24, 850, 0); break;
    case 'sonic': tone(ctx, out, start, 92, 38, dur, 'sine', 0.5, r); noise(ctx, out, start, dur * 0.45, 0.3, 280, 0); break;
    case 'vortex': tone(ctx, out, start, 780, 110, dur, 'sine', 0.34, r); tone(ctx, out, start, 220, 520, dur, 'triangle', 0.18, r); break;
    case 'phase': tone(ctx, out, start, 460, 1280, dur, 'sine', 0.3, r); tone(ctx, out, start, 880, 330, dur * 0.8, 'sine', 0.15, r); break;
    case 'quake': tone(ctx, out, start, 58, 30, dur, 'sine', 0.55, r); noise(ctx, out, start, dur, 0.35, 180, 0); break;
    case 'chrono': tone(ctx, out, start, 1100, 880, dur, 'square', 0.25, r); tone(ctx, out, start + 0.11, 680, 540, dur * 0.5, 'sine', 0.16, r); break;
    case 'atomic': tone(ctx, out, start, 120, 720, 0.95, 'sawtooth', 0.25, r); tone(ctx, out, start + 0.78, 80, 34, 0.9, 'sine', 0.6, r); noise(ctx, out, start + 0.72, 0.95, 0.4, 460, 0); break;
    case 'hurt': tone(ctx, out, start, 180, 70, dur, 'square', 0.36, r); break;
    case 'death': tone(ctx, out, start, 220, 34, dur, 'sawtooth', 0.45, r); noise(ctx, out, start, dur * 0.7, 0.23, 320, 0); break;
    case 'coin': tone(ctx, out, start, 880, 1320, dur, 'sine', 0.3, r); break;
    case 'levelup': tone(ctx, out, start, 440, 880, dur * 0.7, 'triangle', 0.3, r); tone(ctx, out, start + 0.18, 660, 1320, dur * 0.7, 'sine', 0.25, r); break;
    case 'goldrush': tone(ctx, out, start, 180, 360, dur, 'square', 0.22, r); tone(ctx, out, start + 0.12, 720, 1080, dur * 0.5, 'sine', 0.25, r); break;
    case 'roar': tone(ctx, out, start, 78, 30, dur, 'sawtooth', 0.7, r); noise(ctx, out, start, dur * 0.75, 0.48, 380, 0); break;
    case 'chomp': tone(ctx, out, start, 180, 45, dur, 'square', 0.3, r); break;
    case 'bubble': tone(ctx, out, start, 250, 620, dur, 'sine', 0.2, r); break;
    case 'boost': tone(ctx, out, start, 360, 82, dur, 'sine', 0.24, r); noise(ctx, out, start, dur * 0.72, 0.16, 1100, 260); break;
    case 'swimtrail': tone(ctx, out, start, 330, 760, dur * 0.72, 'sine', 0.2, r); tone(ctx, out, start + 0.055, 500, 930, dur * 0.58, 'sine', 0.12, r); break;
    case 'splash': noise(ctx, out, start, dur, 0.24, 1700, 0); break;
    default: tone(ctx, out, start, 220, 80, dur, 'sine', 0.2, r); break;
  }
}

function soundPlay(name, opts) {
  opts = opts || EMPTY;
  const rows = data().SFX || {};
  const playName = name === 'breach' ? 'splash' : name;
  const hasRow = Object.prototype.hasOwnProperty.call(rows, playName);
  const kind = SYNTH_SFX[name] || SYNTH_SFX[playName];
  if (!hasRow && !kind) return false;
  if (name === 'swimtrail') {
    const clock = audioState.ctx ? finite(audioState.ctx.currentTime, 0) * 1000 : nowMs(null);
    if (clock >= lastSwimtrailMs && clock - lastSwimtrailMs < SWIMTRAIL_MIN_MS) return true;
    lastSwimtrailMs = clock;
  }
  const kit = kitFor();
  registerAssets(kit);
  const volume = clamp(opts.vol == null ? (opts.volume == null ? 1 : opts.volume) : opts.vol, 0, 1);
  const rate = clamp(opts.rate == null ? 1 : opts.rate, 0.5, 2.5);
  const file = hasRow ? rows[playName] : null;
  if (file && kit && kit.audio && typeof kit.audio.sfx === 'function') {
    try { kit.audio.sfx(playName, { volume, rate }); } catch (err) {}
    return true;
  }
  if (!kind || pref(kit, 'sfx') <= 0) return !!kind;
  const ctx = audioContext(kit);
  if (!ctx) return true;
  unlock(kit, ctx);
  const out = outputNode(ctx, kit, 'sfx', volume);
  if (!out) return true;
  const start = finite(ctx.currentTime, 0);
  try { synthesize(kind, ctx, out, start, rate); } catch (err2) {}
  return true;
}

const Sound = {
  play: soundPlay,
  __selftest() {
    const rows = data().SFX || {};
    const notes = [];
    let pass = true;
    eachKey(rows, (name) => {
      if (!Object.prototype.hasOwnProperty.call(SYNTH_SFX, name)) pass = false;
    });
    const additions = ['boost', 'swimtrail', 'breach'];
    for (let i = 0; i < additions.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(SYNTH_SFX, additions[i])) pass = false;
    }
    notes.push(pass ? 'synth fallback table covers every RFD.SFX key plus boost, swimtrail, and breach' : 'synth fallback table is missing an SFX key');
    notes.push('file-backed entries use kit.audio.sfx; null entries use lazy WebAudio synthesis');
    notes.push('swimtrail synth is quiet and hard rate-limited; breach reuses splash');
    return { pass, notes };
  },
};
RF.Sound = Sound;

/* --------------------------------------------------------------- Music */
let musicLayer = null;
let musicOverlay = null;

function musicRamp(param, target, now, seconds) {
  if (!param) return;
  try {
    if (typeof param.cancelScheduledValues === 'function') param.cancelScheduledValues(now);
    if (typeof param.setValueAtTime === 'function') param.setValueAtTime(param.value || 0, now);
    if (typeof param.linearRampToValueAtTime === 'function') param.linearRampToValueAtTime(target, now + seconds);
    else param.value = target;
  } catch (err) { try { param.value = target; } catch (err2) {} }
}

function makeMusicOverlay(kit) {
  if (musicOverlay) return musicOverlay;
  const ctx = audioContext(kit);
  if (!ctx || typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function') return null;
  try {
    const out = outputNode(ctx, kit, 'music', 1);
    if (!out) return null;
    const bass = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bass.type = 'sawtooth';
    bass.frequency.value = 58;
    bassGain.gain.value = 0.035;
    bass.connect(bassGain); bassGain.connect(out);

    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0.045;
    const pulse = ctx.createOscillator();
    const pulseDepth = ctx.createGain();
    pulse.type = 'sine'; pulse.frequency.value = 2.2; pulseDepth.gain.value = 0.035;
    pulse.connect(pulseDepth); pulseDepth.connect(pulseGain.gain);
    const buffer = noiseBuffer(ctx);
    const noiseSource = buffer && typeof ctx.createBufferSource === 'function' ? ctx.createBufferSource() : null;
    if (noiseSource) {
      noiseSource.buffer = buffer; noiseSource.loop = true;
      if (typeof ctx.createBiquadFilter === 'function') {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 800;
        noiseSource.connect(filter); filter.connect(pulseGain);
      } else noiseSource.connect(pulseGain);
    }
    pulseGain.connect(out);
    const now = finite(ctx.currentTime, 0);
    out.gain.value = 0;
    bass.start(now); pulse.start(now);
    if (noiseSource) noiseSource.start(now);
    unlock(kit, ctx);
    musicOverlay = { ctx, out, bass, bassGain, pulseGain, pulse, depth: pulseDepth, noise: noiseSource };
    return musicOverlay;
  } catch (err) { return null; }
}

function setLayer(layer) {
  if (layer !== 'calm' && layer !== 'danger' && layer !== 'goldrush') return false;
  if (musicLayer === layer) return true;
  musicLayer = layer;
  const kit = kitFor();
  registerAssets(kit);
  if (!kit || !kit.audio) return true;
  if (typeof kit.audio.music === 'function') {
    try { kit.audio.music('calm', 700); } catch (err) {}
  }
  if (layer === 'calm') {
    if (musicOverlay) musicRamp(musicOverlay.out.gain, 0, finite(musicOverlay.ctx.currentTime, 0), 0.7);
    return true;
  }
  const overlay = makeMusicOverlay(kit);
  if (!overlay) return true;
  const target = layer === 'goldrush' ? 0.22 : 0.12;
  musicRamp(overlay.out.gain, target * pref(kit, 'music'), finite(overlay.ctx.currentTime, 0), 0.7);
  if (layer === 'goldrush') {
    overlay.bass.frequency.value = 82;
    overlay.pulse.frequency.value = 3.6;
  } else {
    overlay.bass.frequency.value = 58;
    overlay.pulse.frequency.value = 2.2;
  }
  return true;
}

const Music = {
  setLayer,
  __selftest() {
    const pass = setLayer('calm') && setLayer('danger') && setLayer('goldrush') && setLayer('calm');
    musicLayer = null;
    return { pass: !!pass, notes: ['calm uses kit.audio.music with its ownership token', 'danger and goldrush share one crossfaded synthesized overlay'] };
  },
};
RF.Music = Music;

function moduleSelftest() {
  const fx = Fx.__selftest();
  const juice = Juice.__selftest();
  const sound = Sound.__selftest();
  const music = Music.__selftest();
  return { pass: !!(fx.pass && juice.pass && sound.pass && music.pass), fx, juice, sound, music };
}

RF.__selftest3D = moduleSelftest;

export { Fx, Juice, Sound, Music, moduleSelftest as __selftest };
