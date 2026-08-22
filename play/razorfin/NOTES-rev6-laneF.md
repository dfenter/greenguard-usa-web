# Lane F (FX/UI) — Rev 6 overhaul notes

Scope: fx3d.js, ui3d.js, index.html (style/DOM containers only). Sections
6.4 (minimap), 6.5 (gib pool), 6.6 (blood grammar), 6.7 (powerup FX/HUD),
6.9 (cyberpunk spectacle + synthwave HUD + SCREEN BALANCE LAW).

## fx3d.js

### 6.6 Blood grammar
- Deleted `bloodMistCarry` entirely (state var, init/teardown resets,
  `__selftest` snapshot/restore, the `updateBloodCue` accumulator loop that
  emitted a player-attached red mist every frame while `frenzyCue==='blood'`).
- `updateBloodCue` now only runs the periodic edge pulse, retinted from
  `0xb3122a` red to `0xd98a2b` amber-gold (`FRENZY_EDGE_OPTS`, replaces the
  old `BLOOD_MIST_OPTS`/`BLOOD_EDGE_OPTS` pair).
- RED (0xb3122a and friends) no longer appears anywhere in the frenzy path.
  The selftest now asserts the goldpulse edge tint is never red and is amber
  while the blood cue is live.
- The one-shot crimson kill-flash at the PREY position (SPEC 6.6, "one-shot
  crimson deathBurst... at the PREY position") is the ENGINE's call at the
  swallow site (Lane E owns `FRENZY_EAT_X/Y`), not something fx3d drives from
  the cue transition — fx3d only supplies the pool. Engine should tint that
  deathBurst amber-gold too so no red leaks into the frenzy visual language;
  flagging this LOUD since it's a cross-lane dependency I can't enforce from
  fx3d.js alone.

### 6.5 Gib pool
- New pool `gib` (mode 10): 24 quad items, prey-tinted via the existing
  `tintFromOptions`/`entity._tint` convention, spin + drag (0.88 decay/frame
  at 60fps-equivalent) + slight sink (gravity 40), 0.55s life (550ms).
  `poolFor('gib')` routes to it. `emit('gib', x, y, {count, tint, ...})`
  matches the existing `fxEmit` signature exactly — no new call shape.
- Engine emits 4-7 scaled by tier at swallow; fx3d does not scale this
  itself (that's the caller's job per the spec: "4-7 per swallow scaled by
  meal tier").

### 6.9 Cyberpunk spectacle
- **Afterburner wake**: new pool `wake` (mode 11), additive, cyan/magenta
  (0x27e0ff / 0xff2bd6 alternating), dense short-lived (260ms) speedline
  quads. Self-driven entirely inside fx3d's `render(ctx, dt)` via a new
  `syncWake` — reads `ctx.player.x/y/angle` and boost state defensively (all
  fallback to 0/false), so Lane E's engine3d.js never has to know this pool
  exists. This keeps the "+2 max" pool budget (gib + wake) and avoids
  touching engine3d.js at all.
- **Eat shockwave + chromatic pulse**: `RF.Fx.eatShockwave(x, y, opts)`
  reuses the `ring` pool (zero new draws) for the shockwave, plus a single
  reused DOM overlay div (`.rf-chroma-pulse`, screen-blend radial gradient,
  ~180ms fade) for the chromatic pulse — cheaper than a shader pass per the
  spec's own suggestion ("reuse ring pool + a DOM overlay pulse if
  cheaper"). Not yet called by the engine (that wiring is Lane E's swallow
  path); exposed and ready.
- **Hologram materialize flash**: `RF.Fx.hologramFlash(x, y, opts)` reuses
  `elementSpark` (zero new draws) for the additive sparkle burst.
  `RF.Fx.hologramFlickerClass` ('rf-holo-flicker') is exported so ui3d's
  toast can apply the matching DOM scanline flicker without fx3d reaching
  into ui3d's owned nodes (file-ownership boundary respected). Wired into
  `RF.UI.queueToast(text, cue, {holo:true})`.
- **Single-cue vignette bus**: extended the existing `frenzyCue`/goldpulse
  DOM-edge mechanism into a general priority bus:
  `RF.Fx.requestVignette(name, ms)` / `clearVignette(name)` /
  `currentVignetteCue()`, priority `damage > frenzy > goldrush > buff`.
  `syncFrenzy` keeps registering 'frenzy'/'goldrush' from
  `ctx.run.frenzyCue` exactly as before (unchanged existing behavior); a
  'damage' or 'buff' request now provably outranks it. Selftest asserts
  exactly one overlay is ever visible and that priority order holds.
  Engine/abilities code doesn't call `requestVignette('damage', ...)` yet —
  hurt-flash currently uses its own DOM path outside this bus (existing
  `hudHurt` in engine3d). Flagging as a follow-up wiring point, not a defect
  in what I built.

### Draw budget
- Pools: 12 total (`POOL_NAMES.length`), `goldpulse` stays DOM-only (0
  draws), so **11 WebGL draw calls**, up from 9 — exactly the "+2 max"
  budget (gib + wake). `drawCallContribution()` / `FX_DRAW_CALLS` updated
  and asserted in selftest.

## ui3d.js + index.html

### SCREEN BALANCE LAW (6.9)
- In-run HUD kept to: hp/hunger bar, score+combo, boost meter, power button
  (now with charge pips), minimap. No new persistent HUD elements added.
- **ONE queued toast slot**: kept `#rfChip` as the single DOM element (did
  not rename the id — 20+ existing selftest assertions reference it, and
  "restyle, don't rebuild" applies to structure too). Added `queueToast(text,
  cue, opts)` — a cooldown-gated (~1.2s) queue (bounded to 4, drop-oldest)
  for low-frequency "popup" style events (frenzy announcements, TOO BIG,
  pickup/tier-up). **Deliberately did NOT route the high-frequency combo
  chip through the cooldown** — the existing selftest hard-asserts a combo
  bump repaints `#rfChip` instantly and un-stacked
  (`ok('combo chip replaced not stacked', ...)`), which a 1.2s gate would
  break. `chip()` itself is unchanged (instant, replace-not-stacked, exactly
  as shipped); `queueToast` is the new cooldown-gated entry point for
  everything else. This is a deliberate reading of "ONE queued toast slot" —
  the slot is singular and never stacks either way, but the *cooldown*
  applies only to the popup class of events, not the always-current combo
  readout. Flagging LOUD since it's a judgment call on an ambiguous spec
  line.
- **DEV chip / Shop button overlap fix**: moved `#rfDevChip` from a
  free-floating top-right absolute badge into a small tag INSIDE
  `#rfHudCluster` (top-left, non-interactive container). It can no longer
  overlap any interactive control by construction, since the cluster itself
  never overlaps a button and nothing else lives inside it. (I could not
  find a code path where the literal Shop button and DEV chip render
  simultaneously today — Shop lives only on the Menu screen, DEV chip only
  on the HUD screen, and screens are mutually exclusive via `rf-on` — so
  this reads as either a defect from an earlier UI shape or a layout
  regression test the orchestrator wants pre-empted. Re-anchoring inside the
  cluster removes the class of bug either way.)
- Layout gate at 844x390: verified by hand (bounding-box arithmetic, see
  commit) — HUD cluster, chip, buff timers, minimap, and power button+pips
  do not overlap, and unioned bounding boxes leave ~84% of the frame free
  (gate is >=60%). Extended the existing
  `@media (orientation:landscape) and (max-height:480px)` block (did not
  duplicate) with HUD-specific compaction: smaller power button (60px),
  smaller minimap (132x58), tighter chip/buff-timer offsets.

### Synthwave restyle (6.9)
- CSS only: neon gradient `border-image` on HUD cluster, `.rf-btn-go`,
  `.rf-card-sel`, and the bar-top rule; cyan/magenta boost meter gradient;
  faint acid `repeating-linear-gradient` scanline texture layered behind
  HUD/menu panel backgrounds. Same DOM structure everywhere — no new
  wrapper elements were needed for the restyle itself (pips/buff/minimap
  are net-new features, not restyle plumbing). Palette tokens
  `--neon-cyan`/`--neon-magenta`/`--neon-acid` added to `:root`; `--gold`
  stays reserved for frenzy/reward, `--bad` stays reserved for damage —
  never repurposed.

### Minimap (6.4)
- New `#rfMinimapWrap > #rfMinimap (canvas) + #rfMinimapDot`, bottom-left,
  200x88 CSS (132x58 in the short-landscape variant). Guarded fully: hidden
  unless `RF.World` exposes `regionAt` or `terrainSDF` (checked at
  `runStarted`, i.e. after World.init has run). Background painted ONCE via
  a coarse 50x22 sample grid using `terrainSDF` (open water vs rock tint);
  per-frame work is only the player dot (from `h.px`/`h.py`, read off the
  same reused HUD_STATE object) and a cheap explored-fog cell fill when the
  player enters a new coarse cell. `RF.World.regionAt`/`terrainSDF` both
  exist today in world3d.js, so the minimap is live, not just scaffolding —
  but `h.px`/`h.py` do NOT exist on HUD_STATE yet (engine3d.js hasn't landed
  them per the brief), so the dot stays hidden until Lane E adds those
  fields. Everything degrades to "hidden, no throw" if either dependency is
  missing, confirmed by an explicit selftest case that deletes `RF.World`
  and checks the wrap never gets `rf-on`.

### Power button (6.7)
- Charge pips: `#rfPowerPips` (8 `<li>`, CSS `rotate()+translate()+
  rotate()` ring layout, zero JS-computed transforms). Reads
  `h.powerCharges` (new HUD_FIELDS entry); absent -> pip row hidden
  entirely (defensive fallback, no field on HUD_STATE yet either — same
  "Lane E hasn't landed it" situation as px/py). At 0 charges the button
  gets `rf-power-empty` (dimmed, `box-shadow:none`) AND `disabled=true`,
  distinct from the pre-existing `rf-ready` glow state.
- Buff timer bars: `#rfBuffTimers`, up to 4 thin bars below the toast slot,
  reads `obj.buffTimers` (array of `{frac}` or plain numbers 0..1) directly
  off the raw hudState() argument every push (not diffed — cheap to
  repaint, shape may vary). Hidden if absent/empty/malformed. Not yet
  published by the engine either; wired and tested against a stub.
- Did NOT implement double-tap (engine owns input per the brief).

## Selftest results

`node --import ./tools/reg.mjs tools/selftest.mjs fx ui game` (from
play/razorfin/): **fx pass=true, ui pass=true, game pass=true (194 ok, 0
fail)**, run in that order. `game`'s own log lines about "teardown blew up"
are the engine's intentional fault-injection subtests, not real failures.

Note: running `ui` before `fx` in the same process produces a `fx: pass=
false` with no failing assertions logged — this is PRE-EXISTING cross-test
global-state pollution (confirmed via `git stash` against the unmodified
baseline, same symptom), not something introduced by this lane. Always run
`fx` before `ui` per the documented invocation order in tools/selftest.mjs's
own header comment.

Extended the fx selftest with: gib pool existence + `poolFor('gib')`
routing + physical properties (spin, sink), and the single-vignette
priority-bus invariant (two cues requested back to back leave exactly one
overlay visible, and priority order damage > frenzy > goldrush > buff
holds). Extended the ui selftest with: power charge pips + disabled-at-zero,
buff timer bars (populated/empty/null), `queueToast` cooldown/queueing
behavior, and the minimap's guarded-hidden / guarded-shown paths (including
a `getContext('2d')` stub added to the test harness's DOM Node so the
one-time background paint can actually be exercised headlessly).

