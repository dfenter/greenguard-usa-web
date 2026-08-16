Controls: tap water to set a course; drag the TRIM ring to angle the sail.
Keyboard: arrows steer/trim; WASD also steers/trims; E docks, C opens the chart,
R restarts. Encounters answer to 1/2 or Y/N.
Loop: sail between six ports, read the stock bars, buy where a good is glutted
and sell where it is short, and spend the profit on hull, sails and hold.
Weather fronts (squall, gale, fog, doldrums) drift across the map: squalls and
gales boost you but damage the hull and spill cargo, fog raises the encounter
rate, doldrums kill the wind. The chart table forecasts them sixty seconds out.
Goals: clear the twenty-contract career and make Harbourmaster. Autosaves.

## AAA rebuild

### Implemented

- Rebuilt the prototype as a procedural Three.js r160 sailing world using GGKit for lifecycle pause/resume, per-pointer input, guarded save data, audio buses, settings, loader, and PWA registration.
- Added authored 3D hull tiers from Cutter through Flagship, sail liveries, wind arrows, live telltales, visible sail luff, trim-driven speed and heel, spring chase camera, blob shadow, pooled wake and spray, storm rain and lightning, dock glide scoring, and reduced-motion gates.
- Added generous gold caches, cargo bonus crates, wind-boost lanes, escalating market volatility, four trade goods, hull capacity upgrades, and route unlock medals.
- Added `window.__th = { state, forceEvent, forceStorm, triggerEvent }`. The live state exposes mode, gold, hull, region, cargo, storm, and boost values. Switches also accept `window.__th.forceEvent = 'cache'`, `window.__th.forceStorm = true`, or the corresponding fields on `window.__th.state`.
- Added manifest, 512px icon, 192px icon, favicon, local procedural MP3 cues, and a versioned service worker with complete existing-file precache.

### Region table

| Region | Identity and flow | Landmark | Shortcut and hazards |
|---|---|---|---|
| Lumen Coast | Harbor town coast and low-risk starting waters | Lighthouse Point | South channel buoys, coastal reef teeth |
| Gale Straits | Narrow storm lanes and high-speed risk | Breakwater Wreck | Reef shortcut through the squall corridor |
| Sunken Archipelago | Dense reef islands with the best Brineglass prices | Floating Market | East channel shortcut, staggered reefs |
| Bluewater Lane | Open ocean trade lane with broad reaches | Trade Beacon | Long wind lane, scattered outer reefs |

### Route table

| Route | Dock circuit | Medal basis and unlock |
|---|---|---|
| Coastal Run | Lumen Coast to Sunken Archipelago and back | Profit and 120, 95, 75 second tiers. Unlocks Deep Trade after any medal |
| Deep Trade | Lumen Coast, Gale Straits, Sunken Archipelago, Bluewater Lane, Lumen Coast | Profit and 260, 210, 175 second tiers. Unlocks Cargo Rush after any medal |
| Cargo Rush | Bluewater Lane to Gale Straits | Premium Brineglass delivery with 100, 80, 65 second tiers. Completes the route chain |

### Deferred

- Browser and WebGL visual smoke test could not run in the available environment. `node --check` passed for all title JavaScript, manifest parsing passed, service-worker precache paths all exist, and the current title payload is 660,191 bytes.

## Fix round 1

### Fixed findings

