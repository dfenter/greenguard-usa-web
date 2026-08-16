/* Tide Harbor - world.js
 * The islands, the harbour towns and everything that makes the horizon read as
 * a place: sculpted terrain with beach/scrub/rock banding, quays, warehouses and
 * townhouses whose windows light up at dusk, landmarks, cranes, moored boats,
 * chimney smoke, bunting, buoys that ride the swell, and gull flocks.
 */
import * as THREE from 'three';
import * as bake from './bake.js';
import { buildFlag, buildVessel } from './ship.js';
import { sampleSea } from './sea.js';

const TAU = Math.PI * 2;

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* -------------------------------------------------------------- terrain */

/**
 * Sculpted island: polar height field with ridges, a beach shelf and per-vertex
 * colour banding, so no large surface is a single flat fill.
 */
export function buildIsland(radius, palette, seed) {
  const random = rng(seed);
  const RINGS = 16;
  const SEGS = 30;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const ridges = [];
  for (let i = 0; i < 5; i++) ridges.push({ a: random() * TAU, w: 1.4 + random() * 2.6, h: 0.35 + random() * 0.7 });

  const beach = new THREE.Color(palette.beach);
  const scrub = new THREE.Color(palette.scrub);
  const rock = new THREE.Color(palette.rock);
  const peak = new THREE.Color(palette.peak);
  const c = new THREE.Color();

  function heightAt(r, theta) {
    if (r >= 1) return -1.5;
    let h = Math.pow(1 - r, 1.55);
    let ridge = 0;
    ridges.forEach((entry) => { ridge += Math.cos((theta - entry.a) * entry.w) * entry.h; });
    h *= 0.72 + 0.42 * (ridge / ridges.length + 0.5);
    const shelf = r > 0.78 ? (1 - (r - 0.78) / 0.22) * 0.08 : 0;
    return h * radius * 0.44 + shelf * radius;
  }

  for (let ring = 0; ring <= RINGS; ring++) {
    const r = ring / RINGS;
    for (let seg = 0; seg <= SEGS; seg++) {
      const theta = (seg / SEGS) * TAU;
      const wobble = 1 + Math.cos(theta * 3 + seed) * 0.09 + Math.sin(theta * 5.4 - seed) * 0.06;
      const rad = r * radius * wobble;
      const y = heightAt(r, theta);
      positions.push(Math.cos(theta) * rad, y, Math.sin(theta) * rad);
      uvs.push(Math.cos(theta) * r * 2.2 + 0.5, Math.sin(theta) * r * 2.2 + 0.5);
      const norm = clamp(y / (radius * 0.42), 0, 1);
      if (norm < 0.12) c.copy(beach).lerp(scrub, norm / 0.12);
      else if (norm < 0.48) c.copy(scrub).lerp(rock, (norm - 0.12) / 0.36);
      else c.copy(rock).lerp(peak, (norm - 0.48) / 0.52);
      const shade = 0.86 + random() * 0.28;
      colors.push(c.r * shade, c.g * shade, c.b * shade);
    }
  }
  for (let ring = 0; ring < RINGS; ring++) {
    for (let seg = 0; seg < SEGS; seg++) {
      const a = ring * (SEGS + 1) + seg;
      const b = a + 1;
      const d = a + SEGS + 1;
      const e = d + 1;
      indices.push(a, d, e, a, e, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, map: bake.rockGrain(0xffffff, 13), roughness: 0.95, metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.heightAt = heightAt;
  return mesh;
}

/** Wet sand collar that hides the island/water seam and takes shore foam. */
function beachCollar(radius, hex) {
  const geometry = new THREE.RingGeometry(radius * 0.86, radius * 1.22, 34, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: hex, map: bake.sandGrain(0xffffff, 29), roughness: 0.98, metalness: 0, transparent: true, opacity: 0.96,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.6;
  return mesh;
}

/* ------------------------------------------------------------ vegetation */

function palm(scale, random) {
  const group = new THREE.Group();
  const trunkPoints = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    trunkPoints.push(new THREE.Vector3(Math.sin(t * 1.1) * 3.2 * scale, t * 20 * scale, Math.cos(t * 0.7) * 1.4 * scale));
  }
  const trunk = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trunkPoints), 8, 1.1 * scale, 5, false),
    foliageMaterial(0x7a5a41)
  );
  group.add(trunk);
  const frondMaterial = foliageMaterial(0x3f7d5d);
  const tip = trunkPoints[trunkPoints.length - 1];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + random() * 0.4;
    const frond = new THREE.Mesh(new THREE.SphereGeometry(6.5 * scale, 6, 4), frondMaterial);
    frond.scale.set(1.7, 0.22, 0.5);
    frond.position.set(tip.x + Math.cos(a) * 6 * scale, tip.y - 1 * scale, tip.z + Math.sin(a) * 6 * scale);
    frond.rotation.y = -a;
    frond.rotation.z = -0.34;
    group.add(frond);
  }
  return group;
}