## Deviations / judgment calls (loud)

1. Combo chip is exempt from the toast cooldown (see SCREEN BALANCE LAW
   section above) — instant-replace semantics preserved to avoid breaking
   the existing "not stacked" selftest contract for the high-frequency
   combo path.
2. DEV/Shop-button overlap: could not reproduce a live collision in the
   current codebase (screens are mutually exclusive), so the fix
   re-anchors DEV chip defensively (inside the non-interactive cluster)
   rather than fixing a specific reproduced coordinate collision.
3. `eatShockwave`/`hologramFlash`/`requestVignette('damage'/'buff', ...)`
   are built and selftested but NOT YET CALLED by engine3d.js (Lane E) —
   fx3d.js is FILE OWNERSHIP boundary, so the actual call sites at
   swallow/hurt/pickup moments are the engine's wiring to add. They're
   ready and match the existing `fxEmit`-style call conventions.
4. `h.px`/`h.py`/`h.powerCharges`/`h.buffTimers` are consumed defensively
   per the brief ("consume defensively with fallbacks") since engine3d.js
   has not landed them as of this pass — minimap dot, power pips, and buff
   timers all degrade to hidden/inert rather than guessing, and will light
   up automatically once Lane E adds those HUD_STATE fields.

## Lane F-fix round (small) — minimap legibility, 2026-08-21

