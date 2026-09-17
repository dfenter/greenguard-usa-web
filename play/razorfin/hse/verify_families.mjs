/* Lane S3 (rev17): family GLB + row texture budget/contract gate.
 *
 * Verifies every assets/models/fam/*.glb against the rev17 family contract
 * (see PLAN-rev17-families.md, Verification section):
 *   - tris <= 9000
 *   - file size <= 1.0 MB
 *   - exactly one skinned mesh
 *   - bone set == {Tail3,Tail2,Tail1,Spine2,Spine1,Neck,Head,LowerJaw}
 *     (exact set match, not just "contains")
 *   - zero orphan skin weights (a vertex with nonzero skinWeight pointing at
 *     a joint index outside the skin's joints array, or a weight assigned
 *     to slot 0 that sums to 0 across all 4 slots on a mesh that IS skinned)
 *   - every embedded texture <= 1024x1024
 * and every assets/textures/rows/*.jpg against:
 *   - file size <= 180 KB
 *
 * No assets/models/fam/*.glb exist yet (rev17 pipeline has not shipped a
 * family GLB). Per the S3 brief, this script is proven by running it against
 * the four approved bases as stand-ins (assets/models/greatwhite_cy.glb,
 * thresher.glb, tigershark.glb, whaler.glb) plus one synthetically bad GLB
 * this script generates on demand (BAD=1), so both the pass and fail paths
 * are demonstrated.
 *
 * Usage:
 *   node hse/verify_families.mjs                  # real assets/models/fam + assets/textures/rows
 *   STANDINS=1 node hse/verify_families.mjs        # + the four base GLBs as stand-ins
 *   BAD=1 node hse/verify_families.mjs             # + a synthetic bad GLB proving the gate fails
 *
 * Exit code is non-zero if any checked file fails any assertion.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REQUIRED_BONES = ['Tail3', 'Tail2', 'Tail1', 'Spine2', 'Spine1', 'Neck', 'Head', 'LowerJaw'];
const MAX_TRIS = 9000;
const MAX_GLB_MB = 1.0;
const MAX_TEX_PX = 1024;
const MAX_ROW_JPG_KB = 180;

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb: ' + file);
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === 0x004e4942) bin = body;
    off += 8 + len;
    off += (4 - (off % 4)) % 4;
  }
  return { json, bin, size: buf.length };
}

/* Minimal JPEG/PNG dimension sniff (no decode needed for a size gate). */
function imageDims(bytes) {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    // PNG: width/height are big-endian u32 at offset 16/20
    return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // JPEG: scan markers for the first SOFn frame
    let off = 2;
    while (off < bytes.length - 9) {
      if (bytes[off] !== 0xff) { off++; continue; }
      const marker = bytes[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const h = bytes.readUInt16BE(off + 5);
        const w = bytes.readUInt16BE(off + 7);
        return { w, h };
      }
      const len = bytes.readUInt16BE(off + 2);
      off += 2 + len;
    }
  }
  return { w: null, h: null };
}

function glbAccessorCount(json, idx) {
  return json.accessors[idx].count;
}

