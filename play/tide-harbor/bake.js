/* Tide Harbor - bake.js
 * Procedural canvas texture bakery plus the shared material library.
 *
 * BAKE-BEFORE-BUILD RULE: every generator here finishes ALL canvas drawing and
 * only then constructs the THREE.CanvasTexture. Nothing in this file hands a
 * half-drawn canvas to the renderer, and nothing outside this file constructs a
 * texture from a canvas it is still painting.
 *
 * DEVICE-SCALE RULE (owner delta 2026-08-16): every canvas is allocated at the
 * device pixel ratio and the 2D context is pre-scaled, so a 3x iPhone gets a 3x
 * bake instead of an upscaled 1x one. All drawing below is in logical units.
 * Every large fill also gets a gradient plus a dither/noise pass, because flat
 * single-colour fills band badly and read as primitive.
 */
import * as THREE from 'three';

export const BAKE_SCALE = (function () {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  return Math.min(3, Math.max(1, Math.round(dpr)));
})();

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * BAKE_SCALE);
  c.height = Math.round((h || w) * BAKE_SCALE);
  const g = c.getContext('2d');
  g.scale(BAKE_SCALE, BAKE_SCALE);
  return { c, g, w, h: h || w };
}

function finish(c, repeatX, repeatY, srgb) {
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX || 1, repeatY || 1);
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  if (srgb !== false) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function memo(key, build) {
  if (cache.has(key)) return cache.get(key);
  const value = build();
  cache.set(key, value);
  return value;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}

/* One noise tile, built once with putImageData, then stamped. Doing this with
 * per-pixel fillRect calls costs tens of thousands of draws per texture and
 * stalls the main thread during boot. */
let noiseTile = null;
function noise() {
  if (noiseTile) return noiseTile;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  const image = g.createImageData(96, 96);
  const random = rng(0x5eed);
  for (let i = 0; i < 96 * 96; i++) {
    const v = 90 + Math.floor(random() * 76);
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  noiseTile = c;
  return c;
}

/** Dither / grain pass. Kills banding and lifts the distinct-colour count. */
function grain(g, w, h, seed, strength) {
  const amount = strength == null ? 0.055 : strength;
  const offset = ((seed || 1) * 37) % 96;
  g.save();
  g.globalAlpha = Math.min(0.5, amount * 3.2);
  g.globalCompositeOperation = 'overlay';
  const tile = noise();
  for (let y = -offset; y < h; y += 96) {
    for (let x = -offset; x < w; x += 96) g.drawImage(tile, x, y);
  }
  g.restore();
}

/** Two-stop vertical gradient fill so no large surface is one flat colour. */
function gradientFill(g, w, h, top, bottom) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}

function hexOf(color, mul) {
  return '#' + color.clone().multiplyScalar(mul).getHexString();
}

/* ------------------------------------------------------------- textures */

