/* Tide Harbor - ship.js
 * Sculpted, lofted sailing hulls. No box primitives anywhere in the vessel:
 * the shell is a lofted station-profile surface with a real sheer line, rocker,
 * tumblehome, a stem and a raked transom. On top of it sit a cabin trunk with
 * separate dark glass and emissive portholes, a capped rail with stanchions,
 * standing and running rigging, a rudder and tiller, deck gear, lanterns and a
 * working crew.
 *
 * Sails are segmented meshes deformed every frame: they belly with fill and
 * flutter along the luff when the vessel points too high.
 */
import * as THREE from 'three';
import * as bake from './bake.js';

const HALF_PI = Math.PI / 2;

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1e-4)));
  return t * t * (3 - 2 * t);
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* ---------------------------------------------------- lofted hull surface */

/** The shared station maths. The hull surface and every fitting read from it. */
export function hullProfile(spec) {
  const L = spec.length;
  const B = spec.beam;
  const draft = spec.draft == null ? B * 0.46 : spec.draft;
  const freeboard = spec.freeboard == null ? B * 0.42 : spec.freeboard;
  return {
    L, B, draft, freeboard,
    halfBeam(s) {
      const taper = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.86)), 0.50);
      const transom = 0.46 * (1 - smoothstep(0.0, 0.24, s));
      return (B / 2) * Math.max(0.02, Math.max(taper, transom));
    },
    keelY(s) {
      const rise = Math.pow(Math.abs(s - 0.40) / 0.62, 2.1);
      const forefoot = smoothstep(0.72, 1.0, s) * 0.72;
      return -draft * Math.max(0.06, 1 - rise) * (1 - forefoot);
    },
    sheerY(s) {
      const sweep = Math.pow(Math.abs(s - 0.46) / 0.56, 1.85);
      return freeboard * (0.74 + 0.66 * sweep) + (s > 0.9 ? (s - 0.9) * L * 0.06 : 0);
    },
    flare(s) {
      return 1 + 0.30 * smoothstep(0.55, 1.0, s) - 0.14 * (1 - smoothstep(0.0, 0.5, s));
    },
    xAt(s) { return (s - 0.5) * L; },
  };
}