- CRITICAL touch course input: canvas pointer events now keep their GGKit pointer zone and use pointer capture.
- CRITICAL touch trim input: the trim ring now registers a GGKit `trim` pointer and updates during drag.
- CRITICAL malformed saves: angle normalization is modulo based and save validation bounds every persisted numeric field.
- CRITICAL primitive-adjacent environment: islands, docks, landmarks, and the vessel now have richer authored procedural layers, foliage, shore bands, rails, canopies, lanterns, and contact accents.
- CRITICAL player animation states: the vessel now exposes readable IDLE, SAILING, BOOST, STORM RUN, and DOCKED poses with distinct sail, flag, lantern, bob, and contact behavior.
- MAJOR paused keyboard actions: raw key actions now stop while GGKit is paused, and focused form controls do not trigger docking.
- MAJOR active route persistence: route id, leg, timer, trade profit, and delivery cargo persist through GGKit saves and validated reloads.
- MAJOR route medals: medal profit now comes only from route trade transactions, with the route reward applied afterward.
- MAJOR Cargo Rush delivery: the charter requires four Brineglass units and consumes them at the destination.
- MAJOR wind model: wind speed now scales sailing speed as well as the HUD readout.
- MAJOR audio coverage: added two 12-second looping MP3 music beds and twelve distinct MP3 SFX, all routed through GGKit audio buses.
- MAJOR first-run tutorial: the persisted five-step tutorial advances from course setting through trim, docking, buying, and selling.
- MAJOR content depth: added six persistent charter contracts with progress, rewards, claim buttons, and progress hooks across routes, storms, caches, glides, sales, and upgrades.
- MAJOR loader progress: boot now waits for local SFX preload before continuing, while music remains lazy until first interaction.
- MAJOR menus: added a title screen, visible pause and resume, settings restart, fullscreen, and persistent music and SFX volume controls.
- MAJOR 390px UX: reflowed the HUD and dock panel, enlarged primary touch targets, and made the trim ring touch-safe.
- MAJOR impact feel: reef and storm contacts now use GGKit hit-stop and shake, pooled contact rings, spring boat pulse, camera dip, and velocity lookahead.
- MAJOR save invariants: medal, contract, route, cargo, vessel, RNG, and pickup values are range checked and cargo totals cannot exceed hold capacity.
- MAJOR victory state: victory now persists and permits post-goal free sailing and docking without clearing the completed state.
- MAJOR determinism: storm cargo loss uses a persisted simulation RNG; Math.random remains limited to cosmetic FX variation.
- MAJOR reduced motion: water, rain, wake, spray, lightning, telltales, boost rings, FOV kick, and impact juice are gated consistently.
- MAJOR volume settings: GGKit music and SFX sliders are exposed in the settings shell and persist through GGKit preferences.
- MINOR background save: added visibility and pagehide save guards.
- MINOR restart music: reset now restores wind music and clears render keys.
- MINOR dock quality: distance is now part of the glide score.
- MINOR FX budget: wake, spray, and rain pools are 16 each and share geometry and materials.

### Rejected findings

- CRITICAL AAA evidence staging: the requested `review_evidence/aaa/tide-harbor/` destination is outside the user-authorized title directory, and no browser target was available to generate valid visual evidence. No out-of-scope files were created.
- MINOR gamepad mapping: GGKit exposes no gamepad input API, and title-side polling would violate the sole-GGKit input rule. The title screen explicitly documents touch and keyboard controls only.

### Verification

- `node --check play/tide-harbor/game.js` passed.
- `node --check play/tide-harbor/sw.js` passed.
- Manifest parsing, MP3-only audio checks, service-worker path checks, no-em-dash scan, payload, and per-file size checks passed.
- Payload is 660,191 bytes excluding NOTES.md and LICENSES.md. Every shipped file is below 400 KB. `sw.js` is version `aaa-rebuild-20260810-2`.

## UI declutter

- Cut the live tagline, repeated HUD labels, region flavor copy, wind-mode text, trim label, and always-on contract stack from active play; routes and contracts now live behind the compact route-board toggle, and market state remains in the dock panel.
- Shrunk the HUD to icon-led gold, hull, cargo, time, wind, speed, and route meters; changed pause/resume to icons and kept controls and reduced-motion gates intact.
- Moved every in-play banner and coach callout out of center stage into one queued corner chip capped at 1.0s, with tutorial steps using one thin top strip that fades after about 3s.

## Round 2 polish

### The P0 that was live

`setBanner` was referenced 33 times and **defined nowhere**. The UI-declutter pass
renamed it to `setCoach`/`setTutorial` and missed every call site. The title
screen boots fine because nothing raises a banner while paused, so the previous
boot check passed, but the first reef strike, storm entry, dock, buy, sell,
cache or upgrade threw `ReferenceError` inside `stepSim`, which unwound through
`frame()` and killed the `requestAnimationFrame` loop. The shipped, live build
froze permanently the moment anything happened. Reproduced in the headless
harness before the rewrite (`PAGEERROR: ReferenceError: setBanner is not
defined`, sim clock and gold frozen thereafter). Transients are now one
`showChip` queue with a wall-clock timer, so a chip raised while paused still
expires instead of sticking.