function pine(scale, random) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9 * scale, 1.5 * scale, 11 * scale, 6), foliageMaterial(0x5d4433));
  trunk.position.y = 5.5 * scale;
  group.add(trunk);
  const green = [0x2f6b52, 0x3a7a5c, 0x27594a][Math.floor(random() * 3)];
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry((8 - i * 2) * scale, (11 - i * 2) * scale, 7), foliageMaterial(green));
    cone.position.y = (10 + i * 5.5) * scale;
    group.add(cone);
  }
  return group;
}

/* Shared material caches. Baking a texture and a material per prop is what
 * stalls boot: every generator below is keyed to a small fixed variant set. */
const boulderMaterials = new Map();
function boulderMaterial(hex) {
  if (!boulderMaterials.has(hex)) {
    boulderMaterials.set(hex, new THREE.MeshStandardMaterial({
      color: hex, map: bake.rockGrain(0xffffff, 13), roughness: 0.96, metalness: 0.03,
    }));
  }
  return boulderMaterials.get(hex);
}
const foliageMaterials = new Map();
function foliageMaterial(hex) {
  if (!foliageMaterials.has(hex)) foliageMaterials.set(hex, bake.matteMaterial(hex));
  return foliageMaterials.get(hex);
}

function boulder(scale, hex, random) {
  const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), boulderMaterial(hex));
  mesh.rotation.set(random() * 3, random() * 3, random() * 3);
  mesh.scale.set(1, 0.66 + random() * 0.4, 0.86 + random() * 0.3);
  return mesh;
}

/* ---------------------------------------------------------------- towns */

/**
 * A harbour town: warehouses, townhouses and towers with an emissive window
 * map, tiled roofs, chimneys and bunting. lampAlpha drives the lit windows.
 */