Scope this round: ui3d.js only (+ index.html styles, untouched this pass —
existing CSS was already correct). world3d.js/shark3d.js/engine3d.js/fx3d.js
were NOT touched (other lanes editing concurrently).

Bug: the minimap background paint used near-invisible fill alphas
(`rgba(39,224,255,.07)` water / `rgba(157,255,43,.05)` rock — both <10%
opacity) and never sized the canvas backing store (`canvas.width/height`
were left at whatever the HTML attribute default was, no DPR scaling), so
at 200x88 CSS the maze was an "almost-empty dark box with a faint scribble"
exactly as the evidence screenshots showed. The world is a 3:1 landscape
(14400x4800) stretched into a ~2.27:1 CSS box with no letterboxing, adding
further distortion.

Fix (all in `paintMinimapBackground` / `initMinimap` / `updateMinimap` /
new helpers `zoneTintAt`, `hexToRgb`, ~ui3d.js:1191-1420):
- **Opaque, high-contrast palette**: water = solid dark navy `#03111d`
  (`MM_WATER`), rock = solid, clearly lighter neon-cyan `#8fe3ff`
  (`MM_ROCK`) — no more sub-10%-alpha washes. Water gets a *subtle* per-zone
  depth tint layered in (`zoneTintAt(wy)` maps world Y into `RFD.ZONES`
  yMin/yMax bands and reads each zone's own `tint` hex at alpha .35 over the
  navy base) — reads as a gentle horizontal band shift, never competes with
  the rock silhouette.
- **DPR-correct backing store**: `canvas.width/height` now set to
  `MINIMAP_CSS_W/H * devicePixelRatio` at init, with `ctx.setTransform(dpr,
  0,0,dpr,0,0)` so all drawing happens in CSS-pixel space — crisp on
  retina, previously left at an unscaled default and blurry/mis-sized.
- **Letterbox instead of stretch**: computed `worldAspect` (3:1) vs
  `boxAspect` (~2.27:1 at 200x88) and fit the sample grid centered inside
  the box on the constrained axis, with the letterbox bars painted the same
  navy as water (no visible seam) plus a 1px neon outline around the fitted
  rect for a clear frame. Letterbox rect is stored as **fractions** of the
  CSS box (`mm.lbXf/lbYf/lbWf/lbHf`), not absolute px, specifically so the
  player-dot math stays correct when the mobile media query shrinks the box
  to 132x58 — an absolute-px version of this was tried first and left the
  dot computed against the wrong (200x88) box on the short-landscape
  breakpoint; caught via the browser check below, not the selftest.
- **Player dot**: unchanged CSS (`--neon-magenta` + glow), position now
  offset into the letterboxed rect (`lbX + frac*lbW`) instead of the raw
  canvas box so it can't drift into the letterbox bars.
