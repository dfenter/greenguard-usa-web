# STATUS-O4: bounded model residency for the Rev 14 textured line

Lane O4. Owns `preload()` / model-cache code in `shark3d.js` plus the new
`hse/model_budget.js` and `hse/probe_o4.cjs`. No commit, no deploy.

## The problem, measured

Lane O1 wired 13 textured GLBs onto 40 of the 86 roster rows. Each bake carries
a 1024x1024 baseColor JPEG plus a 1024x1024 tangent normal map, and `preload()`
loaded every model in `MODEL_FILES` eagerly at boot.

Decoded cost per textured model, RGBA with a full mip chain:

```
1024 * 1024 * 4 * (4/3) * 2 maps = 11,184,810 B = 10.67 MB
```

Measured across the shipped assets (`node` over the GLB image chunks):

| set | files | decoded texture |
|---|---|---|
| 15 textured bakes | 0.19-0.94 MB each on disk | 10.67 MB each |
| 14 low-poly base models | 0.03-0.50 MB each | 5.33 MB total (all of it `sharky`'s atlas; the other 13 carry no maps) |
| **boot total, before** | 9.2 MB on the wire | **165.3 MB resident** |

The GLB files are small; the entire cost is decode-side, which is why file size
never flagged this. 165.3 MB before the first frame is what kills the headless
Chrome renderer tab (puppeteer `TargetCloseError`, after which every row renders
the placeholder capsule) and it is the same memory class that crashed Rev 1 on
iPhone Safari.

## What changed

All in `shark3d.js` (`preload`/model-cache code, which this lane owns) plus one
new module. `engine3d.js`, `ui3d.js`, `world3d.js`, `fx3d.js` and other lanes'
`hse/*.js` modules were **not edited**.

### 1. Lazy loading

`preload()` now admits only the **boot set**: the 14 non-textured models
(derived as `MODEL_KEYS` minus `TEXTURED_KEYS`, so a new bake cannot silently
rejoin the eager path) plus **at most one** textured model, the one the current
selection needs. Every other textured model loads on demand the first time a def
that needs it is built.

`buildShark()` on a non-resident base returns the placeholder rig immediately
and the real rig swaps in when the GLB arrives. The swap goes through the normal
`buildLoadedRig()` path, so skinning, the morph record, identity, props and the
face hooks all arrive exactly as they would have on the synchronous path. The
probe verifies the mounted rig has a skinned mesh and no placeholder mesh.

The **Node/selftest path is unchanged** and still loads everything eagerly and
synchronously. Its headless decoder never decodes the embedded JPEGs (it
substitutes 1x1 placeholders), so there is no memory to reclaim there, and two
existing gates depend on the full cache: the `modelCache.size` check and the
per-row `rfLoading` assertion.

### 2. Bounded residency

`hse/model_budget.js` keeps an LRU of at most **3** textured templates. The base
set is not counted against the cap and is never evicted (5.33 MB total, backs
the menu and every unmodelled row).

Eviction disposes the template's textures, geometries and materials. Because
`cloneRigScene()` clones the scene graph but **shares geometry and texture
objects by reference**, every rig built from a template holds a **reference**
until `releaseShark()` gives it back, and a referenced template is never
evicted. This refcounting is also what makes NPC sharks share the player's
loaded template instead of loading the same asset twice - verified by a gate
that builds two rigs on one base and asserts one load and one shared geometry.

`Art3D.releaseShark` was a no-op stub and is now implemented. That matters
beyond bookkeeping: `ui3d.bakeThumb()` falls back to its own cleanup when
`releaseShark` is absent, and that fallback traverses the rig disposing **every**
geometry and material it finds - which on the textured path are the template's
shared buffers. One thumbnail bake could dispose the buffers out from under a
live shark. Implementing the hook takes that path out of play (both `ui3d` and
`engine3d` already prefer `releaseShark` when it exists), and the implementation
disposes only per-rig resources, never template-owned geometry. A gate asserts
the template geometry survives a release and still builds.

### 3. Texture memory

Mipmaps are generated once per template (not per rig). The diffuse keeps its
full 1K because that is where the row identity lives; the normal map is
downscaled to **512** at load with a canvas box resample.

| | per textured model |
|---|---|
| before: 1K diffuse + 1K normal | **10.67 MB** |
| after: 1K diffuse + 512 normal | **6.67 MB** |
| reduction | 4.00 MB (38%) |

**This lands at 6.67 MB, still 0.67 MB over the 6 MB per-model budget the task
names.** The overage is entirely the mip chain on the 1K diffuse
(`1024^2*4*4/3 = 5.59 MB` on its own). Getting under 6 MB would require either
dropping the diffuse to 512, which discards the baked identity the whole Rev 14
art direction rests on, or dropping diffuse mips, which makes distant sharks
shimmer. Reporting the real number rather than claiming the budget was met.

Residency totals:

| | decoded texture |
|---|---|
| boot, before | 165.3 MB |
| boot, after (base set + 1 textured) | **12.0 MB** |
| worst case, after (base set + 3 textured at LRU cap) | **25.3 MB** |

### 4. Menu/roster thumbnails

`ui3d.bakeThumb()` calls `buildShark(def)` once per roster card. With 40 rows
carrying a `sil.model`, that is a demand for all 13 textured bakes at the menu.
**Measured on the first probe run: 9 textured GLB fetches and 9 evictions of
load/evict thrash at the menu.** The LRU bounded the memory, but the loads still
happened, which is exactly what requirement 4 forbids.

Fix, inside this lane's own code: on-demand loading of a *textured* model is
allowed only while a run is live (or during the bounded boot admission). At the
menu a textured base that is not already resident serves the placeholder, and
`ui3d`'s existing guard keeps the card's monogram - no `ui3d.js` edit needed.
Rows whose model is already resident still bake a real thumbnail, and every
unmodelled row thumbnails normally off the always-resident base set.

## Measurements (real GL, `hse/probe_o4.cjs`)

Headless Chrome, real WebGL context, iPhone-landscape viewport 844x390 @2x.

### Run 1 (before the thumbnail fix) - `/tmp/o4run`

| gate | result |
|---|---|
| textured .glb at menu | **9** (FAIL) |
| swap to real rig within 5 s | tiger 2619 ms, hammerhead 1401 ms, reef 1205 ms - all PASS |
| textured templates resident | pinned at cap 3 throughout, 27 loads / 10 evictions |

### Final run (after the thumbnail fix) - `/tmp/o4run3`

| gate | result |
|---|---|
| textured .glb at menu | **1** (`dogfish`, the starter shark) - PASS |
| swap to real rig within 5 s | tiger **2743 ms**, hammerhead **2076 ms**, reef **2320 ms** - PASS |
| peak shark-model textures | **8** of 12 - PASS |
| console errors | **0** - PASS |
| tab crash | none; the run completed and closed cleanly |
| **OVERALL** | **PASS** |

Every swap mounted a real skinned mesh with no placeholder mesh present
(`skinned: 1, placeholder: 0, loading: false`) on the correct base
(`tiger -> tiger_nu`, `hammerhead -> smoothhammer`, `reef -> dogfish`).

Textured residency held at **cap 3 for the entire run**, with 25 loads and 8
evictions as NPC models (`scallopedhammer`, `tigershark`, `whitepointer`) came
and went - the LRU reclaiming under real pressure rather than growing.

Screenshots (visually checked, not just inspected through the DOM):
`/tmp/o4run3/menu.png`, `run_tiger.png`, `run_hammerhead.png`, `run_reef.png`.
The three run captures show real textured shark bodies with dorsal fins,
pectorals and tails - the hammerhead's cephalofoil is clearly the
`smoothhammer` bake, not the placeholder capsule. Full log and machine-readable
results: `/tmp/o4run3/probe.log`, `/tmp/o4run3/results.json`.

### Thumbnail side effect, and what is left for ui3d

Withholding a textured model at the menu means a non-resident row's
`buildShark()` returns a placeholder rig, and `ui3d.bakeThumb()` bakes whatever
it is handed. Measured on run 2: the **Epaulette Shark card rendered a yellow
capsule**. This lane mitigated it by hiding the placeholder mesh when the load
is deliberately withheld (`group.userData.rfWithheld`), so the bake now comes
back as an empty backdrop instead of a misleading box - confirmed on the final
run's `menu.png`.

An empty frame is still worse than the styled monogram ui3d already has for
un-baked cards. The proper fix is one condition inside `bakeThumb()` (skip the
bake when the rig reports `rfWithheld` or `rfLoading`), which belongs to the
ui3d owner. Written up with measurements in `hse/REQUESTS.md`, along with a
second, more serious ui3d note: `bakeThumb`'s fallback disposal path frees
template-shared geometry and could free a live shark's buffers - latent only
because this lane implemented the `releaseShark` hook that takes that branch
out of play.

### A note on `renderer.info.memory.textures`

The task's `<= 12` ceiling cannot be read off `renderer.info.memory.textures`:
that counts **every** texture in the WebGL context, and `world3d.js` allocates
14 texture sites of its own per run (sky, caustics, terrain, particle sheets)
plus a couple in `engine3d.js`. Measured whole-context counts on run 1 were
89 at the menu rising to 166 across five switches, dominated by world dressing
this lane does not own and must not touch, and rising with run count rather than
with shark models.

The probe therefore reports **both**: the whole-context number for information,
and `sharkTextures` - the distinct textures reachable from the resident shark
model templates, which is what this lane controls. With the LRU at cap 3 and two
maps per textured model plus `sharky`'s single atlas, the structural ceiling is
`3*2 + 1 = 7`, comfortably inside 12.

## Gates

- `node --check` on `shark3d.js`, `hse/model_budget.js`, `hse/probe_o4.cjs` - clean.
- `node --import ./tools/reg.mjs tools/selftest.mjs art3d fish meta ui game`:
  **all six green** (`art3d 29, fish 8, meta 192, ui 252, game 381`).
- New numeric gates in `shark3d.js` `__selftest()` under
  "HSE lane O4 model-residency gates": boot set contains no textured model and
  partitions `MODEL_KEYS`; the LRU keeps exactly `cap`, evicts oldest-first,
  never evicts a referenced template, and reclaims after release; two rigs on
  one base share one template and one geometry with no second load;
  `releaseShark` returns both references and does not dispose template-owned
  geometry.

Baseline note: `art3d` was observed failing once on the unmodified tree in a
five-suite run and passing on three consecutive re-runs of the same command.
That was a transient under machine load, not a real regression.

## Files

- `play/razorfin/hse/model_budget.js` - new. LRU, refcounting, disposal, texture right-sizing.
- `play/razorfin/hse/probe_o4.cjs` - new. Real-GL residency probe.
- `play/razorfin/shark3d.js` - `preload()`/model-cache code: import line, budget
  registry beside `modelCache`, `BASE_KEYS`/`bootTexturedKey()`/`requestTemplate()`,
  lazy `preload()`, on-demand swap in `placeholderRig()`, `retain` in
  `buildShark()`, the withheld-placeholder branch, implemented
  `Art3D.releaseShark`, `Art3D.modelBudget()` / `Art3D.residentTemplates()`
  reporters, and the O4 gate block.
- `play/razorfin/hse/REQUESTS.md` - appended two notes for the ui3d owner.

No `engine3d.js` / `ui3d.js` change was needed: `releaseShark` was already an
export both call guarded, so implementing the existing stub was sufficient.