A second latent one: the ocean's `uTime` was declared `mediump` in the fragment
stage and `highp` in the vertex stage. The program failed `VALIDATE_STATUS`, the
whole sea silently vanished, and what the player saw was the underside of the
sky dome. Shared uniforms are now precision-matched. Related: the shore mask
used `smoothstep(hi, lo, d)`, which is undefined in GLSL when `edge0 > edge1`;
rewritten as `1.0 - smoothstep(lo, hi, d)`.

### What changed visually

- **Sea.** Four-wave Gerstner displacement with horizontal crest sharpening.
  The wave table in `sea.js` is the single source of truth: the vertex shader is
  code-generated from it and `sampleSea()` mirrors it on the CPU, so hull motion
  always matches the surface on screen. Crest foam comes from the wave Jacobian,
  plus shore foam from eight registered island discs that also flatten the swell
  in the shallows. Sun specular, fresnel sky bounce and depth-graded colour.
  The grid follows the vessel, snapped to a cell so it never swims.
- **Hull rides the water.** The sea is sampled at bow, stern and both quarters
  each frame; heave, pitch and roll come from that, not from a fake sine bob.
  Sail heel is added on top, spring-damped.
- **Ship.** Rebuilt as a lofted station-profile shell: real sheer line, rocker,
  tumblehome, a stem the bow tapers into, and a raked transom cap. No box
  primitive anywhere in the vessel. On it: planked deck sole, capped rail on the
  true sheer with stanchions, cabin trunk with separate dark glass strakes and
  emissive portholes, companionway, capstan, rope coils, barrel, tapered mast,
  boom, bowsprit, shrouds/forestay/backstay as tube rigging, rudder on a pivot
  with a linked tiller, three lanterns, a masthead ensign, and two crew who work
  the ship.
- **Sails.** Segmented meshes deformed every frame: they belly with fill and
  flutter along the luff when you point too high, reef in a storm and are stowed
  at the dock. Distant AI sails skip normal recomputation and shape on every
  third frame.
- **Animation states.** IDLE, SAILING, BOOST, STORM RUN, DOCKED, blended through
  a spring with one overshoot, so every transition has anticipation and
  recovery. Each state drives sail fill, reef, crew pose, ensign whip, lantern
  brightness and rudder angle.
- **Time of day.** A 7-minute day cycle grades sky top and horizon, sun colour
  and elevation, hemisphere fill, fog colour and range, water deep/shallow/foam,
  specular strength, stars and exposure from a keyframe table. Port windows,
  street lamps, buoy lights, ship lanterns and the lighthouse beam all fade in on
  the same `lamps` channel, so dusk actually lights the harbour.
- **Ports.** Six harbour towns of warehouses and townhouses with stone facades
  and an emissive window grid, tiled roofs, smoking chimneys, a quay wall, lamp
  posts, waving bunting; a real pier with piles, stringers, bollards, a swinging
  crane and two moored boats that bob on the same swell; approach buoys; and a
  landmark each (lighthouse with a rotating beam, ribbed wreck, floating market,
  beacon column).
- **Islands.** Polar height-field terrain with ridge noise and per-vertex
  beach/scrub/rock/peak banding, a wet sand collar, scattered palms, pines and
  boulders, and outlying sea stacks so no silhouette is a plain dome.
- **Life in the world.** Five AI traders working real port-to-port legs, gull
  flocks with flapping wings, bobbing buoys and caches, chimney smoke, bunting.
- **FX.** Every system is one pooled `THREE.Points` draw call, pre-warmed and
  shader-compiled during the loading screen: spray, surface foam, splash bursts,
  reward sparkles, embers, plus a rain streak field and two foam ribbons (stern
  wake and bow wave) on fixed ring buffers. Nothing allocates during play.
  Impacts get a splash burst, hit-stop, shake and a sound. Rewards escalate
  through a four-level `celebrate()`.
- **Transitions.** Title fades out, the dock panel slides in behind a wash, the
  chart and encounter panels spring in. No hard cuts.
- **Reduced motion** gates wave-driven hull motion, all particles, rain,
  lightning, flag and sail flutter, camera roll, FOV kick and every juice call,
  and is exposed as a settings toggle on top of the media query.

### What changed in gameplay

