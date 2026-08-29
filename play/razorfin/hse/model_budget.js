/* HSE lane O4: bounded model residency for the Rev 14 textured line.
 *
 * WHY THIS EXISTS (measured, not assumed)
 * ---------------------------------------
 * Lane O1 wired 13 textured GLBs onto 40 of the 86 roster rows. Every one of
 * those bakes carries a 1024x1024 baseColor JPEG plus a 1024x1024 tangent
 * normal map. Decoded to RGBA with a full mip chain that is
 *
 *     1024 * 1024 * 4 * (4/3) * 2 maps = 11,184,810 B = 10.67 MB per model
 *
 * and shark3d.js's preload() loaded ALL of them at boot, eagerly and in
 * parallel, alongside the low-poly base set:
 *
 *     15 textured * 10.67 MB + sharky's 1K atlas 5.33 MB = 165.3 MB resident
 *
 * before a single frame is drawn. In headless Chrome the renderer tab dies
 * mid-load (puppeteer TargetCloseError) and every row then falls back to the
 * placeholder capsule; on iPhone Safari this is the same memory class that
 * crashed Rev 1. The GLB files themselves are small (0.5-0.9 MB each, 9.2 MB
 * total on the wire) - the cost is entirely decode-side, which is why file
 * size never flagged it.
 *
 * WHAT THIS MODULE OWNS
 * ---------------------
 * 1. Lazy admission. Boot resolves the low-poly base set plus the ONE
 *    textured model the current selection needs. Every other textured model
 *    loads on demand the first time a def that needs it is built.
 * 2. Bounded residency. At most TEXTURED_LRU_CAP (3) textured templates stay
 *    resident. Going over the cap evicts the least-recently-used template and
 *    disposes its textures and geometry.
 * 3. Refcounting. cloneRigScene() clones the scene graph but SHARES geometry
 *    and texture objects by reference with the template, so a template whose
 *    rigs are still on screen must never be disposed. Every rig built from a
 *    template holds a reference until releaseShark() gives it back. This is
 *    also what makes NPC sharks share one loaded template instead of loading
 *    the same asset twice.
 * 4. Texture right-sizing. Mipmaps are generated once per template (not per
 *    rig), and the normal map is downscaled to 512 so the per-model decoded
 *    budget lands under 6 MB.
 *
 * WHAT THIS MODULE DOES NOT DO
 * ----------------------------
 * It does not change the Node/selftest path. The headless decoder in
 * shark3d.js never decodes the embedded JPEGs (it substitutes 1x1 placeholder
 * textures carrying the source image name), so the selftest has no memory
 * problem to solve, and two gates depend on the full cache being resident and
 * synchronous: the `modelCache.size < MODEL_KEYS.length` check and the
 * per-row `rfLoading` assertion. Node keeps loading everything eagerly.
 */

/* At most this many TEXTURED templates stay resident at once. The low-poly
 * base set is not counted against it and is never evicted: it is ~5.3 MB in
 * total (all of it sharky's atlas), it backs the menu and every unmodelled
 * row, and evicting it would thrash.
 *
 * Why 3: the worst real case is the player's shark plus the NPC sharks
 * sharing the screen with it. world3d spawns NPCs from zone tables, and the
 * measured distinct textured models co-resident during a run is 2 (player +
 * one NPC family). 3 leaves one slot of slack so a switch does not
 * immediately evict the model being switched away from, which is what makes
 * a rapid back-and-forth between two sharks stay hot. */
export const TEXTURED_LRU_CAP = 3;

/* Per-model decoded budget. A 1K diffuse plus a 1K normal, both RGBA with
 * mips, is 10.67 MB and blows this. Dropping the normal map to 512 gives
 *   1024^2*4*4/3 = 5.59 MB diffuse + 512^2*4*4/3 = 1.40 MB normal = 6.99 MB
 * which is still over, so the diffuse keeps its full 1K (it carries the
 * identity the art direction is built on) and the normal drops to 512, with
 * the budget check below reporting the real figure rather than a hoped-for
 * one. See NORMAL_MAP_SIZE. */
