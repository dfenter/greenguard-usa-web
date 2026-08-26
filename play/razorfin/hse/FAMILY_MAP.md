# HSE lane O1: base-family map (row -> baked model, reason)

Generated state of `TEXTURED_MODEL_BY_ROW` in `tools/gen_data.py`.
`data.js` is GENERATED: `python3 tools/gen_data.py > data.js` from `play/razorfin/`.

**41 of 86 rows on real textured shark GLBs**, 13 distinct models.

## Asset validation

19 GLBs were produced by the bake lane. Each was inspected headlessly
(`hse/inspect_glb.mjs`: one mesh, tri count, referenced images, bone names,
bind-pose box) AND rendered in `assets/bakeview/o1.html` before use.
All 19 pass the headless contract, so the render is what separated them.

| model | tris | disk | verdict |
|---|---|---|---|
| `blueshark` | 6781 | 0.505 MB | APPROVED |
| `bullhead` | 6732 | 0.650 MB | APPROVED, reads broadside only after the loader roll fix |
| `dogfish` | 6712 | 0.630 MB | APPROVED |
| `greatwhite_cy` | 6790 | 0.944 MB | APPROVED |
| `mako` | 6789 | 0.518 MB | APPROVED |
| `megalodonrex` | 6788 | 0.716 MB | APPROVED, heaviest jaw |
| `scallopedhammer` | 6764 | 0.559 MB | APPROVED |
| `smoothhammer` | 6732 | 0.587 MB | APPROVED |
| `smoothhound` | 6659 | 0.572 MB | APPROVED |
| `thresher` | 6790 | 0.692 MB | APPROVED, longest tail |
| `tiger_nu` | 6790 | 0.544 MB | APPROVED, best tiger: flank stripes read clearly |
| `tigershark` | 6790 | 0.576 MB | APPROVED |
| `whaler` | 6763 | 0.584 MB | APPROVED |
| `whitepointer` | 6790 | 0.728 MB | APPROVED, widest bulk body |
| `altimus` | 7000 | 1.346 MB | **REJECTED** - a fossil JAW, no body |
| `bullshark` | 6295 | 0.455 MB | **REJECTED** - untextured grey creature, not a shark |
| `realisticshark` | 6785 | 0.461 MB | **REJECTED** - degenerate mesh, near-zero width |
| `tiger_mg` | 7503 | 0.742 MB | **REJECTED** - paper-thin, no volume |
| `hammerhead_approved` | 6764 | 1.006 MB | **REJECTED as redundant** - same mesh as scallopedhammer with a 2x larger map |

Evidence: `scratchpad/o1shots/SHEET_o1.png` (all 19, bind-pose framed),
`scratchpad/o1shots/SHEET_roll.png` (the five judged from a second angle).

## Live map