- **Trade economy.** Six ports keep a live stock ledger per good with
  production, consumption, mean reversion and a persistent shock walk. Price is
  driven by scarcity against that stock, so a port that is short pays well and a
  glutted one does not. **Your own trades move the ledger**, so you cannot farm
  one port: buying enough pushes the price up against yourself. Ports remember
  only what you have actually seen; the chart table shows remembered prices and
  the best known leg. Balance rail: a good never trades below a quarter or above
  3.1x base, and the demand bias is applied to price only, never to the stock
  target as well (that compounding produced a 10x arbitrage in the first pass).
- **Weather fronts.** Five drifting fronts of four kinds. Squalls and gales
  boost you but damage the hull and spill cargo, fog banks kill visibility and
  raise the encounter rate, doldrums kill the wind. Fronts curve as they move
  and respawn at the map edge. The chart table gives a sixty-second forecast per
  front with a closing/clearing tag and both distances, which is what makes the
  route decision real: ride the squall for the boost or go around the gale.
- **Three upgrade tracks.** Hull (integrity and reef resistance), sails (speed
  and pointing angle), hold (capacity), four levels each, bought with profit and
  gated by rank. Hull and sail levels drive the visible vessel. Hull integrity is
  a real resource: reefs and weather damage it, the shipyard repairs it, and at
  zero you are towed into the nearest port having lost half the hold.
- **Encounters.** Six types on the open sea with a two-choice decision and a
  real follow-through: smuggler toll or a speed-contested run, revenue patrol
  inspection or a run with contraband seizure and fines, escort contracts that
  pay on arrival and put an AI ship on your quarter, derelict salvage, a rival
  race against a clock, and a harbour pilot who sells fresh prices. Weighting
  respects rank, cargo, contraband and the weather.
- **Career.** Twenty ordered contracts of seven kinds (deliver, profit,
  arbitrage margin, port visits, weather survival, escorts, salvage), gated by
  seven harbourmaster ranks that unlock ports, goods, upgrade tiers and the
  contraband trade. The repeatable charter board survives as six standing orders.
- **Contraband.** Tidesilk is illegal, rank-3 gated, pays the largest margin and
  is what the revenue patrol is looking for.
- **Preserved:** tap-water-to-course and the trim ring, arrows/WASD steer and
  trim, E to dock, R to restart, the accepted speed and heel curve shape
  (`15 + 56 * speedMul * pointEff * (0.27 + trimEff * 0.73)`), heading damping
  at 3.2, trim range +/-1.45, clean-glide docking bonuses, gold caches, and the
  `window.__th` probe (extended with `debug`, `marketSnapshot()` and
  `triggerEvent('storm'|'cache'|'encounter'|'dock'|'gold')`).

### Owner delta 2026-08-16 (resolution and colour depth): RETINA_LAW

`play/_assets/RETINA_LAW.md` landed mid-lane and this title is measured against
it. Official acceptance run, private port 8734:

```
RET-OK  tide-harbor            dpr=    3  colours=  72984  flattest=  1.4%
retina-native 1/1   median colours 72984
```

Native density at a device ratio of 3, 72,984 distinct colours in a real
gameplay frame, and the flattest single colour holds 1.4 percent of it against
the law's guidance of well under 20. Addressed point by point:

1. **Device pixel ratio.** The renderer now runs
   `setPixelRatio(Math.min(devicePixelRatio, 3))`; it was capped at 1.5, which is
   exactly the soft, upscaled look being rejected. MSAA (`antialias`) is off
   deliberately: it roughly triples cost on a software rasteriser and the dense
   backing store carries edge quality instead. `window.__th.debug` reports
   `dpr`, `canvasW` and `canvasH` so the backing store can be confirmed rather
   than assumed.
2. **Textures baked at device scale.** `bake.js` allocates every canvas at
   `min(round(devicePixelRatio), 3)` and pre-scales the 2D context, so a 3x panel
   gets a 3x bake instead of an upscaled 1x one. Mipmaps and anisotropy 4 on all
   of them.
3. **Colour depth.** No large surface is a flat fill: every baked texture starts
   from a gradient, gets per-element shade variation, and finishes with an
   overlay-blended noise tile that kills banding. Terrain is per-vertex colour
   banded, the sky is a gradient dome with a sun disc and bloom, the sea grades
   deep-to-shallow by facing plus fresnel and specular. Official audit reading is
   **72,984 distinct colours, flattest colour 1.4 percent**.