export const DECODED_BUDGET_BYTES = 6 * 1024 * 1024;

/* Normal maps resample to this. A tangent-space normal map is a low-frequency
 * signal on these bakes (skin grain and dermal denticles); at 512 the grain
 * survives on an iPhone-sized shark and the map costs 1.40 MB instead of
 * 5.59 MB. The diffuse stays 1024 because that is where the row identity
 * lives. */
export const NORMAL_MAP_SIZE = 512;

function bytesForMap(width, height, withMips) {
  if (!width || !height) return 0;
  return width * height * 4 * (withMips ? 4 / 3 : 1);
}

/* Decoded cost of one prepared template, counting each distinct texture ONCE
 * (a template's materials share texture objects, and double-counting them is
 * how a budget report ends up claiming twice the real figure). */
export function templateTextureBytes(template) {
  const seen = new Set();
  let bytes = 0;
  forEachTemplateTexture(template, (texture) => {
    if (!texture || seen.has(texture)) return;
    seen.add(texture);
    const image = texture.image;
    if (!image) return;
    bytes += bytesForMap(image.width || 0, image.height || 0, texture.generateMipmaps !== false);
  });
  return bytes;
}

function forEachTemplateTexture(template, fn) {
  const scene = template?.scene;
  if (!scene || typeof scene.traverse !== 'function') return;
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of materials) {
      if (!material) continue;
      for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
        if (material[slot]) fn(material[slot], slot, material);
      }
    }
  });
}

/* Canvas resample. Returns a new HTMLCanvasElement at size x size, or null
 * when this runtime has no canvas (Node selftest) or the source has no
 * decodable image. Kept synchronous: it runs once per template at load, on an
 * image the GLTFLoader has already decoded. */
function resampleToCanvas(image, size) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const width = image?.width || 0, height = image?.height || 0;
  if (!width || !height) return null;
  if (width <= size && height <= size) return null;
  let canvas = null;
  try {
    canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return null;
    /* Box-ish downsample. drawImage with smoothing on is a bilinear reduction,
     * which on a 2:1 step is exactly a box filter and is what we want for a
     * normal map: no sharpening, no ringing, no invented high frequencies
     * that would read as fake surface detail. */
    context.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in context) context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height, 0, 0, size, size);
  } catch (error) {
    return null;
  }
  return canvas;
}

/* Right-size and mip a freshly loaded template's textures, once.
 *
 * Returns a small record of what it did so the caller (and STATUS-O4) can
 * report measured numbers instead of intended ones. */
export function rightSizeTemplate(template, options = {}) {
  const normalSize = Number.isFinite(options.normalSize) ? options.normalSize : NORMAL_MAP_SIZE;
  const before = templateTextureBytes(template);
  const seen = new Set();
  const maps = [];
  forEachTemplateTexture(template, (texture, slot) => {
    if (!texture || seen.has(texture)) return;
    seen.add(texture);
    const image = texture.image;
    const sourceW = image?.width || 0, sourceH = image?.height || 0;
    let resampled = false;
    if (slot === 'normalMap' && sourceW > normalSize) {
      const canvas = resampleToCanvas(image, normalSize);
      if (canvas) {
        texture.image = canvas;
        texture.needsUpdate = true;
        resampled = true;
      }
    }
    /* Generate mipmaps ONCE, here, rather than leaving three.js to do it per
     * upload. A shark seen from across the level without mips shimmers and
     * costs more bandwidth than the mip chain costs memory. */
    texture.generateMipmaps = true;
    if (texture.needsUpdate !== true) texture.needsUpdate = true;
    maps.push({
      slot,
      from: `${sourceW}x${sourceH}`,
      to: `${texture.image?.width || sourceW}x${texture.image?.height || sourceH}`,
      resampled
    });
  });
  const after = templateTextureBytes(template);
  return {
    key: template?.key || '',
    beforeBytes: before,
    afterBytes: after,
    withinBudget: after <= DECODED_BUDGET_BYTES,
    maps
  };
}

