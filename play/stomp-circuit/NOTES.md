# Stomp Circuit

Prototype notes are superseded by the AAA rebuild report below.

## AAA rebuild

Implemented:

- Phaser 3 and GGKit are now the only runtime engine and lifecycle/input/save/audio owners. The game uses a 60 Hz fixed-step simulation, bounded FX and popup pools, guarded GGKit saves, visible reduced-motion gating, a themed banner system, and a full same-origin service-worker precache.
- Physical truck handling now has weighty acceleration, suspension compression, slope-following body weight, charge-to-launch big air, analog drag or Q/E air rotation, flip and spin tracking, angle-rated hard/clean/perfect landings, and boost earned from clean landings.
- Cars and buses have readable deformation states, partial squash and full destruction, impact FX, shake, crush scoring, and combo participation. Combo multiplier, decay, crowd energy, announcer banners, and pickup drops are visible in the field.
- Generous field drops include score flares, boost cans, and time extensions. Drops are authored across every arena and are pooled at runtime.
- Structured progression includes Freestyle, Crush Rally, Ramp Gauntlet, and the Final Showcase. Each has a goal, timer, medal tiers, and save-backed unlock chain. `window.__st.state` exposes mode, score, combo, airborne, event, arena, time, boost, crushes, gates, and the force switches.
- The verification switch is readable before boot and by the live scene: set `window.__st.forceEvent` to `freestyle`, `crush-rally`, `ramp-gauntlet`, or `showcase`, and optionally set `window.__st.forceArena` to 0 through 3.
- Four authored arenas are distinct in palette, route rhythm, stunt centerpiece, crush placement, gaps, ramps, crowd density, and discoverable shortcut line.

Arena table:

| Arena | Flow identity | Centerpiece | Secret line |
|---|---|---|---|
| Stadium Bowl | broad stadium rhythm, bowl return, repeated ramp pairs | The Bowl Drop | Upper Deck Cut |
| Junkyard Sprawl | dense wreck rows, scrap kickers, tight gaps | The Magnet Drop | Magnet Tunnel |
| Canyon Rim | long air gaps and high consequence launches | The Rim Break | Ravine Low Line |
| Night Show Ring | neon ring rhythm, light ramps, encore spacing | The Light Loop | Blacklight Line |

Event table:

| Event | Objective | Medal tiers |
|---|---|---|
| Freestyle | score as much as possible in 90 seconds | 9k / 22k / 42k |
| Crush Rally | crush the authored prop row in 75 seconds | 35% / 65% / 100% of the arena row |
| Ramp Gauntlet | clear six line gates in 75 seconds | 2 / 4 / 6 gates |
| Final Showcase | score attack with all systems in 120 seconds | 30k / 70k / 125k |

Deferred:

- No local image or audio binaries were added. Vector art is authored in the renderer, while the existing CC0 MP3 harvest is referenced and fully precached through same-origin paths. A title-local audio copy can replace those references if the deployment pipeline later requires every dependency to live under this folder.
- A full browser feel capture and 4x-throttle frame trace could not be run in this environment. Syntax, payload, and static contract checks were run locally.

## UI declutter

- Cut all live center banners and repeated brand, arena, mode, event-tag, and control-label copy; run outcomes remain on the results screen.
- Shrunk the active HUD to icon-led score/time/combo, compact objective counters, thin combo/boost meters, and icon-only controls.
- Replaced pooled world popups with one top-right chip queue capped at a 1.0s hold, with reduced-motion gating retained.

## Round 2 polish

Scope: graphics/animation/FX uplift plus a real gameplay-depth upgrade, on top
of the shipped AAA build. Controls, physics constants and every behavior
documented above are unchanged; the accepted feel is preserved exactly (the
default truck IRONJAW carries 1.0 on every handling stat, so its numbers are
bit-for-bit the accepted build).

### What changed visually

- **Device-pixel rendering (owner delta).** The game is now sized in DEVICE
  pixels (`Scale.NONE`, width = cssW x DPR, zoom 1/DPR) with the main camera at
  `origin(0,0)` and `zoom = DPR`, so scene code still authors in CSS pixels
  while the canvas backing store is dense. Verified: canvas is 844x390 at DPR 1,
  1688x780 at DPR 2, 2532x1170 at DPR 3, CSS box 844x390 throughout. Phaser's
  removed-after-3.16 `resolution` config key is deliberately NOT used (it is a
  silent no-op and leaves the canvas at 1x, which is what the fleet was doing).
  Text is rasterised at `fontSize x DPR` and scaled by 1/DPR, so glyphs are
  native-resolution rather than upscaled bitmaps.