4. **Text and UI chrome.** All HUD, panel and menu text is live DOM text, never
   baked into a texture, so it rasterises at native device density by
   construction. Minimum effective size is 13px for decoration and 14px for
   anything the player must read, per UI_LAW; the previous build ran 8-10px
   throughout. Every touch target is at least 44px.
5. **Not paid for in frame time.** MSAA stays off (`antialias: false`) precisely
   because the law flags it as roughly tripling cost on a software rasteriser;
   the dense backing store carries edge quality instead. FX pool sizes, ocean
   tessellation, town building count and island scatter all scale through the
   quality tier. No frame-time claim is made here: the box is contended by
   sixteen lanes and has no GPU, so the feel gate belongs on a quiet box.

Note on the noise pass: the first implementation stamped it with a per-pixel
`fillRect` loop, which cost tens of thousands of draw calls per texture and
stalled boot past a 60s navigation timeout. It is now one `putImageData` tile
stamped with `drawImage`. Texture *variants* were also capped hard (4 facade, 4
window-grid, 1 roof grain, planking keyed on colour only) after the first pass
tried to bake roughly a hundred distinct 512-768px textures.

### Save compatibility

Save version **3 to 4**. `migrateSave()` in `economy.js` accepts any shape with
`1 <= v <= 4` and rebuilds it: the old single hull ladder maps across the three
new tracks so a captain keeps the ship they paid for; the fifth good (Tidesilk)
defaults to zero; the market ledger is regenerated because the old model had no
stock; old route medals and claimed contracts are credited as rank experience
(120 per medal, 90 per contract, 220 per hull level) so returning players do not
restart at Deckhand. GGKit's `validateSave` accepts old versions so they reach
the migration; anything that still fails `validSave()` after migration degrades
to a fresh profile with a coach line, never a throw. Verified end to end: a
seeded v3 save loads, migrates and re-saves as v4.

`sw.js` VERSION is `aaa-round2-20260816-1` and the precache list is regenerated
against the files that actually exist (six modules, manifest, three icons,
fourteen mp3s, ggkit and three).

### Budgets

Payload 787,589 bytes (0.75 MB) excluding `_shared`, against the 2.5 MB cap.
Largest file `icon512.png` at 261 KB, largest source `game.js` at 81 KB, against
the 400 KB per-file cap.

### Verification

`node --check` clean on all seven JS files plus `sw.js`. Booted headless on a
**private port 8734** (never a shared default) at 844x390 dpr 2 with a forced
landscape orientation: first frame renders, zero console errors, zero failed
requests. Drove the headline mechanics through the probe: course set by tap,
trim by drag, a forced squall (wind 80, rain, boost to 57 kt, storm pose), a
cache pickup (+240g), a live encounter panel with working choices, docking into
Lumen with a clean-glide bonus, and a full market snapshot showing per-port
spreads. Save round-tripped at v4.

### Deferred

- **No frame-rate or feel numbers reported.** The box is shared with sixteen
  sibling lanes and has no GPU, so every local timing figure is void; feel is
  gated on a quiet box.
- The quality tier is inferred from `hardwareConcurrency` and DPR and scales FX
  pool sizes, ocean tessellation, town building count and island scatter, but it
  is not yet exposed as a manual setting. Worth adding once real device numbers
  exist to pick the thresholds.
- Escort and race encounters reuse the existing AI trader fleet rather than
  spawning a dedicated vessel, so with several running at once the same hull can
  be reassigned. Not reachable in normal play (encounters are serialised), but it
  is a real limit if the encounter cooldown is ever shortened.

### Note for the `_shared` lane (NOT changed by this lane)

GGKit's `makeInput` registers its window `pointerdown` handler at kit-creation
time and unconditionally **replaces** any existing entry for that `pointerId`,
so a title that stamps a zone onto the pointer map loses it unless it calls
`stopPropagation` first. That is a footgun, and the previous build here depended
on exactly that accident. This lane no longer touches `kit.input.pointers` for
gestures at all: it keeps its own map on window listeners registered after kit
init, per the pointer law. If GGKit is being reworked anyway, a `claimZone(id,
zone)` on the kit, or merging rather than replacing on `pointerdown`, would let
titles stop reimplementing this. Described here rather than changed, per the
lane boundary.