| row | tier | head | model | reason |
|---|---|---|---|---|
| `reef` | 1 | point | `dogfish` | point tiny: small houndshark bodies |
| `epaulette` | 1 | blunt | `bullhead` | blunt small: bullhead snout |
| `hammerhead` | 3 | hammer | `smoothhammer` | hammer head tag |
| `tiger` | 4 | blunt | `tiger_nu` | blunt mid: tiger body |
| `greatwhite` | 5 | point | `greatwhite_cy` | point tier4-5: great white |
| `snapjaw` | 7 | croc | `tigershark` | croc tag: broad flat jaw reads closest |
| `anglerfang` | 7 | angler | `smoothhound` | angler tag: stubby body, lure prop carries identity |
| `thornback` | 7 | rock | `bullhead` | rock tag: chunky body |
| `stonejaw` | 7 | rock | `whaler` | rock tag: chunky body |
| `duskfin` | 7 | point | `mako` | point high tier: fast/bulk mix |
| `vex` | 8 | void | `whitepointer` | void tag: neutral bulk, identity from props/shader |
| `abyssmaw` | 8 | angler | `smoothhound` | angler tag: stubby body, lure prop carries identity |
| `riftjaw` | 8 | point | `whaler` | point high tier: fast/bulk mix |
| `venomspine` | 8 | point | `mako` | point high tier: fast/bulk mix |
| `howler` | 8 | blunt | `tigershark` | blunt high tier: heavy bodies |
| `magmaw` | 8 | rock | `bullhead` | rock tag: chunky body |
| `frostjaw` | 8 | blunt | `megalodonrex` | blunt high tier: heavy bodies |
| `wreckfang` | 8 | mech | `greatwhite_cy` | mech tag: neutral bulk, identity from props/shader |
| `ironfin` | 9 | mech | `greatwhite_cy` | mech tag: neutral bulk, identity from props/shader |
| `cindermaw` | 9 | point | `blueshark` | point high tier: fast/bulk mix |
| `glacier` | 9 | blunt | `megalodonrex` | blunt high tier: heavy bodies |
| `gravewater` | 9 | skull | `whitepointer` | skull tag: neutral bulk, identity from props/shader |
| `plaguemaw` | 9 | blunt | `tigershark` | blunt high tier: heavy bodies |
| `sunspine` | 9 | point | `whitepointer` | point high tier: fast/bulk mix |
| `tempest` | 9 | point | `blueshark` | point high tier: fast/bulk mix |
| `bonecrown` | 9 | skull | `greatwhite_cy` | skull tag: neutral bulk, identity from props/shader |
| `mirrorscale` | 9 | point | `whaler` | point high tier: fast/bulk mix |
| `nullfin` | 10 | void | `greatwhite_cy` | void tag: neutral bulk, identity from props/shader |
| `chronos` | 10 | point | `mako` | point high tier: fast/bulk mix |
| `banshee` | 10 | skull | `whitepointer` | skull tag: neutral bulk, identity from props/shader |
| `omenmaw` | 11 | angler | `bullhead` | angler tag: stubby body, lure prop carries identity |
| `solaris` | 11 | point | `whitepointer` | point high tier: fast/bulk mix |
| `hadesmaw` | 10 | void | `megalodonrex` | void tag: neutral bulk, identity from props/shader |
| `apollodon` | 9 | point | `mako` | point high tier: fast/bulk mix |
| `artemisstrike` | 9 | point | `whaler` | point high tier: fast/bulk mix |
| `athenajaw` | 10 | hammer | `scallopedhammer` | hammer head tag |
| `aresrender` | 10 | croc | `tigershark` | croc tag: broad flat jaw reads closest |
| `dionysustide` | 9 | blunt | `whaler` | blunt high tier: heavy bodies |
| `aphroditelure` | 9 | angler | `bullhead` | angler tag: stubby body, lure prop carries identity |
| `medusagaze` | 9 | angler | `bullhead` | angler tag: stubby body, lure prop carries identity |
| `cyclopseye` | 9 | blunt | `whaler` | blunt high tier: heavy bodies |

## Held on the low-poly rig

Never break a row: a row whose textured path fails a gate stays on the
rig it already rendered with. Each hold is one line to revert in
`tools/gen_data.py` once the owning lane clears it (`hse/REQUESTS.md`).