- **Baked static chrome, baked AT DPR.** Sky gradients (one per arena),
  skyline families (city / rig / mesa / fair), stand families (bowl / scaffold
  / cliff), the crowd tile, a grain tile and a vignette are drawn once into
  canvas textures during the loading screen at `DPR x` design size, then drawn
  as tiling sprites with parallax. Nothing is baked at 1x and scaled up. This
  also removed the per-frame Graphics storm that used to redraw 129 crowd
  members and 24 buildings every frame.
- **Colour depth.** Flat fills are gone from every large surface: the sky is a
  three-stop gradient with an ordered dither pass, the terrain is a graded
  rock mass with strata bands, surface lighting and scattered aggregate, the
  chasms are graded with lit lips and broken edges, props carry roof
  highlights and sill shadows, the truck carries a rim light and a ground-side
  shadow, and a screen-space grain tile plus a vignette sit over the frame.
  Measured on real gameplay frames at 390px landscape, DPR 3: 1250 to 1810
  distinct colours at 4 bits per channel (about 37k to 46k exact RGB values),
  across all eight arenas. Menu screens run about 430, the results overlay
  about 380 (both are deliberately dark, low-noise screens).
- **Suspension and chassis.** Each wheel is a real spring (compression plus
  velocity, stiffness and damping scaled by the truck's suspension stat). The
  chassis squats under load, pitches from the left/right compression delta,
  slams and rebounds on landing, and pre-crouches while charging (anticipation)
  with a 0.34s recovery window after touchdown. Visible coil-over arms travel
  between hub and chassis.
- **Wheels.** Monster-truck proportions with tread lugs that rotate with wheel
  spin, a sidewall, a rim disc with spokes, a hub cap, and a contact patch that
  flattens (ellipse squash) as the spring compresses.
- **Dirt spray and tyre-mark decals.** Dirt sprays from the contact patch on
  launch, landing and hard acceleration; tyre marks are laid as pooled decal
  segments (260 cap, view-culled) that persist for the whole run.
- **Crushable props with debris.** Props now flash on impact, throw rotating
  debris shards and smoke, and leave a flattened wreck husk on the field
  instead of vanishing.
- **Crowd band with flash pops.** The crowd is a tiling band tinted per arena,
  sitting behind the playfield, with pooled camera-flash pops that fire on
  combo beats, crushes, big landings and medals.
- **Slow-motion flourish.** A landing after more than 1.0s of air with at
  least one completed flip and a clean or perfect touchdown ramps the sim to
  0.34x for about half a second with a hot ring burst and a crowd surge.
  Reduced-motion gates it off entirely.
- **Animated screen transitions.** Title, circuit menu, run and results are
  now separated by an interleaved bar wipe rather than a cut. Reduced motion
  falls back to an instant cut.
- **Results screen.** Animated medallion (rays, graded disc, star), medal
  colour grading, objective and grind/chain readouts, and the new-truck
  callout.
- **Garage preview.** The roster tab renders the selected chassis, idling with
  a suspension breath, in its own colours; locked trucks show a blacked-out
  silhouette.
- **Reduced motion** still gates crowd bob, pickup bob, flash pops, slow
  motion, transitions and particle counts.

### What changed in gameplay

- **Freestyle Circuit of 8 arenas.** The four shipped arenas are untouched in
  profile and layout; four new ones are authored: IRON HARBOR (drydock, gantry
  drop), SALT MIRAGE (flats, huge kickers, the longest arena), FOUNDRY FLOOR
  (tight, densest prop rows), SUMMIT COLISEUM (the finale ring). Each of the
  eight now carries its own trick objective: 3 flips, 14 crushes, 7s of air,
  a 9 chain, 3s of grind, 5 gaps cleared, 18 crushes, and 6 trick types in one
  chain. Clearing one pays 2500 and is remembered in the save.
- **Rail grinding (new mechanic).** Every arena carries rails above the floor.
  An airborne approach from above with the chassis roughly level locks on; the
  truck rides the rail banking score and sparks, and charge ejects into a hop.
  It is its own trick type in the chain grammar.
- **Combo grammar.** Tricks are now typed (air, flip, spin, crush, grind, gap,
  gate, pickup, secret, land). Chain length still drives the base multiplier,
  and each additional DISTINCT type in the same chain adds to it, capped at
  x12; each new type also extends the decay window. The decay bar shows the
  variety ticks, so a mixed line visibly outscores a repeated one.
- **Career ladder.** Twelve named rounds across the eight arenas, each behind
  a total-medal gate (0 up to 26), with per-round medals stored and shown as
  dots. The Freestyle Circuit tab gates arenas on the same medal total.
- **Truck roster.** Five trucks with real tradeoffs (torque, grip, air
  control, suspension, mass, crush force, boost capacity and burn), unlocked
  at 0/3/8/15/24 total medals: IRONJAW (the accepted baseline), DUST DEVIL
  (light, huge air control, poor bite), ANVIL (heavy press, best crush, hates
  rotating), NIGHTINGALE, SOVEREIGN. Handling stats feed acceleration, grip
  damping, air rotation rate, landing-angle tolerance, spring stiffness,
  crush force and boost economy.
- **Menu.** Three tabs (CAREER / CIRCUIT / GARAGE) with keyboard and touch,
  44px-plus rows, medal dots, gate copy on locked rows, and a live chassis
  preview.

### Save migration

- Save version 1 to 2. `migrateProfile()` copies every earned medal, best
  score and run count out of a v1 profile, keeps the legacy `unlockedArena`
  and `unlockedEvent` fields live and meaningful, and defaults the new fields
  (`truck`, `trucks`, `career`, `objectives`, `careerStage`). The migrated
  shape is written back at boot, so a v1 player is on v2 immediately.
- Validation accepts only v1 and v2 shapes with sane types and ranges;
  anything else (corrupt JSON, future version, out-of-range values) degrades
  to a fresh profile without throwing. Verified against four seeds: future
  version, non-JSON, out-of-range v2, and a real v1 profile (medals preserved,
  rewritten as v2).
- `sw.js` VERSION bumped to `2026-08-16-round2-polish-a1`. The precache list
  matches the files that actually exist (10 mp3, index, game.js, manifest, two
  icons, phaser, ggkit); the stale sibling-title path prefixes were removed
  from the fetch handler, since every asset this title uses lives in its own
  directory.

### Bugs found and fixed on the way

- **Camera bounds vs a zoomed camera.** `Camera.clampX/clampY` assume a
  CENTRED zoom, while an `origin(0,0)` camera renders top-left based. With
  `setBounds` the vertical clamp pinned the view above the arena floor and the
  entire playfield (ground, truck, props) rendered off-screen with no error.
  Bounds are gone; the scroll is clamped by hand.
- **Transition restart loop.** The run-ended check calls `setMode('result')`
  every frame; the wipe reset its timer each call, so the mode never actually
  changed and the results screen was unreachable. `setMode` now ignores a
  repeat request for the transition already in flight.
- Pre-existing: `renderSecret(g, s)` was being called as `renderSecret(s)`, so
  the secret-line marker was drawing against a Graphics object instead of the
  secret's coordinates (NaN geometry). Fixed.
- Pre-existing: `renderTruck` called `this.inputFrame()` from inside the
  render pass every frame; it now reads the cached frame input.
- Props and pickups authored over a chasm used to spawn at the pit floor
  (a bus sitting in mid-air inside the black). Props over a gap are no longer
  spawned; pickups over a gap hang at jump height.
- Line gates are no longer drawn outside Ramp Gauntlet, where they were
  floating rings with no meaning.

### Verification (this box, all local)

Private port 8731 (plus 8791-8796 for the focused probes), headless Chrome at
390px landscape, DPR 3 unless noted. `node --check` clean on `game.js` and
`sw.js`. Zero console errors and zero failed requests in every session below.

- Boot + first frame renders; 8/8 arenas boot and play with their own event,
  objective and palette.
- Headline mechanics proven live from `window.__st.state`: crush and debris,
  chain to x12 with 7 distinct trick types, rail grind (up to 7.5s banked in
  one run), air bank, flips, slow-motion flourish fired, medal awarded, save
  written, truck unlocked (NIGHTINGALE at 15 medals), results screen reached.
- Full career round played end to end (CANYON RIM / RAMP GAUNTLET, six gates,
  gold).
- DPR 1/2/3 canvas sizes confirmed; reduced-motion boot plays clean.
- Payload 284 KB total for the directory excluding `_shared`, largest file
  `game.js` at about 115 KB, both well inside budget. No new binary assets.

### Deferred

- No frame-rate or feel numbers are reported: sixteen sibling lanes are
  running on this box and there is no GPU, so every local timing figure would
  be void. The FX added here are pooled and pre-warmed on the loading screen,
  static chrome is baked, and the world draw is view-culled, but the 4x-CPU
  throttle trace still needs to be run on a quiet box.
- The grind window is deliberately tight (an airborne approach, roughly level,
  falling). It reads as a skill move rather than a freebie; if playtesting
  says it is too fussy, the capture box in `grindPass` is the single knob.
- Audio is unchanged: the ten shipped CC0 MP3 cues, no new files. A second
  music stem for an intensity layer would need a new asset and was out of
  scope for a no-new-binaries round.
- `LICENSES.md` now cites the exact `play/_assets/LEDGER.md` row for every
  audio file and states explicitly that all art is procedurally generated
  original work.