export function buildTown(spec) {
  const group = new THREE.Group();
  const random = rng(spec.seed);
  const lit = [];
  const smoke = [];
  const roofColors = [0x9c4a41, 0x8a5f3c, 0x50606f, 0x7c4655];
  const wallColors = spec.walls || [0xe0d3b4, 0xd8c39c, 0xc9b79b, 0xe6dcc4];

  const count = spec.count || 11;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * spec.arc + spec.arcStart + (random() - 0.5) * 0.14;
    const rad = spec.radius * (0.78 + random() * 0.44);
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    const w = 14 + random() * 13;
    const d = 13 + random() * 11;
    const h = 16 + random() * (spec.tall ? 40 : 22);
    const wall = wallColors[Math.floor(random() * wallColors.length)];
    const material = new THREE.MeshStandardMaterial({
      color: wall, map: bake.facade(0xffffff, 3 + (i % 4)), roughness: 0.92, metalness: 0.02,
      emissive: 0xffffff, emissiveMap: bake.windowLights(5 + (i % 4)), emissiveIntensity: 0,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    body.position.set(x, h / 2 + (spec.lift || 0), z);
    body.rotation.y = -a + (random() - 0.5) * 0.5;
    group.add(body);
    lit.push(material);

    const roofHex = roofColors[Math.floor(random() * roofColors.length)];
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 9 + random() * 8, 4), new THREE.MeshStandardMaterial({
      color: roofHex, map: bake.rockGrain(0xffffff, 41), roughness: 0.9, metalness: 0.02,
    }));
    roof.position.set(x, h + 4.5 + (spec.lift || 0), z);
    roof.rotation.y = body.rotation.y + Math.PI / 4;
    group.add(roof);

    if (random() < 0.6) {
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.1, 8, 6), bake.matteMaterial(0x6e5648));
      chimney.position.set(x + (random() - 0.5) * w * 0.4, h + 8 + (spec.lift || 0), z + (random() - 0.5) * d * 0.4);
      group.add(chimney);
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({
        map: bake.blob('rgba(226,232,236,.6)', 'rgba(200,210,216,.16)'), transparent: true, depthWrite: false, opacity: 0.4,
      }));
      puff.scale.setScalar(14);
      puff.position.copy(chimney.position).setY(chimney.position.y + 8);
      group.add(puff);
      smoke.push({ sprite: puff, base: chimney.position.y + 6, phase: random() * TAU });
    }
  }

  /* quay wall and lamp posts */
  const quay = new THREE.Mesh(new THREE.CylinderGeometry(spec.radius * 1.26, spec.radius * 1.3, 7, 26, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x8f8672, map: bake.facade(0xffffff, 9), roughness: 0.95, side: THREE.DoubleSide }));
  quay.position.y = 3 + (spec.lift || 0);
  group.add(quay);

  const lampGlassMaterial = bake.lampMaterial(0xffcd88, 0);
  for (let i = 0; i < 7; i++) {
    const a = spec.arcStart + (i / 6) * spec.arc;
    const x = Math.cos(a) * spec.radius * 1.24;
    const z = Math.sin(a) * spec.radius * 1.24;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 15, 6), bake.trimMaterial(0x2b3540));
    post.position.set(x, 7.5 + (spec.lift || 0), z);
    group.add(post);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.9, 8, 6), lampGlassMaterial);
    head.position.set(x, 16 + (spec.lift || 0), z);
    group.add(head);
  }

  /* bunting between two posts, waving */
  const bunting = buildFlag(spec.radius * 0.5, 6, new THREE.MeshStandardMaterial({
    color: spec.accent || 0xf4c66d, roughness: 0.85, side: THREE.DoubleSide,
  }), 9);
  bunting.mesh.position.set(Math.cos(spec.arcStart) * spec.radius * 1.2, 20 + (spec.lift || 0), Math.sin(spec.arcStart) * spec.radius * 1.2);
  bunting.mesh.rotation.y = -spec.arcStart;
  group.add(bunting.mesh);

  return {
    group,
    update(time, lampAlpha, reduced) {
      lit.forEach((material, i) => { material.emissiveIntensity = lampAlpha * (1.15 + (i % 3) * 0.16); });
      lampGlassMaterial.emissiveIntensity = lampAlpha * 2.2;
      bunting.wave(time, 0.7, reduced);
      if (!reduced) {
        smoke.forEach((entry) => {
          const t = (time * 0.28 + entry.phase / TAU) % 1;
          entry.sprite.position.y = entry.base + t * 26;
          entry.sprite.material.opacity = 0.42 * (1 - t);
          entry.sprite.scale.setScalar(11 + t * 20);
        });
      }
    },
  };
}

/* ------------------------------------------------------------ landmarks */

