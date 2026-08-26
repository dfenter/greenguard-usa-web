/* Lane O1: headless GLB contract check. Reads glTF JSON chunk only:
 * triangle count, referenced images + their byte sizes, bone names,
 * and the bind-pose bounding box from POSITION accessor min/max. */
import fs from 'node:fs';
import path from 'node:path';

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb: ' + file);
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === 0x004e4942) bin = body;
    off += 8 + len + ((4 - (len % 4)) % 4) * 0;
    off += (4 - (off % 4)) % 4;
  }
  return { json, bin };
}

function inspect(file) {
  const { json, bin } = readGlb(file);
  const acc = json.accessors || [], views = json.bufferViews || [];
  let tris = 0, verts = 0, prims = 0;
  const uvSets = new Set();
  for (const mesh of json.meshes || []) {
    for (const p of mesh.primitives || []) {
      prims++;
      const mode = p.mode === undefined ? 4 : p.mode;
      const count = p.indices !== undefined ? acc[p.indices].count : acc[p.attributes.POSITION].count;
      if (mode === 4) tris += count / 3;
      verts += acc[p.attributes.POSITION].count;
      for (const k of Object.keys(p.attributes)) if (k.startsWith('TEXCOORD')) uvSets.add(k);
    }
  }
  // images
  const images = (json.images || []).map((im, i) => {
    const bv = im.bufferView !== undefined ? views[im.bufferView] : null;
    return { i, name: im.name || im.uri || ('image' + i), mime: im.mimeType || '', bytes: bv ? bv.byteLength : 0 };
  });
  // material slot wiring
  const mats = (json.materials || []).map((m) => {
    const pbr = m.pbrMetallicRoughness || {};
    return {
      name: m.name || '',
      baseColorTexture: pbr.baseColorTexture ? pbr.baseColorTexture.index : null,
      normalTexture: m.normalTexture ? m.normalTexture.index : null,
      metallicRoughnessTexture: pbr.metallicRoughnessTexture ? pbr.metallicRoughnessTexture.index : null,
      baseColorFactor: pbr.baseColorFactor || null,
      doubleSided: !!m.doubleSided
    };
  });
  // bones
  const nodes = json.nodes || [];
  const bones = [];
  for (const sk of json.skins || []) for (const j of sk.joints) bones.push(nodes[j].name || ('node' + j));
  // bind pose bbox from POSITION accessor min/max
  let bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes || []) for (const p of mesh.primitives || []) {
    const a = acc[p.attributes.POSITION];
    if (a && a.min && a.max) for (let k = 0; k < 3; k++) { bmin[k] = Math.min(bmin[k], a.min[k]); bmax[k] = Math.max(bmax[k], a.max[k]); }
  }
  const size = bmin[0] === Infinity ? null : bmax.map((v, k) => +(v - bmin[k]).toFixed(4));
  return {
    file: path.basename(file), diskMB: +(fs.statSync(file).size / 1048576).toFixed(3),
    meshes: (json.meshes || []).length, prims, tris, verts, uvSets: [...uvSets],
    images, mats, boneCount: bones.length, bones, size, animations: (json.animations || []).length,
    binMB: bin ? +(bin.byteLength / 1048576).toFixed(3) : 0
  };
}

const files = process.argv.slice(2);
const out = [];
for (const f of files) {
  try { out.push(inspect(f)); }
  catch (e) { out.push({ file: path.basename(f), error: String(e.message) }); }
}
if (process.env.JSON) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
const REQ = ['Tail3', 'Tail2', 'Tail1', 'Spine2', 'Spine1', 'Neck', 'Head', 'LowerJaw'];
for (const r of out) {
  if (r.error) { console.log(`${r.file.padEnd(26)} ERROR ${r.error}`); continue; }
  const bset = new Set(r.bones);
  const missing = REQ.filter((b) => !bset.has(b));
  const m0 = r.mats[0] || {};
  const imgMB = (r.images.reduce((s, i) => s + i.bytes, 0) / 1048576).toFixed(3);
  const flags = [];
  if (r.tris > 8000) flags.push('TRIS>8k');
  if (r.meshes !== 1) flags.push('meshes=' + r.meshes);
  if (m0.baseColorTexture === null || m0.baseColorTexture === undefined) flags.push('NO-BASECOLOR');
  if (m0.normalTexture === null || m0.normalTexture === undefined) flags.push('no-normal');
  if (missing.length) flags.push('BONES-MISSING:' + missing.join(','));
  if (!r.uvSets.length) flags.push('NO-UV');
  console.log(
    `${r.file.padEnd(26)} tris=${String(r.tris).padStart(6)} verts=${String(r.verts).padStart(6)} ` +
    `mesh=${r.meshes} imgs=${r.images.length} imgMB=${imgMB} bones=${r.boneCount} ` +
    `size=${r.size ? r.size.join('x') : '?'} disk=${r.diskMB}MB ${flags.length ? '  ** ' + flags.join(' ') : 'OK'}`
  );
}
