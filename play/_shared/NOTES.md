# play/_shared/ notes

## Shared runtime pass 2026-08-16

Owner of this pass: shared-runtime lane. Everything below is ADDITIVE. No
existing GGKit export, signature or observable behaviour was changed or
removed, so a title written against yesterday's kit behaves the same today.

### What changed in the kit

`ggkit.js` grew an input subscription layer, pause-transparent reads, pointer
capture, an audio preference validator, a music ownership token, and an
opt-in render baseline. The contract comment at the top of the file documents
all of it in the existing voice, including which defect each addition retires.

**New input API surface**

| Addition | Shape | Retires |
|---|---|---|
| `kit.input.onDown(fn)` | `fn(pointer, event)` after the kit has created AND stored its pointer object; returns unsubscribe | claim-side defect (a canvas-level claim was overwritten by the kit's own window handler) |
| `kit.input.onMove(fn)` | `fn(pointer, event)` after the position update | - |
| `kit.input.onUp(fn)` | `fn(pointer, event)` BEFORE the entry is deleted; `event` is null for a synthetic drop | release-side defect (the kit's pointerup deleted the id before any later-registered title listener ran, so every release was swallowed) |
| `kit.input.onKeyDown(fn)` / `onKeyUp(fn)` | `fn(code, event)`, fires regardless of pause | paused-side defect, keyboard half |
| `kit.input.pointersRaw` | Map that keeps tracking while paused | paused-side defect |
| `kit.input.firstInRaw(rect)` / `keyDownRaw(code)` | the same reads without pause suppression | paused-side defect |

Design points worth knowing:

- There is ONE pointer object per press. It always goes into `pointersRaw`,
  and into `pointers` only when the kit is not paused, so `pointers`,
  `firstIn` and `keyDown` keep their exact pause-suppressing semantics for
  live play while pause menus read the Raw variants.
- All five subscription hooks fire regardless of pause, because a pause menu
  needs them.
- Subscribers are exception-isolated. A throwing subscriber is logged to the
  console and cannot break the kit or its sibling subscribers.
- `blur`, `pointercancel` and `clearAll()` clear the raw map too, and fire
  `onUp` for everything they drop with a null `event`, so a title can tell a
  cancellation from a release and no gesture can get stuck.

**Naming**: one addition beyond the requested shape. `onKeyDown`/`onKeyUp`
were added alongside `keyDownRaw` because the paused titles need a rising
EDGE, and a per-frame level read cannot see a key pressed and released inside
one frame. `keyDownRaw` alone would have been a behaviour regression for
lantern-bingo. No name conflicts were found; everything else uses the names
in the brief.

### Old deferrals cleared

- **Audio preference validator.** Persisted prefs are sanitised on load and
  re-clamped on every apply: `mute` coerced to boolean, `music`/`sfx` parsed,
  range-checked for finiteness and clamped to 0..1, falling back to the
  defaults. A corrupt store can no longer write NaN into a GainNode.
  Note one deliberate side effect: `applyPrefs()` used to return early
  without saving when the AudioContext did not exist yet, so a mute toggled
  before the first sound was silently lost. It now persists.
- **Music token race.** `music()` takes a monotonic token before its decode
  await and bails if a newer `music()`/`stopMusic()` call has taken
  ownership. A stale start can no longer end up owning the bus.
- **Pointer capture.** The kit now calls `setPointerCapture` on the
  pointerdown target and releases it on up/cancel, so a drag that leaves the
  canvas or the window still delivers its release. Touch pointers are
  implicitly captured by the browser already, so on the fleet's actual target
  device this changes nothing; it is mouse and pen that stop stranding. Opt
  out with `GGKit.create({ pointerCapture: false })`.
- **LICENSES.md.** Added `three/OBJLoader.js`, and while there also
  `three/MTLLoader.js` and `utils/BufferGeometryUtils.js`, which were missing
  for the same reason.
- **`_assets/LEDGER.md` "Used by".** Refreshed against every
  `play/<slug>/LICENSES.md` in the repo (Rev 2). Titles that explicitly
  record a row as "deliberately not used" are not listed. Four rows
  (ui-pack-adventure, racing-pack, pixel-shmup, top-down-tanks-redux,
  input-prompts) are harvested but consumed by no shipped title and now read
  "(none yet)" instead of "(pending)".

### berry-cascade and reef-tiles verdict

Both were verified in a browser BEFORE anything was changed, by driving real
touch drag-release gestures and by probing, from a listener registered after
the title's own, whether the kit still held the pointer id at release time.

- **berry-cascade: GENUINELY BROKEN, and worse than the brief assumed.** Its
  gesture helper guarded release on `kit.input.pointers.has(id)`, which is
  ALWAYS false, so `onUp` never fired for anything. The map screen enters a
  grove on release, so **the live title could not start a level at all**:
  tapping a grove node did nothing, repeatedly, and the scroll drag state
  never cleared. Fixed and re-verified: tapping "Dew Hollow" now loads the
  level, and in-level selection and swap gestures respond.
- **reef-tiles: NOT broken by the release defect.** It keeps its own
  `pointerClaims` map and never reads the kit's, so releases always resolved
  immediately. Verified live: PLAY, level entry and a swap drag all resolve
  on release with the same "NO MATCH" feedback before and after the change.
  Its `seedPointer()` workaround was however inert AND harmful: it keyed off
  `pointer.event.pointerId`, which is undefined for Phaser's TouchEvent, so
  on touch it wrote entries under Phaser's own pointer index with NaN
  coordinates that the kit never deleted. Every boot leaked a stale pointer
  into the shared identity map (measured: `pointers.size === 1` with no
  finger down). Removing it takes the leak to zero.

### Titles migrated

| Title | Was | Now |
|---|---|---|
| berry-cascade | hand-rolled window listeners + seeding, release always swallowed | `onDown`/`onMove`/`onUp` |
| kinetic-burst | local fix using its own `live` map as release authority | `onDown`/`onMove`/`onUp` |
| reef-tiles | `seedPointer()` into the kit's map from Phaser handlers | removed; nothing read it |
| lantern-bingo | own window pointerdown + keydown bridges for paused input | `onDown` + `onKeyDown` + `pointersRaw` |
| ionwake | window pointerdown claim registered after kit init, own capture, manual delete from the kit map | `onDown` + `onUp` |

ionwake was re-verified in a forced race, not assumed: a held touch drag in
the steer zone still produces `zone:'claimed'`, `gameZone:'steer'`, a live
`baseX` and a tracked `x`, the sim steers on it, and both pointer maps are
empty after release. The same probe was run against the pre-change files
served from git HEAD and produced the same claim vector.

### Renderer default (TASK 4, widened mid-pass by the owner bar delta)

`GGKit.renderDefaults` and `GGKit.hiDpi` are exported from `_shared` and are
OPT-IN. Nothing in the 106 live titles changes until a title asks for them.
Adopting them fleet-wide is a SEPARATE later pass and no title config was
edited here.

- `GGKit.renderDefaults` carries `antialias:true` + `antialiasGL:false` (the
  2026-08-13 finding: plain `antialias:true` asks for MSAA, `antialiasGL:false`
  keeps LINEAR filtering without it), plus `roundPixels:false`,
  `pixelArt:false`, `powerPreference:'high-performance'`,
  `failIfMajorPerformanceCaveat:false`, `desynchronized:true`.
- `GGKit.hiDpi.dpr(max)` - device pixel ratio, capped at 3 by default.
- `GGKit.hiDpi.phaser(config)` - returns a NEW config with the render
  defaults merged (caller wins) and the game sized in DEVICE pixels with
  `zoom = 1/dpr`. Phaser 3 has no `resolution` key any more; it was removed
  after 3.16 and is silently ignored, so this is the mechanism that works.
- `GGKit.hiDpi.resize(game, cssW, cssH)` - the same thing for
  `Scale.RESIZE` titles, which take their size from the window.
- `GGKit.hiDpi.three(renderer)` - `setPixelRatio(min(devicePixelRatio, 3))`.
- `GGKit.hiDpi.canvas(cssW, cssH)` - a pre-scaled 2D context for titles that
  bake canvas textures. Draw in CSS units; the backing store is dense. This
  is the "bake at DPR, never bake at 1x and scale up" helper.

Verified rather than assumed, headless at a simulated DPR 3 on a 390x844
viewport: Phaser config path canvas backing store 1170x2532 at CSS 390x844;
Phaser RESIZE path 1170 at CSS 390; Three renderer 1170x2532 at CSS 390px;
baked canvas 192x192 for a 64x64 CSS texture. The audio sanitiser was
verified in the same run: a stored `{mute:'yes', music:'loud', sfx:42}`
loads as `{mute:false, music:0.7, sfx:1}`.

### Regression evidence

Served locally on private port 47137 (this lane's ports were 47131-47137;
never a shared default). Boot correctness only: console errors, failed
requests, lit first frame, colour count. No frame-rate or feel numbers, the
box is contended and has no GPU.

Twelve titles NOT edited by this pass, spanning Phaser and Three, portrait
and landscape, including a GGRacer title and both flagships:

```
PASS  redline-gt        landscape  three   err=0 404=0 colors=630   lit=99%
PASS  cloudhopper       landscape  three   err=0 404=0 colors=896   lit=100%
PASS  torque-trail      landscape  three   err=0 404=0 colors=1376  lit=99.4%
PASS  horde-meridian    portrait   phaser  err=0 404=0 colors=2119  lit=100%
PASS  skyfall-command   portrait   phaser  err=0 404=0 colors=1923  lit=100%
PASS  driftlands        portrait   phaser  err=0 404=0 colors=132   lit=100%
PASS  lunker-lake       portrait   phaser  err=0 404=0 colors=334   lit=100%
PASS  blockborough      portrait   phaser  err=0 404=0 colors=329   lit=100%
PASS  shout-it          portrait   phaser  err=0 404=0 colors=807   lit=100%
PASS  serpentine        portrait   phaser  err=0 404=0 colors=680   lit=85%
PASS  aegis-line        landscape  phaser  err=0 404=0 colors=1274  lit=100%
PASS  hullbreaker       landscape  phaser  err=0 404=0 colors=954   lit=100%
12/12 PASS
```

The five edited titles boot clean as well:

```
PASS  berry-cascade   portrait   err=0 404=0 colors=1314 lit=100%
PASS  reef-tiles      portrait   err=0 404=0 colors=379  lit=100%
PASS  kinetic-burst   portrait   err=0 404=0 colors=1178 lit=100%
PASS  lantern-bingo   portrait   err=0 404=0 colors=838  lit=100%
PASS  ionwake         landscape  err=0 404=0 colors=426  lit=100%
5/5 PASS
```

Gesture behaviour was additionally compared against the pre-change files
served straight from git HEAD through a path-override in the local server,
so "same as before" is measured rather than asserted. That comparison also
cleared a false alarm: kinetic-burst's title pills do not respond to
synthetic CDP touch taps, identically before and after the change, which is
a limitation of the harness and not a regression.

### Not done / for the orchestrator

- Feel and frame rate are unmeasured by design. Everything here is boot and
  input correctness.
- The render baseline is shipped but adopted by nobody. The fleet-wide
  adoption pass owns that, and it is where the "high resolution, distinct
  colours" bar actually gets met: the helpers make it a two-line change per
  title, but somebody has to make it in 106 titles and re-verify each.
- berry-cascade could not start a level on the live site before this pass.
  That is a live regression that has been shipped for some time and the fix
  is not deployed from this lane, since this pass does not deploy.