export function buildLandmark(kind, accent) {
  const group = new THREE.Group();
  const lit = [];
  const stone = new THREE.MeshStandardMaterial({ color: 0xe6dcc0, map: bake.facade(0xffffff, 21), roughness: 0.9 });
  let beacon = null;
  if (kind === 'lighthouse') {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(11, 19, 96, 14), stone);
    tower.position.y = 48;
    group.add(tower);
    for (let i = 0; i < 4; i++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(11 + (3 - i) * 2.1, 12 + (3 - i) * 2.1, 9, 14), bake.paintMaterial(0xc4523f));
      band.position.y = 12 + i * 24;
      group.add(band);
    }
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 4, 14), bake.trimMaterial(0x2b3540));
    gallery.position.y = 97;
    group.add(gallery);
    const lampMaterial = bake.lampMaterial(0xfff0bd, 0.4);
    const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 14, 12), lampMaterial);
    lampRoom.position.y = 105;
    group.add(lampRoom);
    lit.push(lampMaterial);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(13, 16, 12), bake.trimMaterial(0x28323d));
    cap.position.y = 119;
    group.add(cap);
    beacon = new THREE.Mesh(new THREE.ConeGeometry(26, 210, 12, 1, true), new THREE.MeshBasicMaterial({
      color: 0xfff0bd, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false,
    }));
    beacon.rotation.z = Math.PI / 2;
    beacon.position.set(0, 105, 0);
    group.add(beacon);
  } else if (kind === 'wreck') {
    const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x50403c, map: bake.planking(0x50403c, 61), roughness: 0.95 });
    const ribs = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(16 - Math.abs(i - 4) * 1.5, 1.5, 5, 14, Math.PI), hullMaterial);
      rib.position.set((i - 4) * 10, 6, 0);
      rib.rotation.y = Math.PI / 2;
      rib.rotation.z = Math.PI;
      ribs.add(rib);
    }
    ribs.rotation.z = -0.30;
    group.add(ribs);
    const keel = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.2, 96, 7), hullMaterial);
    keel.rotation.z = Math.PI / 2 - 0.30;
    keel.position.y = 4;
    group.add(keel);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.6, 46, 7), hullMaterial);
    mast.rotation.z = 0.55;
    mast.position.set(-6, 22, 0);
    group.add(mast);
    const tatter = buildFlag(24, 18, new THREE.MeshStandardMaterial({ color: 0x9aa6c4, roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.72 }), 7);
    tatter.mesh.position.set(-14, 32, 0);
    group.userData.tatter = tatter;
    group.add(tatter.mesh);
  } else if (kind === 'market') {
    const raft = new THREE.Mesh(new THREE.CylinderGeometry(56, 60, 5, 20),
      new THREE.MeshStandardMaterial({ color: 0xb07d5c, map: bake.planking(0xb07d5c, 71), roughness: 0.94 }));
    raft.position.y = 2.5;
    group.add(raft);
    const tentColors = [0xed806e, 0xf4c66d, 0x62d5b7, 0x8ec9f4, 0xc48bd8];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const lampMaterial = bake.lampMaterial(0xffd08a, 0.3);
      const tent = new THREE.Mesh(new THREE.ConeGeometry(15, 20, 6), new THREE.MeshStandardMaterial({
        color: tentColors[i % tentColors.length], roughness: 0.9,
        emissive: tentColors[i % tentColors.length], emissiveIntensity: 0,
      }));
      tent.position.set(Math.cos(a) * 34, 16, Math.sin(a) * 34);
      group.add(tent);
      lit.push(tent.material);
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), lampMaterial);
      lantern.position.set(Math.cos(a) * 34, 28, Math.sin(a) * 34);
      group.add(lantern);
      lit.push(lampMaterial);
    }
  } else {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(20, 27, 18, 12), stone);
    base.position.y = 9;
    group.add(base);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(5, 10, 74, 10), stone);
    column.position.y = 54;
    group.add(column);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(13 - i * 2, 1.6, 6, 18), bake.trimMaterial(accent || 0xf4c66d));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 62 + i * 9;
      group.add(ring);
    }
    const lampMaterial = bake.lampMaterial(0xfff0bd, 0.4);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 9), lampMaterial);
    orb.position.y = 96;
    group.add(orb);
    lit.push(lampMaterial);
  }
  return {
    group,
    update(time, lampAlpha, reduced) {
      lit.forEach((material) => {
        material.emissiveIntensity = lampAlpha * (1.4 + (reduced ? 0 : Math.sin(time * 1.7) * 0.12));
      });
      if (beacon) {
        beacon.rotation.y = time * 0.75;
        beacon.material.opacity = 0.05 + lampAlpha * 0.16;
        beacon.visible = lampAlpha > 0.04;
      }
      if (group.userData.tatter) group.userData.tatter.wave(time, 0.9, reduced);
    },
  };
}

/* ------------------------------------------------------------------ quay */