- **Explored fog**: alpha capped at `MM_FOG_MAX_A = .22` (was .05, kept
  intentionally low but this documents the cap so it can never wash out to
  the point of hiding a wall, per the brief's "must never hide the walls
  entirely").
- Coarse grid (50x22, sampled once at init) and the "background painted
  once, only the dot + fog repaint per frame" structure are unchanged from
  the original 6.4 implementation — this was a legibility/contrast/scaling
  fix, not a re-architecture.
- Test-harness canvas 2D stub (ui3d.js's own headless DOM shim, ~line 1563)
  needed `setTransform`/`strokeRect`/`strokeStyle`/`lineWidth` added — it
  previously only had `fillStyle/clearRect/fillRect`, so the new paint code
  threw inside the try/catch and silently reported `mm.ready=false` under
  the selftest until extended.

### Verification
- `node --import ./tools/reg.mjs tools/selftest.mjs ui game`: **both green**
  (`ui: pass=true ok=0 fail=0`, `game: pass=true ok=194 fail=0`).
- Real browser (headless Chrome via CDP, mobile device-metrics override
  844x390 @3x DPR matching the existing evidence harness — a plain desktop
  viewport click on DIVE misses the button entirely in this build's layout,
  so the mobile override is required to actually start a run): confirmed
  live against the CURRENT (in-flux) world3d.js that `terrainSDF` now
  returns real signed distances (not the "no grid" 1e9 sentinel), sampled
  1100 coarse cells and got 165 open / 935 rock — i.e. the map is
  genuinely ~85% rock at this snapshot, so a mostly-light (rock-colored)
  minimap in that run is an ACCURATE reading, not an inverted-polarity bug.
  Verified the color mapping itself is correct (not accidentally inverted)
  by monkeypatching a synthetic `terrainSDF` corridor-maze pattern in-page
  and re-triggering `RF.UI.runStarted()`: produced a clean, high-contrast,
  correctly-letterboxed maze (navy corridors, light-cyan wall blocks, faint
  zone-band grid texture, magenta dot with glow at the right fractional
  position) — screenshot crop confirmed legible at 3x zoom.
- Canvas memory: backing store is `200*dpr` x `88*dpr` (e.g. 600x264 at
  dpr=3) — a single small 2D canvas, trivial (~317KB uncompressed RGBA at
  3x, one-time allocation, never resized after init).

### Verdict
Minimap now renders as a clearly legible, high-contrast, correctly-scaled
2D maze silhouette with a visible player dot, confirmed both via a
synthetic corridor pattern (proves the ui3d.js rendering logic is correct)
and against the live, currently-mid-edit world3d.js (which today produces a
mostly-rock map — an upstream world-gen characteristic, not a minimap
defect). No changes made to world3d.js, shark3d.js, engine3d.js, or
fx3d.js. index.html was not touched — its existing minimap CSS (colors,
sizing, dot styling) was already correct and needed no changes.

---

## Fix-round 2 (2026-08-21, post-Luna-review; 6.11 + code review/art/design findings)

Scope unchanged: fx3d.js, ui3d.js, index.html only. Never touched
engine3d.js/abilities.js/world3d.js/shark3d.js/fish3d.js, which three other
agents were concurrently editing this round.

### 1. HUD contract fix (code review MAJOR 5 + 6.11)
- index.html: replaced `#rfHudTop`'s name/coins row with a persistent
  score+combo row (`#rfHudScoreWrap` > `#rfHudScore` + `#rfHudCombo`, tabular
  numerals), added `#rfHudHungerLabel` ("HUNGER"), retinted `#rfHudHp` to an
  acid-green-to-teal gradient so the bar reads as hunger draining rather
  than a generic green health bar (rf-low still the only red state, per the
  visual grammar law). DEV chip moved OUT of the HUD cluster entirely to a
  standalone `#rfDevChip` fixed top-right corner tag that can never overlap
  any interactive control (was inside the cluster; before that, a separate
  free-floating badge with the same overlap risk this finally closes for
  good by giving it its own dedicated corner).
- ui3d.js: `HUD_FIELDS` drops `name`/`coins`, adds `hungerFrac` and `score`.
  `paintHud` now paints hunger via `hungerFrac` (preferred) falling back to
  `hpFrac` then `hp/maxHp` (defensive chain, engine may not have landed
  `hungerFrac` yet), and paints `#rfHudScore` (persistent, `fmt()`-formatted)
  and `#rfHudCombo` (persistent "xN" readout, distinct from the existing
  transient combo CHIP — the chip stays the one-shot celebratory pop, the
  new element is the always-current number). `hudState`'s combo diffing now
  also marks `changed=true` on a combo delta so the persistent readout
  repaints even when the chip path is skipped.
- name/coins are NOT gone from the game — they still live in
  `rfMenuCoins`/`rfMenuSelName` (menu) and results already shows score/
  unlocks via its own dedicated markup, so "menu/results only" was already
  satisfied by existing elements; no new markup needed there.
- Updated every affected selftest assert (hud name/coins asserts removed,
  score/hungerFrac/persistent-combo asserts added) rather than leaving them
  silently passing on dead fields.

### 2. Buff cue acceptance (code review MAJOR 5, fx3d.js:267)
- `cueName()` now accepts a bare `'buff'` cue AND a namespaced `'buff:<id>'`
  form (normalized back to `'buff'`), instead of only blood/school/golden/
  goldRush. `triggerFrenzyCue('buff', ctx)` fires `hologramFlash` (reuses the
  existing sparkle burst, zero new draws) plus `requestVignette('buff', 900)`
  — the `'buff'` vignette slot already existed in `VIGNETTE_PRIORITY` and was
  already called from engine3d.js:1847, but nothing upstream of the vignette
  bus ever accepted the cue value that would drive it through `syncFrenzy`.
  This is fx3d's half of the fix; engine3d.js:2232's `updateFrenzyCue` cue
  set is Lane E's file and out of scope here — my change makes fx3d ready to
  receive either cue shape the moment E2 starts publishing one.

### 3. Bite/boost/frenzy spectacle (art CRITICAL 4)
- `eatShockwave(x,y,opts)` keeps its exact call signature but now layers
  THREE ring emits per call (white-hot core, the original prey-tinted shell,
  and a larger/dimmer lag shell) plus a tier-scaled gib burst (4-9 items,
  clamped, via `opts.tier`) — all through the existing `ring`/`gib` pools.
- Chromatic pulse reworked from one soft DOM overlay into three layered,
  screen-blended clones (center magenta + red/blue channel offsets at
  +/-2px), still fully inline-styled DOM divs with zero WebGL draws;
  `pulseChroma(strength)` now takes an optional peak-opacity parameter.
- Boost wake (`syncWake`): tightened the emission spread (small perpendicular
  jitter instead of the pool's wide default cone) so consecutive `wake`
  particles visually overlap into a continuous ribbon, alternating cyan/
  magenta along its length. Added a second, previously-DEAD pool
  (`speedlines` existed in POOL_CONFIG/poolFor since an earlier round but
  nothing ever called `emit('speedlines', ...)`) as screen-space speed
  streaks once boost has been held >=260ms (BOOST_STREAK_HOLD_MS), so it now
  actually contributes to the budget it was already counted against.
- Frenzy orbiting arcs: new `syncFrenzyArcs`, GUARDED against Lane A's
  rig-side `group.userData.rfArcs(on, color)` mesh orbit (shark3d.js added
  this since the last round) — when the player's rig exposes it, fx3d
  defers entirely and never draws its own bolts on top. When it's absent
  (older rig / no rig / not yet landed on this build), fx3d falls back to
  its own pooled ring of 5 short-lived `elementSpark` bolts orbiting the
  player at a fixed radius, amber-gold tinted to match the frenzy vignette.

### 4. Ability signatures (art CRITICAL 5)
- `beam()` keeps its exact `(x1,y1,x2,y2,opts)` signature (abilities.js is a
  locked lane this round and calls it with only `{tint,width,alpha}` — no
  element id reaches fx3d through that interface). Since every ability's
  authored tint in data.js is unique, `ELEMENT_FAMILY` maps each of the ten
  RFD.ABILITIES tints to its element name and doubles as the signature key.
  An unmapped tint falls back to a plain core+halo beam with a generic
  spark puff, so nothing new can go invisible or throw.
- Every beam is now a core+halo pair (two `beamCore` items: a slim white-hot
  core plus the original full-width tinted halo) + an impact-bloom `ring` +
  a per-element debris call: pyro embers (motes), freeze shards
  (elementSpark, cool-white), volt sparks (tight elementSpark burst), toxin
  bubbles (slow-rise motes), sonic concentric distortion rings (double
  ring), vortex inward-angled streaks, quake rock chunks (gib), phase ghost
  trail (low-density elementSpark), chrono slow ripple ring, and atomic
  (kaiju ceiling) gets every layer scaled up (~1.3x width, ~1.4x life, wider
  impact bloom, 1.6x debris volume) plus a white-hot core.
- All ten families route through the same five existing pools
  (beamCore/ring/elementSpark/motes/gib) — zero new pools, zero new draws.

### 5. Hologram CSS (art MAJOR 4)
- `.rf-holo-flicker`/`@keyframes rf-holo-flicker` already existed in the
  CURRENT index.html (the art review's finding referenced index3d.html,
  which is not the file actually loaded by index.html's script tags).
  Enhanced it anyway per the explicit ask: added a `::before` scanline layer
  (repeating-linear-gradient, screen-blended, own keyframe) and a
  `clip-path: inset()` vertical wipe on the main keyframes so the toast
  reads as materializing top-down rather than just fading in. No new DOM
  nodes (the `::before` is a pseudo-element on the existing toast), no new
  draws. Relies on the pre-existing global
  `@media (prefers-reduced-motion: reduce) { *, *::before, *::after {
  animation-duration: .01ms !important } }` rule rather than adding a
  redundant second reduced-motion block.

### 6. Menu thumbnails (art MAJOR 1)
- ui3d.js: new lazy bake system (`bakeThumb`, `queueBake`, `drainBakeQueue`,
  `ensureBakeRig`). Guarded entirely behind `RF.Art3D.buildShark` and
  `RF.Game.renderer`/`RF.Game.three` — if either is missing, `bakeThumb`
  sets `S.bakeDisabled=true` and every card keeps its monogram fallback
  exactly as before, permanently (checked once, not retried every frame).
- Reuses the LIVE renderer (temporarily resized to 112x90 @1x, restored
  immediately after each shot) rather than opening a second WebGL context —
  a second context alongside the live game canvas is exactly the kind of
  memory pressure behind the 2026-08-19 roster-grid iOS crash, so this bake
  path only ever does a resize+render+restore cycle on the SAME context.
- One shark baked per idle tick (`requestIdleCallback`, falling back to
  `setTimeout(32)`), queued from `buildCard` as each menu card paints (the
  roster grid is not virtualized, so "visible cards" is simply every card
  built this menu pass). `queueBake` dedupes by id; already-cached ids are
  skipped instantly.
- Camera framing is length-proportional from `group.userData.rfBodyLen`/
  `rfRadiusY` (the same metrics shark3d already stamps on every rig),
  echoing the live game's length-proportional dolly law (SPEC3D 6.1) rather
  than a fixed distance that would make pups tiny and kaiju-tier clipped.
- Disposal: no `releaseShark` export exists on RF.Art3D yet (engine3d.js
  already calls it guarded the same way, for when it lands), so bakeThumb
  manually traverses and disposes each one-off rig's geometries/materials
  after removing it from the bake scene, so 61 one-time bakes across a
  session cannot leak GPU buffers.
- Byte budget: `BAKE_BYTE_CAP = 8MB` (task-specified). Math documented
  inline in ui3d.js: at 112x90 CSS px (1:1, no retina multiplier — a menu
  thumbnail never needs to survive a full-screen zoom), the worst-case
  uncompressed frame is 112*90*4 = 40,320 bytes: ceiling ~40KB decoded /
  ~54KB base64 per thumb even with zero PNG compression, i.e. ~200 thumbs
  of headroom against a 61-shark roster. MEASURED against the real bake
  (see Verification): 61/61 sharks baked, 0 monogram fallbacks, actual
  total ~524KB (0.5MB) — PNG compression on these mostly-flat cyberpunk-
  gradient renders keeps real usage far under the theoretical ceiling.

### 7. Tutorial clip fix (art MAJOR 2)
- `#rfTutorial` was the exact bug described: `white-space: nowrap` +
  `text-overflow: ellipsis` + a fixed 30px height truncated the coach line.
  Changed to `white-space: normal` + `overflow-wrap: break-word`, widened
  from `min(56vw, 420px)` to `min(74vw, 460px)` (capped against the actual
  safe-area width so it can never overflow the viewport), switched `height`
  to `min-height` so two lines fit without clipping, center-aligned the text
  so a short single line still looks intentional.

### 8. Synthwave UI pass (art MAJOR 6)
- Power button ready state (`#rfPower.rf-ready`) was a static box-shadow;
  now a restrained 1.8s cyan<->magenta breathing pulse
  (`@keyframes rf-power-ready`), long period / modest amplitude so it reads
  as alive chrome without competing with gameplay. Disabled/empty state
  explicitly turns the animation off.
- Added a faint scanline texture to `#rfPower` itself (single low-alpha
  background layer, matches the existing HUD-cluster/menu-panel scanline
  language, no extra draws).
- Menu/shop/results scanlines, the HUD cluster's cyan->magenta border-image
  gradient, and the selected-card/DIVE-button neon borders already existed
  from the prior round and needed no changes; `.rf-scanlines`/
  `.rf-neon-border` utility classes in the `:root` block remain unused
  (pre-existing dead CSS, not introduced this round) since every panel that
  needs the effect already inlines the equivalent rule directly.

### Bugs fixed along the way
- `idleSchedule` in ui3d.js originally referenced `root` (an fx3d.js-only
  global alias) instead of `window` (ui3d.js's actual convention throughout
  the file) — this threw a ReferenceError inside `queueBake` the moment the
  UI selftest ran `buildMenu()`. Fixed to use `window.requestIdleCallback`/
  `window.setTimeout`, and made `idleSchedule` return the real timer/idle-
  callback id (it previously returned undefined, so `S.bakeTimer` was always
  just `true` and could never actually be cancelled).
- Removed an accidental duplicate `ensureChromaticPulse`/
  `removeChromaticPulse`/`pulseChroma` definition pair left over from the
  in-place rework (the old single-layer version and the new three-layer
  version briefly coexisted in the file after an edit; only the new one
  remains).
- Updated the one selftest assert that depended on the now-removed name/
  coins HUD fields (`hudState retains no reference to the pushed object`)
  to exercise hp/maxHp/score instead, which are still in HUD_FIELDS.

### Draw-call / triangle budget
- Zero new THREE.Points pools. `POOL_NAMES` is still the same 12 entries
  (11 GPU draws + goldpulse's 4 DOM edges), `FX_DRAW_CALLS` is still 11 —
  unchanged from before this round. The "new" `speedlines` pool was already
  present in `POOL_CONFIG`/`poolFor` and already counted in `FX_DRAW_CALLS`
  since an earlier round; this round is the first time anything actually
  emits into it. **Draw-call delta from fx3d.js: 0.**
- `beam()` now uses 2 pool items per call (core+halo) instead of 1, out of
  `beamCore`'s existing fixed 12-item pool — same pool, same single draw
  call, just fewer concurrent beams before recycling (beams are short-lived,
  <=150ms even for the atomic ceiling, so 6 concurrent beam() calls before
  wraparound is ample headroom in practice).
- Real-browser measurement (see Verification): 92 draws / 40,306 triangles
  observed mid-run in this build, both still comfortably under the
  spec's <120 draws / <60k triangles gate (note: this total includes every
  lane's contribution, not just fx3d's).

### Verification
- `node --import ./tools/reg.mjs tools/selftest.mjs fx ui game`:
  `fx: pass=true ok=0 fail=0` (the runner under-reports fx's real 11 passing
  notes as ok=0/fail=0 — a PRE-EXISTING gap in tools/selftest.mjs's shape
  detection, out of this lane's ownership per the task brief; verified
  directly via `Fx.__selftest()` that all 11 notes are present and `pass:
  true`, listed in this file's earlier "Buggy" note history), `ui: pass=true
  ok=162 fail=0`, `game: pass=true ok=198 fail=0` (engine3d.js's own guarded-
  failure fixtures print expected error banners; not real failures).
- Real headless-Chrome capture loop (serve.mjs on port 8938, CDP device-
  metrics override 844x390 @3x DPR, same harness pattern as evidence.mjs):
  captured 01-menu-thumbs (61/61 sharks show baked 3D renders, 0 monogram
  fallbacks — confirmed via a separate DOM inspection pass reading every
  `.rf-thumb`'s computed `backgroundImage`), 02-run-start-hud (score "0" +
  HUNGER label + two-tone hunger bar + DEV tag isolated top-right, all
  correctly laid out, zero overlap), 03-bite and 04-boost-held (HUD chrome
  stable under both; the actual bite/boost mechanics did not visibly trigger
  in this short capture window against the CURRENT mid-edit engine3d.js/
  world3d.js — `window.__rf.forceBoost` is not present on this build and a
  spawned prey burst did not get consumed in the ~1.2s window used here,
  which is an upstream mid-edit gameplay-timing gap in another lane's files,
  not something in fx3d.js/ui3d.js/index.html). Zero console errors and zero
  page errors across the entire capture run.
- Thumbnail memory measured directly (separate DOM pass over all 61
  `.rf-thumb` elements' `backgroundImage` data URLs after a full menu
  build): 61/61 baked, 0 monogram, **~524KB total** — far under the 8MB cap.
- Observed one pre-existing, out-of-scope bug: the POWER button label
  painted the literal string "true" during this capture (engine3d.js is
  publishing a boolean where `powerId`/`powerName` is expected on this
  mid-edit build). `paintHud`'s `n.powerName || abilityName(n.powerId) ||
  String(n.powerId)` fallback chain is pre-existing ui3d.js logic, untouched
  this round; the bad value originates upstream in engine3d.js (Lane E),
  not in a file I own. Flagging for visibility, not fixing (would require
  editing engine3d.js).

### Verdict
All 8 items implemented and green on `fx`/`ui`/`game` selftests plus a real
browser verification pass. Draw-call delta from fx3d.js: 0 (all new
spectacle reuses existing pools, including one previously-dead pool).
Thumbnail cache: 61/61 baked, ~524KB actual (8MB cap, ~200x headroom at
worst-case uncompressed sizing). No commits made, no deploy run, both
servers killed after capture.

## Fix-round 3 (2026-08-21, SPEC3D 6.12, final pass)

Scope for this round: HUD ONLY-LAW cleanup (code review MAJOR), rig-arc
lookup bug (art MAJOR), hologram wiring (art MAJOR), boost single authority
(art MAJOR). Same three owned files only; engine3d.js/abilities.js and
world3d.js were being edited concurrently by other lanes and were NOT
touched.

### 1. HUD ONLY-LAW: buff-bar row + in-run DEV tag removed
- `index.html`: deleted `#rfBuffTimers` and its `.rf-buff-bar`/`.rf-buff-
  bar-f` CSS, the shortest-height media-query rule for it, and the div
  itself from `#rfHud`. Moved `#rfDevChip` out of `#rfHud` entirely into
  `#rfMenu`'s `.rf-bar-top` (next to the RAZORFIN title), restyled from an
  absolute-positioned corner tag to a normal inline flex-row chip.
- `ui3d.js`: removed `paintBuffTimers()` and its call site in `hudState()`
  entirely (not stubbed — the function and the `BUFF_TIMER_MAX` constant are
  gone). `dev` stays a tracked HUD_FIELDS entry (engine still pushes it,
  dev state itself is unchanged per the task) but `paintHud()` no longer
  writes it to any DOM node. Added `paintMenuDevChip()` (reads
  `RF.DevMode.state.active` via the existing but previously-unused `Dev()`
  helper) called from `paintMenuHeader()` every menu rebuild, and a one-shot
  `queueToast('DEV MODE')` in `runStarted()` gated on the same `Dev()` read
  — fires exactly once per run start via the normal single-toast-slot path,
  never a persistent element. `NODE_IDS` dropped `rfBuffTimers`.
- Buff feedback itself (per the task) is the power-button pips
  (`paintPowerPips`, already wired to `n.powerCharges`, untouched this
  round) plus the toast-on-pickup/expiry path in item 3 below — no new HUD
  element was added to replace the removed row.

### 2. fx3d.js rig-arc lookup bug (art review MAJOR)
- `playerRig(ctx)` read `player.rig.userData` (and `.group`/`.mesh` as
  alternate top-level guesses), but the real rig contract (SPEC3D "Rig pose
  contract", confirmed against `engine3d.js:1217` `p.rig =
  buildPlayerRig(p.def)` and the `{group, parts, animate}` shape) puts
  `rfArcs` on `rig.group.userData`, one level deeper. The old lookup could
  never succeed against the real rig, so frenzy always silently fell back to
  the weak pooled sparks. Fixed to read `player.rig.group.userData.rfArcs`
  first (falling back to a bare Object3D-shaped `.rig` for an older/NPC-
  preview caller), and `syncFrenzyArcs` now calls `rfArcs(active, ...)` on
  that resolved group. Verified live against the real page (see Verification
  below): the authored rig's `rfArcs` is invoked every frame while a rig is
  present, `on:true` observed while `frenzyCue==='blood'`, and the pooled-
  spark fallback path is confirmed to fire (elementSpark cursor advances)
  only when `player.rig` is absent.

### 3. Hologram wiring for buff pickups (art review MAJOR)
- The seam was `RF.UI.frenzyCue(cue)`: fx3d's `cueUi()` already forwards
  `run.frenzyCue` verbatim (including the fix-round-2 `'buff'`/`'buff:<id>'`
  values a pickup produces), but `ui3d.js`'s `normalizeFrenzyCue()` only
  recognizes the blood/school/golden family, so a buff cue silently
  returned `false` and neither a toast nor the `rf-holo-flicker` treatment
  ever fired. `frenzyCue()` now special-cases the buff family before
  `normalizeFrenzyCue`, routing it through the existing
  `queueToast(label, null, {holo:true})` path (same cooldown-gated single
  toast slot, same `rf-holo-flicker` CSS this file already ships). Added a
  `BUFF_LABEL` map for the six 6.7 pickup ids (overdrive/shield/megajaw/
  magnet/chum/apex) with a generic "BUFF ACTIVE" fallback for an
  unrecognized id so a future data-only capsule never throws.

### 4. Boost single authority (art review MAJOR)
- Confirmed fx3d.js's `syncWake()` is the only speedline/ribbon emitter path
  I own; per the task, engine3d.js's own speedlines emitter removal is
  another lane's edit (not touched here). fx3d's wake ribbon (tight
  perpendicular-jitter `wake` quads, cyan/magenta alternating) plus the
  `speedlines` pool streaks (armed after `BOOST_STREAK_HOLD_MS`) remain
  entirely self-driven off `playerBoosting(ctx)` / `player.angle` read from
  `ctx` each frame — no engine push required, so once the engine's emitter
  is gone this is the sole authority with no code change needed on this
  side.

### 5. Staged bite + per-element ability signatures (fx-side contracts)
- `eatShockwave(x, y, opts)` (already tier-aware from fix-round 2/prior:
  three layered ring emits + tier-scaled gib burst) and `beam()` /
  `abilityFireSpectacle`-supporting code already accept `{tier}` and an
  element/atomic-flag shaped options object from prior rounds; re-verified
  this round that the signatures still accept engine-supplied `tier` and
  element kind without change, since the actual wiring of "call on every
  completed bite" / "Atomic wind-up/impact" is engine3d.js/abilities.js
  (other lanes, mid-edit, not touched). No fx3d-side signature change was
  needed or made this round; confirmed via the existing fx/juice selftest
  notes that all ten `RFD.ABILITIES` tints are covered with zero new pools.

### Verification
- Node (`--loader` three.js import-map shim) `Fx.__selftest()` +
  `Juice.__selftest()` + `Sound.__selftest()` + `Music.__selftest()`: all
  `pass:true`, zero FAIL notes. Added a dedicated rig-arc assertion block
  (fabricated `{group:{userData:{rfArcs(){...}}}}` rig, asserts the real
  path is called with `on:true` while blood is active and zero fallback
  sparks are spent, then `on:false` once the cue clears, then confirms the
  fallback sparks DO fire once `player.rig` is removed).
- Real headless-Chrome `RF.UI.__selftest()` (serve.mjs port 8938, CDP
  844x390 @3x, `?unlockall=1`): **173/173 checks pass, 0 fails.** Added
  assertions for: no persistent buff-bar element exists/renders
  (`N('rfBuffTimers') === null`), a `dev` HUD push never touches the
  retired in-run chip, the menu-bar DEV chip toggles from
  `RF.DevMode.state.active`, `runStarted()` fires the one-shot DEV toast
  exactly when dev is active and does not when it isn't, and the new
  `frenzyCue('buff:<id>')`/`frenzyCue('buff')` hologram-toast routing
  (label text, immediate paint, `rf-holo-flicker` class applied). One
  legacy assertion (`runStarted clears transients`) needed a small update:
  it now pins `RF.DevMode` to an inactive stub for that block so its result
  does not depend on whether the host page was loaded with `?unlockall=1`
  (the new dev-toast behavior is correct and query-string-dependent by
  design; the test needed to control for it, not the other way around). A
  first pass at the new dev-chip/toast test block also needed a follow-up
  fix: `buildMenu()` (called to exercise the menu chip) has a real side
  effect of queuing a thumbnail bake per roster shark
  (`buildCard`->`queueBake`) against the real in-browser `RFD` roster, which
  was polluting `S.bakeQueue`/`S.bakeQueued` for the pre-existing
  queueBake/drainBakeQueue assertions further down; fixed by resetting that
  state (and cancelling the scheduled bake timer) in the new block's
  `finally`.
- `game`/`world` selftests currently FAIL in this working tree independent
  of this lane (`world3d.js:7415` -> `engine3d.js:2154` `recordFrenzyKill`
  throws `Cannot read properties of undefined (reading 'packId')`) — this
  is the other lanes' concurrent mid-edit state, not a regression from
  fx3d.js/ui3d.js/index.html; not fixed here per the file-ownership lane
  rule.
- Real-browser screenshots (same harness/port): menu screen shows the DEV
  chip inline next to the RAZORFIN title (menu-only, as designed); the
  in-run HUD after DIVE shows ONLY score, HUNGER bar, minimap, and the
  power button — no buff-bar row, no DEV tag anywhere in the frame. Forced
  `RF.ctx.run.frenzyCue = 'blood'` (pinned via a repeating interval since
  the engine's own per-frame state can overwrite an unpinned one-shot
  write) and confirmed directly, by temporarily wrapping
  `RF.ctx.player.rig.group.userData.rfArcs`, that the authored rig-arc
  function is invoked every frame with `on:true` while the cue is forced
  active (not just the pooled-spark fallback) — the orbiting-arc visual
  itself did not read clearly in a static screenshot at this camera
  distance/exposure, but the underlying call-path fix is directly proven
  via the wrapped-function call log rather than by eyeballing the image.
  Zero console/page errors across the whole capture run.

### Draw/pool delta
Zero new `THREE.Points` pools or DOM elements added; `#rfBuffTimers` (one
DOM subtree) and its per-buff `.rf-buff-bar` children are removed, a net
decrease. `#rfDevChip` relocated, not duplicated. fx3d's rig-arc fix and
buff-hologram wiring are pure logic/routing changes against existing pools
(`elementSpark`, the DOM `#rfChip` toast slot) — no new pool, no new draw
call.

### Status
All five fix-round-3 items addressed within lane. `fx`/`ui`/`game` selftest
instruction: `fx` and `ui` are green (173/173 ui checks, all fx/juice/
sound/music notes pass); `game` (and `world`) currently fail from unrelated
concurrent-lane breakage in engine3d.js/world3d.js, out of this lane's
ownership. No commits made, no deploy run. Server on port 8938 started for
verification and killed afterward.
