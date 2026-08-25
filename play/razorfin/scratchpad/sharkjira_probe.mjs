import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
vm.runInThisContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), { filename: 'data.js' });
const { Art3D } = await import(pathToFileURL(path.join(root, 'shark3d.js')));
const THREE = await import(pathToFileURL(path.join(root, '../_shared/three/three.module.min.js')));
const rows = new Map(globalThis.RFD.SHARKS.map((row) => [row.id, row]));
const ids = ['reef', 'leviathanrex', 'megalodon', 'greatwhite'];
const records = new Map(ids.map((id) => [id, Art3D.buildShark(rows.get(id))]));

function vec(position, index) { return new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index)); }
function boxOf(record) {
  record.group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(record.parts.body);
}
function quantiles(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] || 0;
  return { min: sorted[0] || 0, p50: at(0.50), p90: at(0.90), p99: at(0.99), max: sorted[sorted.length - 1] || 0 };
}
function edgeSet(geometry) {
  const index = geometry.index;
  const edges = new Set();
  const add = (a, b) => edges.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
      add(a, b); add(b, c); add(c, a);
    }
  } else {
    const count = geometry.getAttribute('position').count;
    for (let i = 0; i < count; i += 3) { add(i, i + 1); add(i + 1, i + 2); add(i + 2, i); }
  }
  return edges;
}
function connectedComponents(geometry) {
  const position = geometry.getAttribute('position');
  const parent = Array.from({ length: position.count }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const index = geometry.index;
  for (let i = 0; i < (index ? index.count : position.count); i += 3) {
    const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
    join(a, b); join(b, c); join(c, a);
  }
  const counts = new Map();
  for (let i = 0; i < position.count; i++) counts.set(find(i), (counts.get(find(i)) || 0) + 1);
  return [...counts.values()].sort((a, b) => b - a);
}
function normalStats(geometry, baseGeometry = null) {
  const normal = geometry.getAttribute('normal');
  if (!normal) return { finite: false, lengths: null, adjacentDot: null };
  const lengths = [], dots = [], index = geometry.index, seen = new Map();
  for (let i = 0; i < normal.count; i++) {
    const n = new THREE.Vector3(normal.getX(i), normal.getY(i), normal.getZ(i)); lengths.push(n.length());
  }
  const add = (a, b) => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (seen.has(key)) { const prior = seen.get(key); const na = new THREE.Vector3(normal.getX(a), normal.getY(a), normal.getZ(a)); const nb = new THREE.Vector3(normal.getX(b), normal.getY(b), normal.getZ(b)); dots.push(prior.dot(na), prior.dot(nb)); }
    else seen.set(key, new THREE.Vector3(normal.getX(a), normal.getY(a), normal.getZ(a)));
  };
  for (let i = 0; i < (index ? index.count : normal.count); i += 3) {
    const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
    add(a, b); add(b, c); add(c, a);
  }
  let faceDots = null;
  if (baseGeometry?.index && index && baseGeometry.index.count === index.count) {
    const face = [], baseFace = [];
    const p = geometry.getAttribute('position'), bp = baseGeometry.getAttribute('position');
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2), ba = baseGeometry.index.getX(i), bb = baseGeometry.index.getX(i + 1), bc = baseGeometry.index.getX(i + 2);
      face.push(new THREE.Vector3().subVectors(vec(p, b), vec(p, a)).cross(new THREE.Vector3().subVectors(vec(p, c), vec(p, a))).normalize());
      baseFace.push(new THREE.Vector3().subVectors(vec(bp, bb), vec(bp, ba)).cross(new THREE.Vector3().subVectors(vec(bp, bc), vec(bp, ba))).normalize());
    }
    faceDots = quantiles(face.map((n, i) => n.dot(baseFace[i])));
  }
  return { finite: lengths.every(Number.isFinite), lengths: quantiles(lengths), adjacentDot: dots.length ? quantiles(dots) : null, faceVsBase: faceDots };
}
function diagnostic(id) {
  const record = records.get(id), body = record.parts.body, geometry = body.geometry;
  const position = geometry.getAttribute('position'), base = records.get('reef').parts.body.geometry.getAttribute('position');
  const deltas = [];
  for (let i = 0; i < Math.min(position.count, base.count); i++) deltas.push(vec(position, i).distanceTo(vec(base, i)));
  const roles = geometry.getAttribute('skinIndex');
  const bones = body.skeleton?.bones?.map((bone, i) => `${i}:${bone.name}`) || [];
  const index = geometry.index;
  const deg = new Uint32Array(position.count);
  if (index) for (let i = 0; i < index.count; i += 3) { deg[index.getX(i)]++; deg[index.getX(i + 1)]++; deg[index.getX(i + 2)]++; }
  const box = boxOf(record), groupBox = new THREE.Box3().setFromObject(record.group), localBox = geometry.boundingBox;
  const objects = [];
  record.group.traverse((object) => {
    if (!object.isMesh) return;
    object.updateMatrixWorld(true);
    const objectBox = object.isSkinnedMesh ? object.computeBoundingBox() || object.boundingBox : object.geometry.boundingBox;
    objects.push({ name: object.name, local: objectBox?.getSize(new THREE.Vector3()).toArray(), world: objectBox?.clone().applyMatrix4(object.matrixWorld).getSize(new THREE.Vector3()).toArray(), matrixWorld: object.matrixWorld.elements.slice(), scale: object.scale.toArray(), parent: object.parent?.name });
  });
  return {
    id,
    groupScale: record.group.scale.toArray(),
    vertices: position.count,
    triangles: index ? index.count / 3 : position.count / 3,
    localBox: { min: localBox.min.toArray(), max: localBox.max.toArray(), size: localBox.getSize(new THREE.Vector3()).toArray() },
    worldBox: { min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new THREE.Vector3()).toArray() },
    groupBox: { min: groupBox.min.toArray(), max: groupBox.max.toArray(), size: groupBox.getSize(new THREE.Vector3()).toArray() },
    displacementVsBaseSharky: quantiles(deltas),
    degree: quantiles([...deg]),
    components: connectedComponents(geometry).slice(0, 12),
    morph: record.group.userData.rfMorph,
    normalStats: normalStats(geometry, records.get('reef').parts.body.geometry),
    sharkjira: record.group.userData.rfSharkjira,
    featureMeshes: (() => { const out = []; record.group.traverse((object) => { if (object.isMesh && object !== body) out.push({ name: object.name, vertices: object.geometry.getAttribute('position')?.count, triangles: object.geometry.index ? object.geometry.index.count / 3 : 0 }); }); return out; })(),
    objects,
    bones: body.skeleton?.bones?.map((bone, i) => ({ index: i, name: bone.name, parent: bone.parent?.name || '', scale: bone.scale.toArray(), position: bone.position.toArray() })) || [],
    hasSkinIndex: !!roles
  };
}
console.log(JSON.stringify({ diagnostics: ids.map(diagnostic) }, null, 2));