/** A real pier: piles, stringers, decking, bollards, a crane and moored boats. */
export function buildPier(spec) {
  const group = new THREE.Group();
  const random = rng(spec.seed || 5);
  const deckMaterial = new THREE.MeshStandardMaterial({
    color: 0xa78261, map: bake.planking(0xa78261, 5), roughness: 0.94,
  });
  const pileMaterial = bake.matteMaterial(0x6d5340);
  const length = spec.length || 120;
  const width = spec.width || 26;

  const platform = new THREE.Mesh(new THREE.BoxGeometry(length, 3.2, width), deckMaterial);
  platform.position.y = 8;
  group.add(platform);
  const stringer = new THREE.Mesh(new THREE.BoxGeometry(length, 2.4, 2.4), bake.matteMaterial(0x5d4636));
  [-1, 1].forEach((side) => {
    const s = stringer.clone();
    s.position.set(0, 6, side * (width / 2 - 2));
    group.add(s);
  });
  for (let i = -3; i <= 3; i++) {
    [-1, 1].forEach((side) => {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.5, 22, 7), pileMaterial);
      pile.position.set(i * (length / 7), -2, side * (width / 2 - 2.5));
      group.add(pile);
    });
  }
  for (let i = -2; i <= 2; i += 2) {
    const bollard = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(2.4, 0), new THREE.Vector2(2.0, 4.5),
      new THREE.Vector2(2.8, 5.6), new THREE.Vector2(0, 6.2),
    ], 9), bake.trimMaterial(0x2b3540));
    bollard.position.set(i * (length / 6), 9.6, width / 2 - 4);
    group.add(bollard);
  }
  /* dockside crane with a swinging hook */
  const craneBase = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 6, 6, 9), bake.trimMaterial(0x39434f));
  craneBase.position.set(-length * 0.34, 12, -width * 0.22);
  group.add(craneBase);
  const craneMast = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.2, 34, 7), bake.trimMaterial(0x4a5563));
  craneMast.position.set(-length * 0.34, 30, -width * 0.22);
  group.add(craneMast);
  const jib = new THREE.Group();
  const jibArm = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 34, 6), bake.trimMaterial(0x4a5563));
  jibArm.rotation.z = Math.PI / 2 - 0.32;
  jibArm.position.set(15, 4, 0);
  jib.add(jibArm);
  const hookLine = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 20, 4), bake.matteMaterial(0x2a2a2a));
  hookLine.position.set(30, -6, 0);
  jib.add(hookLine);
  const crate = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 7), bake.matteMaterial(0x9a7448, bake.planking(0x9a7448, 3)));
  crate.position.set(30, -18, 0);
  jib.add(crate);
  jib.position.set(-length * 0.34, 44, -width * 0.22);
  group.add(jib);

  /* dock lanterns */
  const lampMaterial = bake.lampMaterial(0xffcd88, 0);
  for (let i = -1; i <= 1; i += 2) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 16, 6), bake.trimMaterial(0x2b3540));
    post.position.set(i * length * 0.42, 17, -width / 2 + 3);
    group.add(post);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), lampMaterial);
    lamp.position.set(i * length * 0.42, 26, -width / 2 + 3);
    group.add(lamp);
  }

  /* moored working boats that bob on the swell */
  const moored = [];
  for (let i = 0; i < 2; i++) {
    const boat = buildVessel({
      length: 20 + random() * 5, beam: 6.5, hull: [0x7b4a3f, 0x35606b][i], deck: 0xdcc08a,
      sail: 0xe8dcc0, accent: 0xed806e, seed: 90 + i, tier: 0, detail: false,
    });
    boat.group.position.set((i - 0.5) * length * 0.5, 0, width / 2 + 16);
    boat.group.rotation.y = 0.1 + random() * 0.2;
    group.add(boat.group);
    moored.push(boat);
  }

  return {
    group, moored,
    update(time, lampAlpha, reduced, energy) {
      lampMaterial.emissiveIntensity = lampAlpha * 2.4;
      jib.rotation.y = reduced ? 0.2 : 0.2 + Math.sin(time * 0.32) * 0.5;
      crate.rotation.y = time * 0.3;
      moored.forEach((boat, i) => {
        const wx = group.position.x + boat.group.position.x;
        const wz = group.position.z + boat.group.position.z;
        const s = sampleSea(wx, wz, time, energy);
        boat.group.position.y = s.y * 0.8;
        boat.group.rotation.z = reduced ? 0 : Math.atan2(s.nx, s.ny) * 0.8;
        boat.group.rotation.x = reduced ? 0 : Math.atan2(s.nz, s.ny) * 0.6;
        boat.pose({ time: time + i, pose: 'DOCKED', luff: 0.8, trim: 0.4, rudder: 0, speed: 0, lampAlpha, reduced });
      });
    },
  };
}