function inspectGlb(file) {
  const name = path.basename(file);
  const fails = [];
  let json, bin, size;
  try { ({ json, bin, size } = readGlb(file)); }
  catch (e) { return { name, fails: ['UNREADABLE: ' + e.message], tris: null, mb: null, skinned: null, bones: null, orphan: null, texMax: null }; }

  const mb = +(size / 1048576).toFixed(3);
  if (mb > MAX_GLB_MB) fails.push(`file ${mb}MB > ${MAX_GLB_MB}MB`);

  // triangle count across all mesh primitives (mode 4 / default)
  let tris = 0;
  const skinnedMeshes = [];
  for (const mesh of json.meshes || []) {
    for (const p of mesh.primitives || []) {
      const mode = p.mode === undefined ? 4 : p.mode;
      const count = p.indices !== undefined ? glbAccessorCount(json, p.indices) : glbAccessorCount(json, p.attributes.POSITION);
      if (mode === 4) tris += count / 3;
    }
  }
  if (tris > MAX_TRIS) fails.push(`tris ${tris} > ${MAX_TRIS}`);

  // skinned mesh count: a mesh is "skinned" if any node referencing it has a `skin` index
  const nodes = json.nodes || [];
  for (const n of nodes) {
    if (n.mesh !== undefined && n.skin !== undefined) skinnedMeshes.push({ nodeIdx: nodes.indexOf(n), meshIdx: n.mesh, skinIdx: n.skin });
  }
  if (skinnedMeshes.length !== 1) fails.push(`skinned meshes = ${skinnedMeshes.length} (want 1)`);

  // bones: exact set match against the skin used by the (first) skinned mesh
  let bones = [];
  let boneFail = null;
  if (skinnedMeshes.length >= 1) {
    const skin = (json.skins || [])[skinnedMeshes[0].skinIdx];
    if (!skin) boneFail = 'no skin object for skinned node';
    else bones = skin.joints.map((j) => (nodes[j] && nodes[j].name) || `node${j}`);
  }
  const boneSet = new Set(bones);
  const reqSet = new Set(REQUIRED_BONES);
  const missing = REQUIRED_BONES.filter((b) => !boneSet.has(b));
  const extra = bones.filter((b) => !reqSet.has(b));
  if (boneFail) fails.push(boneFail);
  else if (missing.length || extra.length) {
    fails.push(`bones mismatch missing=[${missing.join(',')}] extra=[${extra.join(',')}]`);
  }

  // orphan weights: for the skinned mesh's primitives, every vertex with any
  // nonzero skinWeight must reference a joint index within [0, joints.length)
  // via a valid accessor; and the weights must sum to > 0 (a vertex assigned
  // to the skin at all must actually be weighted to something).
  let orphanCount = 0;
  let texMax = 0;
  const bufferViews = json.bufferViews || [];
  const accessors = json.accessors || [];
  const componentReaders = {
    5120: (dv, o) => dv.getInt8(o), 5121: (dv, o) => dv.getUint8(o),
    5122: (dv, o) => dv.getInt16(o, true), 5123: (dv, o) => dv.getUint16(o, true),
    5125: (dv, o) => dv.getUint32(o, true), 5126: (dv, o) => dv.getFloat32(o, true),
  };
  const numComponents = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  function readAccessor(idx) {
    const a = accessors[idx];
    const bv = bufferViews[a.bufferView];
    const compSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    const nc = numComponents[a.type];
    const stride = bv.byteStride || compSize * nc;
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = [];
    const dv = new DataView(bin.buffer, bin.byteOffset + base, bin.byteLength - base);
    for (let i = 0; i < a.count; i++) {
      const row = [];
      for (let c = 0; c < nc; c++) row.push(componentReaders[a.componentType](dv, i * stride + c * compSize));
      out.push(row);
    }
    return out;
  }
  if (skinnedMeshes.length >= 1 && bin) {
    try {
      const meshIdx = skinnedMeshes[0].meshIdx;
      const skin = (json.skins || [])[skinnedMeshes[0].skinIdx];
      const njoints = skin ? skin.joints.length : 0;
      for (const p of (json.meshes[meshIdx].primitives || [])) {
        const jointsAttr = p.attributes.JOINTS_0, weightsAttr = p.attributes.WEIGHTS_0;
        if (jointsAttr === undefined || weightsAttr === undefined) continue;
        const joints = readAccessor(jointsAttr);
        const weights = readAccessor(weightsAttr);
        for (let i = 0; i < weights.length; i++) {
          const w = weights[i], j = joints[i];
          const sum = w.reduce((s, v) => s + v, 0);
          for (let k = 0; k < 4; k++) {
            if (w[k] > 0 && (j[k] < 0 || j[k] >= njoints)) orphanCount++;
          }
          if (sum <= 0) orphanCount++; // unweighted vertex on a skinned mesh
        }
      }
    } catch (e) { fails.push('orphan-weight scan error: ' + e.message); }
  }
  if (orphanCount > 0) fails.push(`orphan weights = ${orphanCount}`);

  // embedded texture dimensions from bufferView-backed images
  for (const im of json.images || []) {
    if (im.bufferView === undefined || !bin) continue;
    const bv = bufferViews[im.bufferView];
    const base = bv.byteOffset || 0;
    const bytes = bin.subarray(base, base + bv.byteLength);
    const { w, h } = imageDims(bytes);
    if (w && h) texMax = Math.max(texMax, w, h);
  }
  if (texMax > MAX_TEX_PX) fails.push(`texture ${texMax}px > ${MAX_TEX_PX}px`);

  return { name, fails, tris: Math.round(tris), mb, skinned: skinnedMeshes.length, bones: bones.length, orphan: orphanCount, texMax };
}