/** Loft the shell from the station profiles above. */
export function buildHullGeometry(spec) {
  const p = hullProfile(spec);
  const stations = spec.stations || 20;
  const girth = spec.girth || 14;
  const ringCount = girth * 2 + 1;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < stations; i++) {
    const s = i / (stations - 1);
    const x = p.xAt(s);
    const hb = p.halfBeam(s);
    const ky = p.keelY(s);
    const sy = p.sheerY(s);
    const fl = p.flare(s);
    for (let j = 0; j < ringCount; j++) {
      const a = -HALF_PI + Math.PI * (j / (ringCount - 1));
      const sa = Math.sin(a);
      const z = hb * Math.sign(sa) * Math.pow(Math.abs(sa), 1 / fl);
      const y = ky + (sy - ky) * (1 - Math.cos(a));
      positions.push(x, y, z);
      uvs.push(s * 2.4, (j / (ringCount - 1)) * 1.6);
    }
  }
  for (let i = 0; i < stations - 1; i++) {
    for (let j = 0; j < ringCount; j++) {
      const jn = (j + 1) % ringCount;
      const a = i * ringCount + j;
      const b = i * ringCount + jn;
      const c = (i + 1) * ringCount + jn;
      const d = (i + 1) * ringCount + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  /* Raked transom cap. */
  let cx = 0, cy = 0, cz = 0;
  for (let j = 0; j < ringCount; j++) {
    cx += positions[j * 3]; cy += positions[j * 3 + 1]; cz += positions[j * 3 + 2];
  }
  const centreIndex = positions.length / 3;
  positions.push(cx / ringCount - p.L * 0.018, cy / ringCount, cz / ringCount);
  uvs.push(0, 0.5);
  for (let j = 0; j < ringCount; j++) indices.push(centreIndex, (j + 1) % ringCount, j);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/* ------------------------------------------------------------- sail mesh */

function buildSail(foot, luff, material, cols, rows) {
  const nu = cols || 9;
  const nv = rows || 11;
  const positions = new Float32Array(nu * nv * 3);
  const uvs = [];
  const indices = [];
  for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) uvs.push(u / (nu - 1), v / (nv - 1));
  for (let v = 0; v < nv - 1; v++) {
    for (let u = 0; u < nu - 1; u++) {
      const a = v * nu + u;
      indices.push(a, a + 1, a + nu + 1, a, a + nu + 1, a + nu);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const rig = {
    mesh, geometry, nu, nv, foot, luff,
    /* skipNormals keeps distant AI sails cheap: the shape still animates, but
     * we do not pay computeVertexNormals for a ship the player cannot read. */
    deform(time, fill, luffAmount, reduced, skipNormals) {
      const array = geometry.attributes.position.array;
      const belly = 0.13 + fill * 0.30;
      const flap = reduced ? 0 : luffAmount;
      for (let v = 0; v < nv; v++) {
        const fv = v / (nv - 1);
        for (let u = 0; u < nu; u++) {
          const fu = u / (nu - 1);
          const chord = foot * (1 - fv * 0.92);
          const i = (v * nu + u) * 3;
          const camber = Math.sin(Math.PI * fu) * Math.sin(Math.PI * (0.1 + fv * 0.82)) * chord * belly;
          const flutter = flap * chord * 0.34 * Math.sin(time * 15 + fv * 6.5 + fu * 3.1) * (1 - fu * 0.7) * (0.2 + fv * 0.8);
          array[i] = -fu * chord;
          array[i + 1] = fv * luff;
          array[i + 2] = camber + flutter;
        }
      }
      geometry.attributes.position.needsUpdate = true;
      if (!skipNormals) geometry.computeVertexNormals();
    },
  };
  rig.deform(0, 0.6, 0, true);
  rig.geometry.computeVertexNormals();
  return rig;
}

/** A waving cloth strip used for ensigns, burgees and dock bunting. */
export function buildFlag(width, height, material, cols) {
  const nu = cols || 8;
  const nv = 4;
  const positions = new Float32Array(nu * nv * 3);
  const uvs = [];
  const indices = [];
  for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) uvs.push(u / (nu - 1), v / (nv - 1));
  for (let v = 0; v < nv - 1; v++) {
    for (let u = 0; u < nu - 1; u++) {
      const a = v * nu + u;
      indices.push(a, a + 1, a + nu + 1, a, a + nu + 1, a + nu);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const rig = {
    mesh,
    wave(time, strength, reduced) {
      const array = geometry.attributes.position.array;
      const s = reduced ? 0.08 : strength;
      for (let v = 0; v < nv; v++) {
        for (let u = 0; u < nu; u++) {
          const fu = u / (nu - 1);
          const fv = v / (nv - 1);
          const i = (v * nu + u) * 3;
          array[i] = -fu * width;
          array[i + 1] = (fv - 0.5) * height + Math.sin(time * 6 + fu * 5) * fu * height * 0.16 * s;
          array[i + 2] = Math.sin(time * 9.5 + fu * 7.5 + fv * 1.6) * fu * width * 0.26 * s;
        }
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
    },
  };
  rig.wave(0, 0.4, true);
  return rig;
}

/* ----------------------------------------------------------- deck detail */

function lathe(profile, segments, material) {
  return new THREE.Mesh(new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), segments || 10), material);
}

function rope(points, material, radius) {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(6, points.length * 3), radius || 0.22, 4, false), material);
}

function crewFigure(coatHex) {
  const group = new THREE.Group();
  const legs = lathe([[0, 0], [1.05, 0.4], [1.15, 3.4], [0.9, 4.4], [0, 4.6]], 8, bake.matteMaterial(0x2f3f52));
  group.add(legs);
  const torso = lathe([[0, 0], [1.35, 0.4], [1.55, 2.6], [1.1, 4.0], [0, 4.3]], 8, bake.matteMaterial(coatHex));
  torso.position.y = 4.5;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.05, 9, 7), bake.matteMaterial(0xcf9d78));
  head.position.y = 9.2;
  head.scale.set(0.92, 1.12, 0.96);
  group.add(head);
  const hat = lathe([[0, 0], [1.6, 0], [1.3, 0.45], [0.85, 1.4], [0, 1.55]], 8, bake.matteMaterial(0x1d2b3a));
  hat.position.y = 9.9;
  group.add(hat);
  const arm = lathe([[0, 0], [0.55, 0.3], [0.5, 3.4], [0, 3.7]], 6, bake.matteMaterial(coatHex));
  arm.position.set(0, 8.0, 1.35);
  arm.rotation.x = -0.5;
  group.add(arm);
  group.userData = { torso, head, arm };
  return group;
}