/** Fore-and-aft planking with caulk seams, nail dots, salt wash and grain. */
export function planking(hex, seed) {
  return memo('plank:' + hex + ':' + seed, function () {
    const { c, g, w, h } = canvas(384, 384);
    const base = new THREE.Color(hex);
    const random = rng(seed || 7);
    gradientFill(g, w, h, hexOf(base, 1.16), hexOf(base, 0.62));
    const rows = 24;
    const rowH = h / rows;
    for (let row = 0; row < rows; row++) {
      const shade = 0.84 + random() * 0.32;
      const y = row * rowH;
      const grad = g.createLinearGradient(0, y, 0, y + rowH);
      grad.addColorStop(0, hexOf(base, shade * 1.14));
      grad.addColorStop(0.55, hexOf(base, shade));
      grad.addColorStop(1, hexOf(base, shade * 0.82));
      g.fillStyle = grad;
      g.fillRect(0, y, w, rowH - 1);
      g.fillStyle = 'rgba(6,16,22,.46)';
      g.fillRect(0, y + rowH - 1.3, w, 1.3);
      g.fillStyle = 'rgba(255,255,255,.09)';
      g.fillRect(0, y, w, 0.9);
      for (let n = 0; n < 6; n++) {
        g.fillStyle = 'rgba(24,34,40,.34)';
        g.beginPath();
        g.arc(20 + random() * (w - 40), y + 4 + random() * (rowH - 8), 1.3, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (let i = 0; i < 40; i++) {
      const x = random() * w;
      g.fillStyle = 'rgba(226,238,240,' + (0.02 + random() * 0.05).toFixed(3) + ')';
      g.fillRect(x, 0, 1 + random() * 4, h);
    }
    /* boot stripe along the waterline */
    const boot = g.createLinearGradient(0, h * 0.9, 0, h);
    boot.addColorStop(0, 'rgba(9,26,36,0)');
    boot.addColorStop(0.25, 'rgba(9,26,36,.62)');
    boot.addColorStop(1, 'rgba(6,18,26,.78)');
    g.fillStyle = boot;
    g.fillRect(0, h * 0.9, w, h * 0.1);
    grain(g, w, h, seed || 7, 0.07);
    return finish(c, 3, 2);
  });
}

/** Woven sailcloth: warp/weft grain, seam tapes, reef points, sun bleaching. */
export function sailcloth(hex) {
  return memo('sail:' + hex, function () {
    const { c, g, w, h } = canvas(384, 384);
    const base = new THREE.Color(hex);
    const random = rng(19);
    gradientFill(g, w, h, hexOf(base, 1.1), hexOf(base, 0.78));
    g.strokeStyle = 'rgba(120,104,74,.11)';
    g.lineWidth = 0.8;
    for (let i = 0; i < w; i += 4) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const y = 24 + i * 46;
      g.fillStyle = 'rgba(120,104,74,.22)';
      g.fillRect(0, y, w, 3);
      g.fillStyle = 'rgba(255,255,255,.16)';
      g.fillRect(0, y + 3, w, 1.2);
    }
    for (let i = 0; i < 18; i++) {
      g.fillStyle = 'rgba(88,74,52,.55)';
      g.fillRect(16 + i * 20, h * 0.55, 2.2, 9);
    }
    for (let i = 0; i < 60; i++) {
      const x = random() * w, y = random() * h, r = 8 + random() * 40;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(150,132,96,.08)');
      grad.addColorStop(1, 'rgba(150,132,96,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    grain(g, w, h, 19, 0.05);
    return finish(c, 1, 1);
  });
}

/** Harbour building facade: stone courses, corner shading, weather streaks. */
export function facade(hex, seed) {
  return memo('facade:' + hex + ':' + seed, function () {
    const { c, g, w, h } = canvas(256, 256);
    const base = new THREE.Color(hex);
    const random = rng(seed || 3);
    gradientFill(g, w, h, hexOf(base, 1.18), hexOf(base, 0.66));
    const rows = 26;
    const rowH = h / rows;
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 ? 16 : 0;
      for (let col = -1; col < 9; col++) {
        const shade = 0.86 + random() * 0.3;
        g.fillStyle = hexOf(base, shade);
        g.fillRect(col * 32 + offset + 0.8, row * rowH + 0.8, 30.4, rowH - 1.6);
        g.fillStyle = 'rgba(255,255,255,.07)';
        g.fillRect(col * 32 + offset + 0.8, row * rowH + 0.8, 30.4, 1);
      }
    }
    for (let i = 0; i < 22; i++) {
      const x = random() * w;
      g.fillStyle = 'rgba(24,32,36,' + (0.03 + random() * 0.06).toFixed(3) + ')';
      g.fillRect(x, 0, 2 + random() * 5, h);
    }
    const cap = g.createLinearGradient(0, 0, 0, 12);
    cap.addColorStop(0, 'rgba(10,20,28,.34)');
    cap.addColorStop(1, 'rgba(10,20,28,0)');
    g.fillStyle = cap;
    g.fillRect(0, 0, w, 12);
    grain(g, w, h, seed || 3, 0.06);
    return finish(c, 2, 3);
  });
}

/** Emissive window grid. Every pane lit; the material fades it in at dusk. */
export function windowLights(seed) {
  return memo('windows:' + seed, function () {
    const { c, g, w, h } = canvas(256, 256);
    const random = rng(seed || 5);
    g.fillStyle = '#000000';
    g.fillRect(0, 0, w, h);
    const warmths = ['#ffd287', '#ffe9c4', '#ffbf6d', '#fff2d8', '#ffcf9a'];
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 6; col++) {
        if (random() < 0.22) continue;
        const x = 12 + col * 40;
        const y = 14 + row * 40;
        const warm = warmths[Math.floor(random() * warmths.length)];
        const grad = g.createRadialGradient(x + 10, y + 12, 1, x + 10, y + 12, 30);
        grad.addColorStop(0, warm);
        grad.addColorStop(0.34, 'rgba(255,190,110,.6)');
        grad.addColorStop(0.7, 'rgba(255,160,80,.2)');
        grad.addColorStop(1, 'rgba(255,150,70,0)');
        g.fillStyle = grad;
        g.fillRect(x - 20, y - 18, 60, 60);
        const pane = g.createLinearGradient(x, y, x, y + 24);
        pane.addColorStop(0, warm);
        pane.addColorStop(1, 'rgba(255,168,86,.75)');
        g.fillStyle = pane;
        g.fillRect(x, y, 20, 24);
        g.fillStyle = 'rgba(40,26,10,.8)';
        g.fillRect(x + 9.2, y, 1.8, 24);
        g.fillRect(x, y + 11.2, 20, 1.8);
      }
    }
    return finish(c, 2, 3);
  });
}

/** Radial soft blob used for contact shadows and glow sprites. */
export function blob(inner, outer) {
  return memo('blob:' + inner + ':' + outer, function () {
    const { c, g, w } = canvas(192, 192);
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.55, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
    const texture = new THREE.CanvasTexture(c);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    return texture;
  });
}

/** Soft-edged foam puff for wake, spray and splash particles. */
export function foamPuff() {
  return memo('foam', function () {
    const { c, g, w } = canvas(192, 192);
    const random = rng(41);
    const grad = g.createRadialGradient(w / 2, w / 2, 5, w / 2, w / 2, w / 2 - 2);
    grad.addColorStop(0, 'rgba(255,255,255,.96)');
    grad.addColorStop(0.34, 'rgba(240,253,252,.72)');
    grad.addColorStop(0.62, 'rgba(216,244,242,.38)');
    grad.addColorStop(1, 'rgba(196,236,234,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 46; i++) {
      const a = random() * Math.PI * 2;
      const r = w * (0.2 + random() * 0.28);
      g.beginPath();
      g.arc(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, 8 + random() * 20, 0, Math.PI * 2);
      g.fillStyle = 'rgba(0,0,0,' + (0.22 + random() * 0.5).toFixed(2) + ')';
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    const texture = new THREE.CanvasTexture(c);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    return texture;
  });
}

/** Long foam ribbon laid behind the hull. */
export function wakeStrip() {
  return memo('wake', function () {
    const { c, g, w, h } = canvas(192, 48);
    const random = rng(77);
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(255,255,255,.92)');
    grad.addColorStop(0.22, 'rgba(240,253,252,.66)');
    grad.addColorStop(0.55, 'rgba(224,247,245,.3)');
    grad.addColorStop(1, 'rgba(206,240,238,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const edge = g.createLinearGradient(0, 0, 0, h);
    edge.addColorStop(0, 'rgba(0,0,0,.55)');
    edge.addColorStop(0.5, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,.55)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = edge;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.beginPath();
      g.arc(random() * w, random() * h, 2 + random() * 7, 0, Math.PI * 2);
      g.fillStyle = 'rgba(0,0,0,' + (0.18 + random() * 0.55).toFixed(2) + ')';
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    const texture = new THREE.CanvasTexture(c);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    return texture;
  });
}

/** Rock / cliff grain for islands and reefs. */
export function rockGrain(hex, seed) {
  return memo('rock:' + hex + ':' + seed, function () {
    const { c, g, w, h } = canvas(256, 256);
    const base = new THREE.Color(hex);
    const random = rng(seed || 13);
    gradientFill(g, w, h, hexOf(base, 1.2), hexOf(base, 0.6));
    for (let i = 0; i < 140; i++) {
      const x = random() * w, y = random() * h, r = 5 + random() * 26;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, hexOf(base, 0.72 + random() * 0.6));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.42;
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 54; i++) {
      g.strokeStyle = 'rgba(20,26,26,' + (0.08 + random() * 0.14).toFixed(3) + ')';
      g.lineWidth = 0.6 + random() * 1.6;
      g.beginPath();
      g.moveTo(random() * w, random() * h);
      g.lineTo(random() * w, random() * h);
      g.stroke();
    }
    grain(g, w, h, seed || 13, 0.07);
    return finish(c, 2, 2);
  });
}

/** Sand / shingle beach band. */
export function sandGrain(hex, seed) {
  return memo('sand:' + hex + ':' + seed, function () {
    const { c, g, w, h } = canvas(256, 256);
    const base = new THREE.Color(hex);
    const random = rng(seed || 29);
    gradientFill(g, w, h, hexOf(base, 1.14), hexOf(base, 0.74));
    for (let i = 0; i < 260; i++) {
      g.fillStyle = hexOf(base, 0.7 + random() * 0.7);
      g.globalAlpha = 0.35;
      g.fillRect(random() * w, random() * h, 1.5 + random() * 3.4, 1.5 + random() * 3.4);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 12; i++) {
      g.strokeStyle = 'rgba(255,255,255,.05)';
      g.lineWidth = 2 + random() * 3;
      g.beginPath();
      const y = random() * h;
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + 12, w * 0.7, y - 12, w, y);
      g.stroke();
    }
    grain(g, w, h, seed || 29, 0.06);
    return finish(c, 3, 3);
  });
}

/** Small cube env map so metal and paint pick up a real horizon reflection. */
export function envCube() {
  return memo('env', function () {
    const faces = [];
    for (let i = 0; i < 6; i++) {
      const { c, g, w } = canvas(64, 64);
      if (i === 2) {
        const grad = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w * 0.7);
        grad.addColorStop(0, '#dff2f6');
        grad.addColorStop(1, '#69bcda');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, w);
      } else if (i === 3) {
        const grad = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w * 0.7);
        grad.addColorStop(0, '#12455a');
        grad.addColorStop(1, '#06192a');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, w);
      } else {
        const grad = g.createLinearGradient(0, 0, 0, w);
        grad.addColorStop(0, '#7ecbe4');
        grad.addColorStop(0.4, '#cfe9ec');
        grad.addColorStop(0.48, '#fff3d2');
        grad.addColorStop(0.54, '#1a5468');
        grad.addColorStop(1, '#08202f');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, w);
        g.fillStyle = 'rgba(255,246,214,.42)';
        g.fillRect(0, w * 0.46, w, w * 0.05);
      }
      grain(g, w, w, 200 + i, 0.04);
      faces.push(c);
    }
    const texture = new THREE.CubeTexture(faces);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  });
}