function inspectRowJpg(file) {
  const name = path.basename(file);
  const kb = +(fs.statSync(file).size / 1024).toFixed(1);
  const fails = kb > MAX_ROW_JPG_KB ? [`file ${kb}KB > ${MAX_ROW_JPG_KB}KB`] : [];
  return { name, fails, kb };
}

function makeSyntheticBadGlb(outPath) {
  // A GLB with too many bones (missing the required set), 2 skinned meshes,
  // an over-tri primitive, an oversized embedded PNG, and an orphan joint
  // index -- deliberately fails every gate at once.
  const W = 2048, H = 2048;
  // minimal valid PNG header lying about huge dimensions without real pixel
  // data (readable by imageDims's byte-offset sniff only, never decoded).
  const png = Buffer.alloc(33);
  png.write('\x89PNG\r\n\x1a\n', 0, 'binary');
  png.writeUInt32BE(13, 8); png.write('IHDR', 12, 'ascii');
  png.writeUInt32BE(W, 16); png.writeUInt32BE(H, 20);
  png[24] = 8; png[25] = 2; // bit depth 8, color type 2 (truecolor)

  // vertex buffer: 10 verts, position vec3 f32 + joints_0 vec4 u8 + weights_0 vec4 f32
  const nVerts = 10;
  const posBuf = Buffer.alloc(nVerts * 12);
  for (let i = 0; i < nVerts; i++) posBuf.writeFloatLE(i, i * 12);
  const jointsBuf = Buffer.alloc(nVerts * 4);
  for (let i = 0; i < nVerts; i++) jointsBuf[i * 4] = 99; // orphan joint index (out of range)
  const weightsBuf = Buffer.alloc(nVerts * 16);
  for (let i = 0; i < nVerts; i++) weightsBuf.writeFloatLE(1, i * 16); // weight 1.0 on the orphan slot
  // indices: 4000 triangles (way over 9000... use a bigger count) -> 9500 tris
  const nTris = 9500;
  const idxBuf = Buffer.alloc(nTris * 3 * 2);
  for (let i = 0; i < nTris * 3; i++) idxBuf.writeUInt16LE(i % nVerts, i * 2);

  const chunks = [posBuf, jointsBuf, weightsBuf, idxBuf, png];
  let offset = 0;
  const views = chunks.map((c) => { const v = { byteOffset: offset, byteLength: c.length }; offset += c.length; return v; });
  const bin = Buffer.concat(chunks);

  const json = {
    asset: { version: '2.0' },
    scenes: [{ nodes: [0, 1] }],
    scene: 0,
    nodes: [
      { name: 'root', mesh: 0, skin: 0 },
      { name: 'root2', mesh: 0, skin: 0 }, // second skinned node -> skinnedMeshes=2
      { name: 'Tail3' }, { name: 'ExtraBoneNotAllowed' }, // wrong bone set
    ],
    meshes: [{ primitives: [{
      attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 },
      indices: 3, mode: 4,
    }] }],
    skins: [{ joints: [2, 3] }], // only 2 joints, missing required 8, orphan idx 99 out of range
    images: [{ bufferView: 4, mimeType: 'image/png' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: nVerts, type: 'VEC3' },
      { bufferView: 1, componentType: 5121, count: nVerts, type: 'VEC4' },
      { bufferView: 2, componentType: 5126, count: nVerts, type: 'VEC4' },
      { bufferView: 3, componentType: 5123, count: nTris * 3, type: 'SCALAR' },
    ],
    bufferViews: views.map((v) => ({ buffer: 0, byteOffset: v.byteOffset, byteLength: v.byteLength })),
    buffers: [{ byteLength: bin.length }],
  };
  const jsonStr = JSON.stringify(json);
  const jsonPad = (4 - (jsonStr.length % 4)) % 4;
  const jsonChunk = Buffer.concat([Buffer.from(jsonStr + ' '.repeat(jsonPad)), Buffer.alloc(0)]);
  const binPad = (4 - (bin.length % 4)) % 4;
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPad)]);

  const totalLen = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(totalLen, 8);
  const jsonHead = Buffer.alloc(8); jsonHead.writeUInt32LE(jsonChunk.length, 0); jsonHead.writeUInt32LE(0x4e4f534a, 4);
  const binHead = Buffer.alloc(8); binHead.writeUInt32LE(binChunk.length, 0); binHead.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(outPath, Buffer.concat([header, jsonHead, jsonChunk, binHead, binChunk]));
}