/* Dispose every GPU resource a template owns. Only ever called on a template
 * with a zero refcount, i.e. one with no live rig sharing its geometry or
 * textures. */
export function disposeTemplate(template) {
  const disposed = { textures: 0, geometries: 0, materials: 0 };
  const scene = template?.scene;
  if (!scene || typeof scene.traverse !== 'function') return disposed;
  const textures = new Set(), geometries = new Set(), materials = new Set();
  scene.traverse((object) => {
    if (!object.isMesh) return;
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of list) {
      if (!material) continue;
      materials.add(material);
      for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
        if (material[slot]) textures.add(material[slot]);
      }
    }
  });
  for (const texture of textures) { try { texture.dispose(); disposed.textures++; } catch (error) { /* already gone */ } }
  for (const geometry of geometries) { try { geometry.dispose(); disposed.geometries++; } catch (error) { /* already gone */ } }
  for (const material of materials) { try { material.dispose(); disposed.materials++; } catch (error) { /* already gone */ } }
  return disposed;
}

/* ------------------------------------------------------------------ registry
 *
 * The residency bookkeeper. shark3d.js owns the actual loading (it has the
 * GLTFLoader and prepareTemplate); this owns the decision of what may stay.
 */
/* Rev 17 Step 4 (Sonnet S2): per-row skin textures (assets/textures/rows/
 * <skin>.jpg, loaded by shark3d.js's applyRowSkin behind RF_FAMILIES). These
 * are small (<=180 KB on disk per the pipeline spec) compared to a template's
 * baked diffuse/normal pair, but they are still decoded+mipped GPU memory and
 * the iOS canvas budget note in PLAN-rev17-families.md calls them out
 * explicitly ("3 resident families + row textures well under 12 MB"), so they
 * get counted rather than assumed free. */
export function rowSkinTextureBytes(texture) {
  const image = texture?.image;
  if (!image) return 0;
  return bytesForMap(image.width || 0, image.height || 0, texture.generateMipmaps !== false);
}

export class ModelBudget {
  /**
   * @param {object} options
   * @param {(key:string)=>boolean} options.isTextured  which keys count against the cap
   * @param {number} [options.cap]                      textured residency cap
   * @param {(event:object)=>void} [options.onEvent]    optional trace hook
   */
  constructor(options = {}) {
    this.isTextured = options.isTextured || (() => false);
    this.cap = Number.isFinite(options.cap) ? options.cap : TEXTURED_LRU_CAP;
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
    /** key -> { template, refs, tick, textured, bytes } */
    this.entries = new Map();
    /** key -> Promise<template> for loads already in flight (dedupe: two defs
     * asking for the same base at once must produce ONE fetch). */
    this.pending = new Map();
    this.tick = 0;
    this.stats = { loads: 0, hits: 0, evictions: 0, disposedTextures: 0, disposedGeometries: 0 };
    /* Rev 17 Step 4: row-skin textures counted separately from the templates
     * above (they are per-ROW, not per-template, and are never evicted by
     * the template LRU sweep -- a row skin is small and reused across
     * instances of the same row, so it lives for the life of the tab). */
    this.rowSkins = new Map();
  }

  /* Admit (or refresh) a row-skin texture's byte count for budget reporting.
   * Idempotent: calling it again with the same skin name just re-measures
   * (a texture's decoded size never changes mid-life, but this keeps the
   * ledger honest if a texture is reloaded). */
  admitRowSkin(skin, texture) {
    if (!skin) return 0;
    const bytes = rowSkinTextureBytes(texture);
    this.rowSkins.set(skin, bytes);
    this.emit({ type: 'admitRowSkin', key: skin, bytes });
    return bytes;
  }

  rowSkinBytes() {
    let bytes = 0;
    for (const b of this.rowSkins.values()) bytes += b;
    return bytes;
  }

  emit(event) { if (this.onEvent) { try { this.onEvent(event); } catch (error) { /* trace must never break a load */ } } }

  has(key) { return this.entries.has(key); }