/* ------------------------------------------------------------ materials */

/** Metallic paint with clearcoat sheen and an environment reflection. */
export function paintMaterial(hex, map) {
  return new THREE.MeshStandardMaterial({
    color: hex, map: map || null, roughness: 0.38, metalness: 0.30,
    envMap: envCube(), envMapIntensity: 0.9,
  });
}

/** Dark fresnel-ish glass: low roughness, high reflection, semi transparent. */
export function glassMaterial(hex) {
  return new THREE.MeshStandardMaterial({
    color: hex || 0x0d2230, roughness: 0.08, metalness: 0.62, transparent: true, opacity: 0.62,
    envMap: envCube(), envMapIntensity: 1.6, depthWrite: false,
  });
}

/** Matte rubber / canvas / rope. */
export function matteMaterial(hex, map) {
  return new THREE.MeshStandardMaterial({ color: hex, map: map || null, roughness: 0.94, metalness: 0.0 });
}

/** Chrome or blackened trim. */
export function trimMaterial(hex) {
  return new THREE.MeshStandardMaterial({
    color: hex, roughness: 0.24, metalness: 0.92, envMap: envCube(), envMapIntensity: 1.25,
  });
}

/** Emissive lamp with the glass bulb visible. */
export function lampMaterial(hex, intensity) {
  return new THREE.MeshStandardMaterial({
    color: hex, emissive: hex, emissiveIntensity: intensity == null ? 1 : intensity,
    roughness: 0.5, metalness: 0,
  });
}

export function disposeAll() {
  cache.forEach((value) => { if (value && value.dispose) value.dispose(); });
  cache.clear();
}