/* ----------------------------------------------------------------- life */

/** Pooled gull flock: simple flapping wings on a wide circling path. */
export function buildGulls(count) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0xf2f6f8, roughness: 0.9, side: THREE.DoubleSide });
  const birds = [];
  for (let i = 0; i < count; i++) {
    const bird = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 6, 5), material);
    body.scale.set(2.2, 0.7, 0.7);
    bird.add(body);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.6), material);
    left.position.z = 4.5;
    const right = left.clone();
    right.position.z = -4.5;
    left.rotation.x = -Math.PI / 2;
    right.rotation.x = -Math.PI / 2;
    bird.add(left, right);
    bird.userData = { left, right, phase: i * 1.7, radius: 90 + i * 34, speed: 0.19 + i * 0.024, height: 46 + i * 11 };
    group.add(bird);
    birds.push(bird);
  }
  return {
    group,
    update(time, cx, cz, reduced) {
      birds.forEach((bird) => {
        const u = bird.userData;
        const a = time * u.speed + u.phase;
        bird.position.set(cx + Math.cos(a) * u.radius, u.height + Math.sin(a * 2.4) * 8, cz + Math.sin(a) * u.radius * 0.75);
        bird.rotation.y = -a - Math.PI / 2;
        const flap = reduced ? 0 : Math.sin(time * 7 + u.phase) * 0.7;
        u.left.rotation.y = flap;
        u.right.rotation.y = -flap;
        bird.rotation.z = flap * 0.12;
      });
    },
  };
}

/** Channel buoy that rides the real swell and rings at night. */
export function buildBuoy(hex) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0, -4), new THREE.Vector2(3.4, -2.4), new THREE.Vector2(4.2, 1.2),
    new THREE.Vector2(2.6, 5.2), new THREE.Vector2(1.1, 6.4), new THREE.Vector2(0, 6.8),
  ], 10), bake.paintMaterial(hex));
  group.add(body);
  const cage = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.35, 4, 10), bake.trimMaterial(0x2b3540));
  cage.rotation.x = Math.PI / 2;
  cage.position.y = 7.6;
  group.add(cage);
  const lampMaterial = bake.lampMaterial(hex, 0.3);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), lampMaterial);
  lamp.position.y = 8.6;
  group.add(lamp);
  group.userData.lampMaterial = lampMaterial;
  return group;
}

/* -------------------------------------------------------------- islands */

/** Full island assembly: terrain, beach collar, scatter, and outlying rocks. */
export function buildIslandCluster(spec) {
  const group = new THREE.Group();
  const random = rng(spec.seed);
  const island = buildIsland(spec.radius, spec.palette, spec.seed);
  group.add(island);
  group.add(beachCollar(spec.radius, spec.palette.beach));

  const heightAt = island.userData.heightAt;
  const scatterCount = spec.scatter == null ? 22 : spec.scatter;
  for (let i = 0; i < scatterCount; i++) {
    const theta = random() * TAU;
    const r = 0.24 + random() * 0.62;
    const x = Math.cos(theta) * r * spec.radius;
    const z = Math.sin(theta) * r * spec.radius;
    const y = heightAt(r, theta) - 1;
    const scale = 0.6 + random() * 0.9;
    let prop;
    if (spec.flora === 'pine') prop = pine(scale, random);
    else if (spec.flora === 'rock') prop = boulder(5 * scale + 2, spec.palette.rock, random);
    else prop = random() < 0.72 ? palm(scale, random) : pine(scale * 0.8, random);
    prop.position.set(x, y, z);
    prop.rotation.y = random() * TAU;
    group.add(prop);
  }
  /* outlying sea stacks so the silhouette is never a plain dome */
  for (let i = 0; i < 4; i++) {
    const theta = random() * TAU;
    const rad = spec.radius * (1.05 + random() * 0.28);
    const stack = boulder(6 + random() * 10, spec.palette.rock, random);
    stack.position.set(Math.cos(theta) * rad, 1 + random() * 5, Math.sin(theta) * rad);
    stack.scale.y *= 1.6;
    group.add(stack);
  }
  group.position.set(spec.x, 0, spec.z);
  return { group, island, heightAt, radius: spec.radius };
}

export { lerp, clamp };