// ---- main ----
const famDir = path.join(ROOT, 'assets/models/fam');
const rowsDir = path.join(ROOT, 'assets/textures/rows');
fs.mkdirSync(famDir, { recursive: true });
fs.mkdirSync(rowsDir, { recursive: true });

let glbFiles = fs.existsSync(famDir) ? fs.readdirSync(famDir).filter((f) => f.endsWith('.glb')).map((f) => path.join(famDir, f)) : [];

if (process.env.STANDINS === '1') {
  for (const b of ['greatwhite_cy.glb', 'thresher.glb', 'tigershark.glb', 'whaler.glb']) {
    const p = path.join(ROOT, 'assets/models', b);
    if (fs.existsSync(p)) glbFiles.push(p);
  }
}
let badPath = null;
if (process.env.BAD === '1') {
  badPath = path.join(HERE, '.synthetic_bad_r17.glb');
  makeSyntheticBadGlb(badPath);
  glbFiles.push(badPath);
}

const jpgFiles = fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((f) => f.endsWith('.jpg')).map((f) => path.join(rowsDir, f)) : [];

if (!glbFiles.length && !jpgFiles.length) {
  console.log('No assets/models/fam/*.glb and no assets/textures/rows/*.jpg found.');
  console.log('(Expected: rev17 pipeline has not shipped a family GLB yet. Run with STANDINS=1 and/or BAD=1 to exercise the gate.)');
}

console.log('\n=== family GLB contract (tris<=9000, <=1.0MB, 1 skinned mesh, exact bone set, 0 orphan weights, tex<=1024px) ===');
let anyFail = false;
const glbRows = glbFiles.map(inspectGlb);
for (const r of glbRows) {
  if (r.fails.length) anyFail = true;
  const status = r.fails.length ? 'FAIL' : 'OK';
  console.log(
    `${r.name.padEnd(28)} tris=${String(r.tris).padStart(6)} mb=${String(r.mb).padStart(6)} ` +
    `skinned=${r.skinned} bones=${r.bones} orphan=${r.orphan} texMax=${r.texMax}  ${status}` +
    (r.fails.length ? '  -- ' + r.fails.join('; ') : '')
  );
}

console.log('\n=== row texture budget (<=180KB) ===');
const jpgRows = jpgFiles.map(inspectRowJpg);
for (const r of jpgRows) {
  if (r.fails.length) anyFail = true;
  console.log(`${r.name.padEnd(28)} kb=${String(r.kb).padStart(8)}  ${r.fails.length ? 'FAIL -- ' + r.fails.join('; ') : 'OK'}`);
}

if (badPath) fs.rmSync(badPath, { force: true });

console.log(`\n${anyFail ? 'FAIL' : 'PASS'}: ${glbRows.length} glb, ${jpgRows.length} row textures checked`);
process.exit(anyFail ? 1 : 0);