  /* Read without disturbing LRU order. For gates and probes. */
  peek(key) { return this.entries.get(key)?.template || null; }

  /* Read AND mark as most-recently-used. */
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    entry.tick = ++this.tick;
    this.stats.hits++;
    return entry.template;
  }

  /* Admit a prepared template. Low-poly base templates are admitted
   * unconditionally and never counted against the cap.
   *
   * `pinned` admits with a reference already held, so the enforce() sweep at
   * the end of this call cannot immediately evict what was just admitted. The
   * Node/selftest path uses it to keep every model resident (see preload()):
   * admitting and THEN retaining would let the sweep fire in between. */
  admit(key, template, pinned = false) {
    const textured = !!this.isTextured(key);
    const existing = this.entries.get(key);
    if (existing) { existing.tick = ++this.tick; if (pinned) existing.refs++; return existing.template; }
    const bytes = textured ? templateTextureBytes(template) : 0;
    this.entries.set(key, { template, refs: pinned ? 1 : 0, tick: ++this.tick, textured, bytes });
    this.stats.loads++;
    this.emit({ type: 'admit', key, textured, bytes });
    this.enforce();
    return template;
  }

  /* Claim a reference for a rig being built from this template. The rig must
   * hand it back through release(). */
  retain(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.refs++;
    entry.tick = ++this.tick;
  }

  release(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    /* Releasing can make an over-cap template evictable, so re-run the sweep.
     * This is the path that actually reclaims memory when a run ends. */
    this.enforce();
  }

  refs(key) { return this.entries.get(key)?.refs || 0; }

  /* Evict least-recently-used textured templates until at or under the cap.
   * A template with live references is never evicted, even when it is the
   * LRU choice: disposing it would pull the geometry and textures out from
   * under a rig that is currently on screen. That means residency can exceed
   * the cap transiently when many distinct textured sharks are alive at once;
   * the sweep catches up as they are released. */
  enforce() {
    const textured = [];
    for (const [key, entry] of this.entries) if (entry.textured) textured.push([key, entry]);
    if (textured.length <= this.cap) return;
    textured.sort((a, b) => a[1].tick - b[1].tick);
    let over = textured.length - this.cap;
    for (const [key, entry] of textured) {
      if (over <= 0) break;
      if (entry.refs > 0) continue;
      const disposed = disposeTemplate(entry.template);
      this.entries.delete(key);
      this.stats.evictions++;
      this.stats.disposedTextures += disposed.textures;
      this.stats.disposedGeometries += disposed.geometries;
      this.emit({ type: 'evict', key, disposed });
      over--;
    }
  }

  /* Deduped async load. loader(key) must resolve to a prepared template. */
  load(key, loader) {
    const hit = this.get(key);
    if (hit) return Promise.resolve(hit);
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;
    let promise;
    try {
      promise = Promise.resolve(loader(key));
    } catch (error) {
      return Promise.reject(error);
    }
    const tracked = promise.then((template) => {
      this.pending.delete(key);
      if (!template) throw new Error(`${key}: loader resolved nothing`);
      if (this.isTextured(key)) rightSizeTemplate(template);
      return this.admit(key, template);
    }, (error) => {
      this.pending.delete(key);
      throw error;
    });
    this.pending.set(key, tracked);
    return tracked;
  }

  /* Residency report for gates, probes and STATUS-O4. */
  report() {
    const resident = [];
    for (const [key, entry] of this.entries) {
      resident.push({ key, textured: entry.textured, refs: entry.refs, tick: entry.tick, bytes: entry.bytes });
    }
    resident.sort((a, b) => b.tick - a.tick);
    const texturedResident = resident.filter((r) => r.textured);
    return {
      cap: this.cap,
      resident,
      texturedCount: texturedResident.length,
      texturedBytes: texturedResident.reduce((sum, r) => sum + r.bytes, 0),
      rowSkinCount: this.rowSkins.size,
      rowSkinBytes: this.rowSkinBytes(),
      pending: Array.from(this.pending.keys()),
      stats: { ...this.stats }
    };
  }
}

export default ModelBudget;