/* -------------------------------------------------------------- assembly */

/**
 * Build a full vessel. Returns a rig with a pose() the game calls every visual
 * frame. spec: { length, beam, hull, deck, sail, accent, seed, tier }
 */
export function buildVessel(spec) {
  const group = new THREE.Group();
  const L = spec.length;
  const B = spec.beam;
  const p = hullProfile({ length: L, beam: B });
  const seed = spec.seed || 7;
  const detail = spec.detail !== false;

  /* ---- shell */
  /* Planking is keyed on colour only: a per-ship seed would bake a fresh
   * texture for every hull in the world and stall the boot. */
  const hullMaterial = bake.paintMaterial(spec.hull, bake.planking(spec.hull, 7));
  hullMaterial.roughness = 0.42;
  hullMaterial.metalness = 0.24;
  hullMaterial.envMapIntensity = 0.9;
  const hull = new THREE.Mesh(buildHullGeometry({ length: L, beam: B, stations: 20, girth: 14 }), hullMaterial);
  group.add(hull);

  /* ---- inset deck sole so the hull reads hollow */
  const deckMaterial = bake.matteMaterial(spec.deck, bake.planking(spec.deck, 18));
  const deck = new THREE.Mesh(buildHullGeometry({
    length: L * 0.93, beam: B * 0.80, draft: B * 0.05, freeboard: B * 0.10, stations: 14, girth: 9,
  }), deckMaterial);
  deck.position.y = B * 0.30;
  group.add(deck);

  /* ---- capped rail following the true sheer, with stanchions */
  const trimMaterial = bake.trimMaterial(spec.accent || 0x2a3542);
  const railPoints = { port: [], stbd: [] };
  const STEPS = 13;
  for (let i = 0; i <= STEPS; i++) {
    const s = i / STEPS;
    const x = p.xAt(s);
    const hb = p.halfBeam(s) * 0.99;
    const y = p.sheerY(s) + B * 0.03;
    railPoints.stbd.push(new THREE.Vector3(x, y, hb));
    railPoints.port.push(new THREE.Vector3(x, y, -hb));
  }
  group.add(rope(railPoints.stbd, trimMaterial, B * 0.038));
  group.add(rope(railPoints.port, trimMaterial, B * 0.038));
  if (detail) {
    for (let i = 2; i <= STEPS - 1; i += 3) {
      [1, -1].forEach((side) => {
        const s = i / STEPS;
        const post = lathe([[0, 0], [B * 0.03, 0], [B * 0.026, B * 0.2], [0, B * 0.22]], 6, trimMaterial);
        post.position.set(p.xAt(s), p.sheerY(s) - B * 0.16, side * p.halfBeam(s) * 0.99);
        group.add(post);
      });
    }
  }

  /* ---- cabin trunk with separate dark glass and emissive portholes */
  const trunkShape = new THREE.Shape();
  const tw = B * 0.34, tl = L * 0.17, r = B * 0.09;
  trunkShape.moveTo(-tl + r, -tw);
  trunkShape.lineTo(tl - r, -tw);
  trunkShape.quadraticCurveTo(tl, -tw, tl, -tw + r);
  trunkShape.lineTo(tl, tw - r);
  trunkShape.quadraticCurveTo(tl, tw, tl - r, tw);
  trunkShape.lineTo(-tl + r, tw);
  trunkShape.quadraticCurveTo(-tl, tw, -tl, tw - r);
  trunkShape.lineTo(-tl, -tw + r);
  trunkShape.quadraticCurveTo(-tl, -tw, -tl + r, -tw);
  const trunkGeometry = new THREE.ExtrudeGeometry(trunkShape, {
    depth: B * 0.34, bevelEnabled: true, bevelSegments: 2, bevelSize: B * 0.035, bevelThickness: B * 0.03, curveSegments: 4,
  });
  trunkGeometry.rotateX(-Math.PI / 2);
  const trunk = new THREE.Mesh(trunkGeometry, bake.paintMaterial(spec.deck, bake.facade(0xffffff, 3)));
  trunk.position.set(-L * 0.13, B * 0.40, 0);
  group.add(trunk);
  const trunkRoof = lathe([[0, 0], [tw * 0.9, 0.2], [tw * 0.6, B * 0.09], [0, B * 0.11]], 10, trimMaterial);
  trunkRoof.scale.set(1, 1, tl / tw);
  trunkRoof.rotation.y = Math.PI / 2;
  trunkRoof.position.set(-L * 0.13, B * 0.74, 0);
  group.add(trunkRoof);

  const glassMaterial = bake.glassMaterial(0x0b2130);
  const portholeMaterial = bake.lampMaterial(0xffc478, 0);
  const portholes = [];
  [1, -1].forEach((side) => {
    for (let i = -1; i <= 1; i++) {
      const ring = lathe([[B * 0.05, 0], [B * 0.075, 0], [B * 0.075, B * 0.03], [B * 0.05, B * 0.03]], 10, trimMaterial);
      ring.rotation.x = HALF_PI * side;
      ring.position.set(-L * 0.13 + i * tl * 0.55, B * 0.58, side * (tw + B * 0.02));
      group.add(ring);
      const pane = new THREE.Mesh(new THREE.CircleGeometry(B * 0.055, 10), portholeMaterial);
      pane.rotation.y = HALF_PI * side;
      pane.position.set(-L * 0.13 + i * tl * 0.55, B * 0.58, side * (tw + B * 0.045));
      group.add(pane);
      portholes.push(pane);
    }
    const strake = new THREE.Mesh(new THREE.PlaneGeometry(tl * 1.5, B * 0.16), glassMaterial);
    strake.rotation.y = HALF_PI * side;
    strake.position.set(-L * 0.13, B * 0.66, side * (tw + B * 0.03));
    group.add(strake);
  });

  /* ---- companionway, skylight, deck gear */
  if (detail) {
    const hatch = lathe([[0, 0], [B * 0.13, 0], [B * 0.13, B * 0.1], [B * 0.09, B * 0.14], [0, B * 0.15]], 8, bake.matteMaterial(0x6d4c37));
    hatch.position.set(-L * 0.28, B * 0.36, 0);
    group.add(hatch);
    const capstan = lathe([[0, 0], [B * 0.09, 0], [B * 0.06, B * 0.08], [B * 0.085, B * 0.16], [0, B * 0.18]], 10, trimMaterial);
    capstan.position.set(L * 0.30, B * 0.36, 0);
    group.add(capstan);
    for (let i = 0; i < 2; i++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(B * 0.075, B * 0.022, 5, 12), bake.matteMaterial(0xbfa678));
      coil.rotation.x = HALF_PI;
      coil.position.set(L * (0.16 - i * 0.42), B * 0.35, (i ? 1 : -1) * B * 0.26);
      group.add(coil);
    }
    const barrel = lathe([[0, 0], [B * 0.10, 0.4], [B * 0.115, B * 0.12], [B * 0.10, B * 0.24], [0, B * 0.25]], 9, bake.matteMaterial(0x8a6242));
    barrel.position.set(L * 0.06, B * 0.35, B * 0.24);
    group.add(barrel);
  }

  /* ---- spars */
  const sparMaterial = bake.matteMaterial(0xe3d3ae);
  const mastHeight = L * 1.30 + (spec.tier || 0) * L * 0.05;
  const mastX = L * 0.05;
  const mast = lathe([[B * 0.055, 0], [B * 0.05, mastHeight * 0.62], [B * 0.032, mastHeight], [0, mastHeight + B * 0.06]], 9, sparMaterial);
  mast.position.set(mastX, B * 0.3, 0);
  group.add(mast);
  const boomLength = L * 0.62;
  const boom = lathe([[B * 0.035, 0], [B * 0.03, boomLength]], 7, sparMaterial);
  const boomPivot = new THREE.Group();
  boom.rotation.z = HALF_PI;
  boom.position.set(0, 0, 0);
  boomPivot.add(boom);
  boomPivot.position.set(mastX, B * 0.62, 0);
  group.add(boomPivot);

  const bowsprit = lathe([[B * 0.045, 0], [B * 0.024, L * 0.34]], 7, sparMaterial);
  bowsprit.rotation.z = -HALF_PI * 0.86;
  bowsprit.position.set(L * 0.50, p.sheerY(1) * 0.6 + B * 0.1, 0);
  group.add(bowsprit);
  const spritTip = new THREE.Vector3(L * 0.50 + L * 0.32, p.sheerY(1) * 0.6 + B * 0.24, 0);

  /* ---- standing rigging */
  const ropeMaterial = bake.matteMaterial(0x3d3428);
  const mastTop = new THREE.Vector3(mastX, B * 0.3 + mastHeight, 0);
  [1, -1].forEach((side) => {
    const foot = new THREE.Vector3(mastX - L * 0.06, p.sheerY(0.55), side * p.halfBeam(0.55) * 0.95);
    group.add(rope([mastTop.clone(), foot.clone().lerp(mastTop, 0.45).setY(mastTop.y * 0.5), foot], ropeMaterial, B * 0.016));
  });
  group.add(rope([mastTop.clone(), new THREE.Vector3(mastX + L * 0.2, mastTop.y * 0.55, 0), spritTip.clone()], ropeMaterial, B * 0.016));
  group.add(rope([mastTop.clone(), new THREE.Vector3(mastX - L * 0.24, mastTop.y * 0.5, 0), new THREE.Vector3(-L * 0.46, p.sheerY(0.04), 0)], ropeMaterial, B * 0.016));

  /* ---- sails */
  const sailMaterial = new THREE.MeshStandardMaterial({
    color: spec.sail, map: bake.sailcloth(spec.sail), roughness: 0.88, metalness: 0,
    side: THREE.DoubleSide,
  });
  const mainsail = buildSail(boomLength * 0.94, mastHeight * 0.80, sailMaterial, 9, 12);
  mainsail.mesh.position.set(mastX - B * 0.06, B * 0.66, 0);
  mainsail.mesh.rotation.y = 0;
  const mainPivot = new THREE.Group();
  mainPivot.position.set(mastX, B * 0.62, 0);
  mainsail.mesh.position.set(-B * 0.06, B * 0.04, 0);
  mainPivot.add(mainsail.mesh);
  group.add(mainPivot);

  const jibMaterial = sailMaterial.clone();
  jibMaterial.map = bake.sailcloth(spec.sail);
  const jib = buildSail(L * 0.42, mastHeight * 0.58, jibMaterial, 7, 9);
  const jibPivot = new THREE.Group();
  jibPivot.position.set(L * 0.42, B * 0.5, 0);
  jib.mesh.rotation.y = Math.PI;
  jibPivot.add(jib.mesh);
  group.add(jibPivot);

  /* ---- telltales on the shrouds */
  const telltaleMaterial = new THREE.MeshBasicMaterial({ color: spec.accent || 0xed806e, side: THREE.DoubleSide });
  const telltales = [1, -1].map((side) => {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(B * 0.24, B * 0.05), telltaleMaterial);
    t.position.set(mastX - L * 0.02, B * 0.3 + mastHeight * 0.55, side * B * 0.12);
    group.add(t);
    return t;
  });

  /* ---- rudder and tiller */
  const rudderPivot = new THREE.Group();
  const rudderShape = new THREE.Shape();
  rudderShape.moveTo(0, 0);
  rudderShape.lineTo(-L * 0.10, 0);
  rudderShape.lineTo(-L * 0.075, -B * 0.62);
  rudderShape.lineTo(0, -B * 0.55);
  rudderShape.closePath();
  const rudderGeometry = new THREE.ExtrudeGeometry(rudderShape, { depth: B * 0.05, bevelEnabled: true, bevelSize: B * 0.012, bevelThickness: B * 0.012, bevelSegments: 1 });
  rudderGeometry.translate(0, 0, -B * 0.025);
  const rudder = new THREE.Mesh(rudderGeometry, hullMaterial);
  rudderPivot.add(rudder);
  rudderPivot.position.set(-L * 0.50, B * 0.06, 0);
  group.add(rudderPivot);
  const tiller = lathe([[B * 0.028, 0], [B * 0.02, L * 0.18]], 6, sparMaterial);
  tiller.rotation.z = HALF_PI * 0.86;
  tiller.position.set(-L * 0.48, B * 0.36, 0);
  const tillerPivot = new THREE.Group();
  tillerPivot.position.set(-L * 0.48, B * 0.36, 0);
  tiller.position.set(0, 0, 0);
  tillerPivot.add(tiller);
  group.add(tillerPivot);

  /* ---- lanterns and running lights */
  const lampMaterials = {
    stern: bake.lampMaterial(0xffbb6a, 0.4),
    bow: bake.lampMaterial(0xd8f4ff, 0.4),
    mast: bake.lampMaterial(0xffe0a8, 0.4),
  };
  const sternLamp = lathe([[0, 0], [B * 0.07, 0.3], [B * 0.075, B * 0.13], [B * 0.04, B * 0.18], [0, B * 0.19]], 8, lampMaterials.stern);
  sternLamp.position.set(-L * 0.44, p.sheerY(0.06) + B * 0.06, 0);
  group.add(sternLamp);
  const bowLamp = lathe([[0, 0], [B * 0.055, 0.3], [B * 0.06, B * 0.1], [0, B * 0.15]], 8, lampMaterials.bow);
  bowLamp.position.set(L * 0.44, p.sheerY(0.94) + B * 0.06, 0);
  group.add(bowLamp);
  const mastLamp = new THREE.Mesh(new THREE.SphereGeometry(B * 0.05, 8, 6), lampMaterials.mast);
  mastLamp.position.set(mastX, B * 0.3 + mastHeight * 0.98, 0);
  group.add(mastLamp);
  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: bake.blob('rgba(255,206,140,.95)', 'rgba(255,170,80,.28)'), transparent: true, depthWrite: false, opacity: 0,
  }));
  glowSprite.scale.setScalar(B * 1.6);
  glowSprite.position.copy(sternLamp.position);
  group.add(glowSprite);

  /* ---- ensign at the masthead */
  const ensign = buildFlag(L * 0.30, L * 0.17, new THREE.MeshStandardMaterial({
    color: spec.accent || 0xf4c66d, roughness: 0.85, side: THREE.DoubleSide,
  }), 8);
  ensign.mesh.position.set(mastX - B * 0.03, B * 0.3 + mastHeight * 0.90, 0);
  ensign.mesh.rotation.y = HALF_PI;
  group.add(ensign.mesh);

  /* ---- crew */
  let helm = null, hand = null;
  if (detail) {
    helm = crewFigure(0x2c5f7a);
    helm.scale.setScalar(B / 11);
    helm.position.set(-L * 0.36, B * 0.34, B * 0.10);
    group.add(helm);
    hand = crewFigure(0x8a5a3c);
    hand.scale.setScalar(B / 11.6);
    hand.position.set(L * 0.14, B * 0.34, -B * 0.22);
    group.add(hand);
  }

  /* ---- contact shadow */
  /* Contact darkening under the hull. On water this has to stay a whisper:
   * a hard blob reads as a grey splotch riding on the swell. */
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(L * 1.05, B * 1.9),
    new THREE.MeshBasicMaterial({ map: bake.blob('rgba(4,18,26,.34)', 'rgba(4,18,26,.08)'), transparent: true, depthWrite: false, opacity: 0.3 })
  );
  shadow.rotation.x = -HALF_PI;
  shadow.position.y = -B * 0.18;
  group.add(shadow);

  /* ------------------------------------------------------------- pose */
  const state = { blend: 0, blendVel: 0, lastPose: '', reef: 0, crewPhase: 0, tick: 0 };
  const POSE_TARGET = { IDLE: 0, DOCKED: 0.05, SAILING: 0.55, BOOST: 1, 'STORM RUN': 0.82 };
  const cheap = spec.detail === false;

  function pose(o) {
    const time = o.time;
    const reduced = !!o.reduced;
    state.tick++;
    /* Distant AI hulls only re-shape their canvas every third frame. */
    const shapeSails = !cheap || state.tick % 3 === 0;
    const target = POSE_TARGET[o.pose] == null ? 0.5 : POSE_TARGET[o.pose];
    /* anticipation + one overshoot on every state change, then recovery */
    const dt = 1 / 60;
    state.blendVel += (target - state.blend) * 190 * dt;
    state.blendVel *= Math.exp(-13 * dt);
    state.blend += state.blendVel * dt;
    const blend = reduced ? target : state.blend;

    const fill = clamp(1 - o.luff, 0, 1) * (0.35 + blend * 0.65);
    const reefTarget = o.pose === 'STORM RUN' ? 0.42 : o.pose === 'DOCKED' ? 0.86 : 0;
    state.reef += (reefTarget - state.reef) * 0.09;

    const trimAngle = o.trim;
    boomPivot.rotation.y = trimAngle;
    mainPivot.rotation.y = trimAngle;
    jibPivot.rotation.y = trimAngle * 0.62;
    mainsail.mesh.scale.set(1, 1 - state.reef * 0.55, 1);
    jib.mesh.scale.set(1 - state.reef * 0.4, 1 - state.reef * 0.5, 1);
    if (shapeSails) {
      mainsail.deform(time, fill, o.luff, reduced, cheap);
      jib.deform(time * 1.12, fill * 0.9, o.luff * 0.8, reduced, cheap);
    }
    mainsail.mesh.visible = state.reef < 0.8;

    telltales.forEach((t, i) => {
      t.rotation.z = reduced ? 0 : Math.sin(time * (8 + i * 1.4)) * (0.1 + o.luff * 0.85);
      t.rotation.y = -trimAngle * 0.4;
      t.visible = !cheap && o.pose !== 'DOCKED';
    });
    if (shapeSails) ensign.wave(time, 0.4 + blend * 0.9, reduced);

    rudderPivot.rotation.y = -o.rudder * 0.62;
    tillerPivot.rotation.y = o.rudder * 0.5;

    const lampAlpha = clamp(o.lampAlpha, 0, 1);
    const stormLift = o.pose === 'STORM RUN' ? 0.5 : 0;
    lampMaterials.stern.emissiveIntensity = 0.25 + lampAlpha * 1.5 + stormLift;
    lampMaterials.bow.emissiveIntensity = 0.2 + lampAlpha * 1.3;
    lampMaterials.mast.emissiveIntensity = 0.2 + lampAlpha * 1.6 + (reduced ? 0 : Math.sin(time * 2.2) * 0.12 * lampAlpha);
    portholeMaterial.emissiveIntensity = lampAlpha * 1.9 + (o.pose === 'DOCKED' ? 0.55 : 0);
    portholeMaterial.color.setHex(0xffc478);
    glowSprite.material.opacity = lampAlpha * 0.65;

    if (helm) {
      state.crewPhase += dt * (o.pose === 'BOOST' ? 7 : o.pose === 'STORM RUN' ? 5.5 : 2.2);
      const lean = reduced ? 0 : Math.sin(state.crewPhase) * 0.06;
      helm.rotation.y = -o.rudder * 0.55;
      helm.rotation.z = lean * 0.5 - blend * 0.06;
      helm.userData.arm.rotation.x = -0.5 - o.rudder * 0.5;
      helm.userData.head.rotation.y = o.rudder * 0.7;
      const haul = o.pose === 'BOOST' || o.pose === 'STORM RUN' ? 1 : 0;
      hand.rotation.z = (reduced ? 0 : Math.sin(state.crewPhase * 1.3) * 0.10) * haul - 0.05;
      hand.userData.arm.rotation.x = -0.4 - haul * (0.7 + (reduced ? 0 : Math.sin(state.crewPhase * 1.3) * 0.45));
      hand.userData.torso.rotation.x = haul * 0.22;
      hand.visible = o.pose !== 'DOCKED';
    }

    shadow.material.opacity = 0.20 + clamp(o.speed / 140, 0, 0.12);
    hullMaterial.envMapIntensity = 0.35 + (1 - lampAlpha) * 0.75;
    return blend;
  }

  return {
    group, hull, deck, mainsail, jib, ensign, rudderPivot, portholes, shadow,
    materials: { hull: hullMaterial, deck: deckMaterial, sail: sailMaterial, lamps: lampMaterials, porthole: portholeMaterial },
    mastTop, spritTip, pose,
    dispose() {
      group.traverse((node) => {
        if (node.geometry) node.geometry.dispose();
      });
    },
  };
}

/** Lighter AI trader: same lofted shell, one sail, no crew or deck gear. */
export function buildTrader(spec) {
  const rig = buildVessel({ ...spec, detail: false });
  return rig;
}