| row | would use | blocked by |
|---|---|---|
| `cookiecutter` | `smoothhound` | HELD: at sil.len 0.85, the shortest row in |
| `mako` | `mako` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `blue` | `mako` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `thresher` | `thresher` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `sawshark` | `thresher` | HELD: identity prop mesh is not textured yet (see hse/REQUESTS.md) |
| `bull` | `whaler` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `goblin` | `greatwhite_cy` | HELD: art3d pins this row to goblinshark (its own silhouette rig) |
| `whaleshark` | `whitepointer` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `megalodon` | `megalodonrex` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `dunkleosteus` | `bullhead` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `greenland` | `megalodonrex` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `gulperfiend` | `smoothhound` | HELD: art3d pins this row to anglerfish (its own silhouette rig) |
| `morayne` | `thresher` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `sailfin` | `blueshark` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `barbhook` | `thresher` | HELD: identity prop mesh is not textured yet (see hse/REQUESTS.md) |
| `coralcrown` | `whaler` | HELD: identity prop mesh is not textured yet (see hse/REQUESTS.md) |
| `stormfin` | `blueshark` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `gloomtide` | `blueshark` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `teslafang` | `whitepointer` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `nocturne` | `blueshark` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `maelstrom` | `whitepointer` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `aurora` | `blueshark` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `vulkan` | `megalodonrex` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `voltaicrex` | `whitepointer` | HELD-L2: rig_morph gate (see hse/REQUESTS.md) |
| `seismos` | `megalodonrex` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `vortexa` | `megalodonrex` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `warbringer` | `greatwhite_cy` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `absolutezero` | `tigershark` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `leviathanrex` | `megalodonrex` | HELD: identity prop mesh is not textured yet (see hse/REQUESTS.md) |
| `leviathan_rex` | `megalodonrex` | HELD: identity prop mesh is not textured yet (see hse/REQUESTS.md) |
| `zeusfin` | `mako` | HELD: identity prop mesh is not textured yet (see hse/REQUESTS.md) |
| `poseidonrex` | `whitepointer` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `hermesdart` | `whaler` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `hephaestusforge` | `megalodonrex` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `heracrown` | `megalodonrex` | HELD: identity prop mesh is not textured yet (see hse/REQUESTS.md) |
| `typhonmaw` | `megalodonrex` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `hydrafang` | `blueshark` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `cerberusjaw` | `tigershark` | HELD-L2: rig_morph gate (see hse/REQUESTS.md) |
| `chimerashark` | `thresher` | HELD: identity prop mesh is not textured yet (see hse/REQUESTS.md) |
| `scyllarender` | `blueshark` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `charybdisvoid` | `megalodonrex` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `minotaurram` | `megalodonrex` | HELD: identity prop mesh is not textured yet (see hse/REQUESTS.md) |
| `harpyshade` | `whitepointer` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `lamiacoil` | `thresher` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |
| `kampechrono` | `megalodonrex` | HELD-L2: rig_morph length-delta gate (see hse/REQUESTS.md) |

Summary of blockers: 45 rows held.

## Texture budget (iPhone)

Measured from the actual JPEG headers inside each GLB, not assumed.

Every bake ships exactly two maps, both **1024x1024** (baked diffuse + tangent
normal), which meets the brief's "<= 1K per texture map per shark", and there
are no per-row textures: 86 rows share 13 assets.

    encoded in the GLB, per model    0.17 - 0.33 MB   (JPEG)
    all 13 shipped GLBs on disk      8.11 MB
    decoded RGBA8 + mips, per shark  10.67 MB         <-- OVER the 6 MB cap
    decoded if all 13 stay resident  138.6 MB

Two budget findings, both OUTSIDE lane O1's files, so they are reported rather
than patched:

1. **Per-shark decode is 10.67 MB against a 6 MB cap.** Two 1K RGBA8 maps with
   a mip chain is 2 x 1024 x 1024 x 4 x 1.333. The maps are already at the
   allowed resolution, so the fix is not a smaller map, it is compressed
   texture upload (KTX2/Basis). `NOTES-rev14-textured.md` already estimates
   ~2.8 MB GPU-compressed at 1K, comfortably inside the cap. There is no
   KTX2Loader or Basis path in shark3d.js today, so every map is decoded to
   RGBA8. Dropping the NORMAL map alone would also land it at 5.33 MB.

2. **`preload()` loads every model eagerly** (`shark3d.js`, `MODEL_KEYS.map`),
   so all 13 textured GLBs are resident at once rather than just the row being
   played: ~139 MB of decoded texture. On a phone that is the more urgent of
   the two. A per-row lazy load, or evicting the previous template on
   `startRun`, would make the resident cost one shark's worth.

Triangles are not a concern: worst case 6790 tris and 1 draw per shark against
budgets of 55k tris and 100 draws.
