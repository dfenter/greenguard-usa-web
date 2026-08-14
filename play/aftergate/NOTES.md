# Aftergate

- RUN: drag anywhere (or ←/→) to steer your marching squad; take the bigger gate (×2, +18) over the bad one (÷2, −20), dodge saws and the mobs whose numbers outweigh you.
- Whoever survives the road arrives at the wall and becomes your troop budget; that is the whole economy, nothing is bought.
- BASE: tap a role (SPEAR / BOW / OIL) then tap a wall slot to garrison it, or drag a role onto a slot; tapping an occupied slot with the same role upgrades it. Keyboard: 1/2/3 or Tab picks a role, arrows move the slot cursor, Space places, Enter starts the wave.
- Each wave held pays out more troops and repairs the wall; the wall falling ends the game and your score is waves survived.
- WIN by holding all 10 waves; tap anywhere on the end screen to run again immediately. Best waves and biggest squad persist locally.

## AAA rebuild

Rebuilt in place 2026-08-10 from the archived canvas prototype to the fleet
AAA bar. Phaser 3.87 from `/play/_shared/`, GGKit as the sole lifecycle /
input / save / audio implementation (Phaser boots with `audio.noAudio` and
all of its own input subsystems disabled). Portrait 540x960, `<base
href="/play/aftergate/">`, engines loaded over absolute `/play/_shared/`
paths.

### Implemented

**Mechanics**
- Fluid gate steering: 1:1 pointer drag on any unclaimed pointer plus
  arrow/A-D keys; the sim x is instant and the drawn column eases in behind
  it, so the input never feels rubbery but the formation still flows.
- Instant gate-value preview: the nearest live gate prints the *resulting
  roster* under each half (not the operator), the half the column is on is
  brightened and scaled up, and the whole thing recomputes every frame from
  the current squad.
- Squad count never lags: the HUD number and the drawn soldier count both
  read the same `this.squad` in the same frame the sim wrote it. No tweened
  counters anywhere.
- Garrison placement by tap-then-tap or drag-and-drop, with one `legality()`
  function driving both the highlight and the action, so the glow can never
  disagree with what a tap will do (place / upgrade / occupied / cannot
  afford / max level).
- Threat direction per wall segment: pending enemies show as per-column pips
  during BUILD (the wave plan is generated when the build phase opens, not
  when the wave starts), and live enemies drive a per-column chevron whose
  scale and colour track the threat mass in that lane.
- Honest damage model carried from the prototype: per-shot damage is
  `dps * cooldown`, so the listed dps is the sustained dps.

**Loop**
- Three modes (table below) with a shared road/wall core.
- Medal tiers on all three, reading the owner's three axes (waves held,
  squad size, wall integrity).
- Gate Rush unlock chain: bronze or better on road N opens road N+1.
- Generous by contract: `applyGateOp` floors a gate result at 1, so a bad
  half can gut the column but can never end the run. Only mobs and the wall
  can end you. Wave payout is `14 + wave*7` troops plus a 34 percent wall
  repair, every held wave.

**World**
- Four authored road/wall identities with their own palette, gate density,
  hazard mix, swing multiplier, wall HP, wave composition, music stem and
  signature landmark.

**Presentation**
- Everything is generated in code: 100+ baked textures (soldier march /
  gate-pass / hurt / garrison states, four foe silhouettes, gates, saws,
  barricades, recruit standards, four landmarks, four road tiles, four wall
  faces, four fog bands, icons, medals, panels, particles, range rings) and
  27 synthesised sounds including four music stems. Nothing is fetched, no
  asset pack is consumed (see LICENSES.md).
- Five pooled particle systems per scene (gate burst, impact chips, march
  dust, smoke, ring pop on the road; hit sparks, stone chips, oil fire,
  repair motes, ring pop at the wall).
- Banner beats at 60 percent width with a Back-ease overshoot for run start,
  wave held, wall win, wall fall and the medal ceremony; auto-shrinking
  title so a long site name cannot spill.
- Reduced-motion gating on shake, hit-stop, overshoot tweens, popup pops and
  chip hold time.
- GGKit audio buses: gate chime, gate fail, march footsteps, saw, mob smash,
  place, upgrade, wave horn, wall thud, crack, repair, three weapon sounds,
  foe death, wave held, medal, victory, defeat, ui click, deny, recruit,
  countdown, plus `mus_road` / `mus_march` / `mus_siege` / `mus_wall`.

**UI_LAW compliance**
- One compact top HUD cluster per scene, icons over words, no duplicated
  readouts (the big wall meter was deleted once the HUD carried integrity).
- In-play events are corner chips: max 1.0s hold (0.7s reduced-motion), fast
  fade, anchored beside the HUD.
- One transient at a time, enforced structurally: `Banner.show` refuses any
  call not flagged `boundary:true`; the coach strip queues behind a live
  banner; chips queue behind both. Verified by stepping 700 frames of live
  road play and 700 frames of live wall combat: 0 overlaps, 0 centre banners
  during live play.
- Coach text is a single thin top strip that fades out after ~3s.
- Safe-area insets read back from a real `env()` probe element; touch
  targets grown to a 44 CSS px floor by `Button.hit`.

**Defect classes explicitly handled**
- Views come from preallocated pools and are assigned by the renderer each
  frame; no sim entity ever carries a view reference.
- Pointer claims are written onto the GGKit pointer record (`raw.zone`) at
  claim time; the release path reads GGKit's own map in the capture phase
  rather than opening a second pointer bookkeeping.
- No camera split is used, so no second camera can be missed.
- Scenes are constructor-function subclasses of `Phaser.Scene`, never plain
  config objects.
- Test switches work from the boot fallback (declared inline in index.html
  before the game loads) and from the live scene; both drain through
  `AG.orchestrator.applyForce()`.
- Every keyed lookup goes through a guarded accessor (`AG.role`, `AG.etype`,
  `AG.site`, `AG.siteAt`, `AG.rushRoad`, `AG.mode`), all of which fall back
  to a real default.
- Fixed-step accumulator clamped to 4 steps: a degraded device gets slow
  motion, never a time skip. The cosmetic clock IS the stepped sim clock.
- Tutorial is a thin top strip, never centre, never over the controls.
- `sw.js` precaches only files that exist.
- No static Graphics survives a frame; rings are hand-tessellated polygons
  baked to textures rather than `Graphics.arc`; `setText` and `setColor`
  both have change guards (`AG.ui.setText` / `setColor` / `setTint` /
  `setVis`).
- All IIFEs close `})()`.
- Draw work rides `update`, not a `postrender` subscription.
- `Container.add()` return values are never captured as element refs.
- `Texture.add` is not used; textures come from `generateTexture`.
- Phaser config uses `parent: document.body`, never `null`.
- Large solid fills are baked colour textures rather than tinted white
  pixels, so a canvas-renderer fallback does not paint the battlefield
  white.

### Modes

| Mode | Shape | Score | Medals |
|---|---|---|---|
| AFTERGATE (campaign) | 4 sites, each a road run then that site's waves; 10 waves total | waves held | gold: 10 waves + integrity >= 60% + squad >= 120; silver: 10 waves; bronze: >= 4 waves |
| GATE RUSH | 6 hand-authored short roads, no wall; unlock chain | squad at the end of the road | per-road thresholds (see table) |
| ENDLESS WALL | siege wall from wave 11 up, a reinforcement road every 5 waves | waves past the gate | bronze 5, silver 12, gold 20 |

### Sites

| # | Site | Wall | Waves | Wall HP | Road | Gate gap | Hazard mix | Landmark |
|---|---|---|---|---|---|---|---|---|
| 1 | Recruit Road | The Palisade | 1-2 | 160 | 4200 | 300-350 | gate .60 / mob .14 / saw .08 / barricade .04 / recruit .14 | Muster Cairn |
| 2 | Ruined Causeway | Causeway Redoubt | 3-5 | 210 | 4800 | 330-400 | gate .48 / mob .14 / saw .22 / barricade .12 / recruit .04 | The Broken Arch |
| 3 | Mob-Choked Pass | Pass Gatehouse | 6-8 | 250 | 5200 | 360-430 | gate .42 / mob .36 / saw .10 / barricade .08 / recruit .04 | The Bone Totem |
| 4 | Aftergate Approach | The Aftergate | 9-10 | 300 | 5600 | 300-380 | gate .50 / mob .22 / saw .16 / barricade .08 / recruit .04 | The Aftergate |

Wave composition per site: recruit is grunt/runner only, causeway adds
brutes, pass adds ravagers, siege is 46 percent brute-or-ravager.

### Gate Rush roads

| # | Road | Site look | Start | Bronze | Silver | Gold |
|---|---|---|---|---|---|---|
| 1 | First Muster | recruit | 5 | 40 | 90 | 160 |
| 2 | Toll Bridge | causeway | 6 | 60 | 130 | 230 |
| 3 | Saw Gauntlet | causeway | 8 | 70 | 150 | 260 |
| 4 | Press Gang | pass | 10 | 80 | 170 | 290 |
| 5 | Split Causeway | causeway | 10 | 100 | 200 | 330 |
| 6 | Aftergate Approach | siege | 12 | 130 | 250 | 380 |

### Verification hook

```js
window.__ag.state       // {scene, mode, phase, squad, troops, wave, wallHP,
                        //  wallMax, site, road, progress, enemies, garrison,
                        //  gate:{left,right,leftResult,rightResult,distance,side}}
window.__ag.forceMode('campaign'|'rush'|'endless', {roadId})
window.__ag.forceWave(n)   // campaign: also jumps to the site that owns wave n
window.__ag.reset()        // clear the save and return to the menu
```
Both force switches queue into `__ag.pending` when called before boot and are
drained by `AG.orchestrator.applyForce()`; after boot they apply immediately.

### What was verified, and how

Headless Chrome 150 driven over a hand-rolled CDP client (the Chrome
extension bridge was not connected), 390x844 dpr2, portrait orientation
override, WebGL via SwiftShader. Because the headless page only gets ~2 Hz of
rAF, the game was stepped deterministically with `AG.game.step(t, 16.7)`.

- Boot: 98 textures baked, 27 audio buffers registered, console clean, no
  exceptions on any path exercised.
- Full campaign: road 1 -> Palisade (waves 1-2) -> road 2 -> Causeway Redoubt
  (3-5) -> road 3 -> Pass Gatehouse (6-8) -> road 4 -> The Aftergate (9-10)
  -> result `win`, gold medal, save written (`best 10 / medal gold /
  cleared true`).
- Wall loss: wall falls, result `lost`, no medal, waves recorded.
- Endless: waves 11-15 held at the siege wall, reinforcement road fired at
  wave 16, returned to the wall at 17.
- Gate Rush: rr1 finished at squad 120 -> silver, `rush.rr1` persisted, and
  the unlock chain reported "Toll Bridge" unlocked.
- Save: round-trips through GGKit; `normalizeSave({v:99,junk:1})` returns a
  clean default rather than throwing.
- UI law: 700 frames of live road play and 700 frames of live wall combat,
  0 frames with more than one transient, 0 centre banners during live play.
- `node --check` clean on `ag_data.js`, `ag_art.js`, `ag_ui.js`, `ag_run.js`,
  `ag_base.js`, `game.js`, `sw.js`.
- Payload: 194 KB total, largest file `ag_art.js` at 36 KB. Budgets are
  2.5 MB total and 400 KB per file.

### What could not be run here

- **The 4x-throttle feel capture is not a valid number from this box.** This
  machine has no usable GPU for headless Chrome, so the only renderer
  available was SwiftShader, which caps the page at roughly 2 frames per
  second regardless of the game. What was measured instead, at
  `Emulation.setCPUThrottlingRate 4`, is scene-update CPU only (sim, input,
  scene-graph writes, HUD updates, excluding GPU submission): road median
  0.0 ms / p95 1.2 ms, wall median 0.0 ms / p95 1.4 ms with 10 enemies and a
  full 10-slot garrison, 2-3 samples of 600 above 33 ms (all first-call JIT
  warm-up). The real GPU-side 17.5 ms median / 6-of-600 gate needs a capture
  on hardware.
- Real multi-touch drag-to-garrison on a phone. The pointer path was
  exercised through synthetic CDP pointer state and the tap/drag code paths
  were driven directly, but no physical device test was run.
- Service-worker offline behaviour: `sw.js` only registers over https, and
  the local verification server is plain http, so registration never fired.
  The precache list was checked by hand against the directory listing.
- Audio was synthesised and registered but never rendered to speakers here;
  headless has no output device. Buffer construction and blob URL creation
  were confirmed (27 registered entries).

### Deferred

- Per-site wave modifiers beyond composition (no siege-only mechanics such
  as ladders, rams or wall-breach events yet).
- A garrison that persists across sites. Each site is deliberately a fresh
  wall so leftover troops matter and the road payout stays the economy, but
  a "veterans carry over" option is a natural difficulty lever.
- Role variety past the three prototype roles; no fourth role, no per-role
  upgrade branches.
- Endless mode reuses the siege identity forever. Rotating the four site
  looks past wave 25 would keep it fresher.
- Gate Rush leaderboards or par-time scoring; scoring is squad size only.
- The landmark is a single static image per site rather than a set piece
  with its own animation or event.
- No haptics, no share card, no replay of a run's gate choices.

## Fix round 1

### Fixed

- CRITICAL: Gates are now stateful portal encounters with trigger windows, sequential portal spawns, breach damage, and a protected final-gate progression before the road can finish.
- CRITICAL: Wall combat now has explicit melee and projectile attack states, readable telegraphs, projectile travel, player hit points, invulnerability, movement, and evade handling.
- CRITICAL: Procedural presentation now uses layered silhouettes, rounded armor, emissive portal cores, commander states, telegraph artwork, shot trails, and richer gate and foe textures.
- MAJOR: Road collision uses the authoritative squad position and a squad formation footprint instead of a single point.
- MAJOR: Scene transitions clear both the GGKit input map and the derived input adapter state.
- MAJOR: Garrison drag ownership is per pointer, including role, position, and drag ghost.
- MAJOR: Added GGKit-owned gamepad polling with dead zones, button edges, axis navigation, and disconnect fallback while Phaser input remains disabled.
- MAJOR: Menu keyboard and controller focus can select Campaign, Gate Rush, Endless Wall, and unlocked Rush roads.
- MAJOR: Save normalization now derives progression medals from numeric progress and clears impossible medals and cleared flags.
- MAJOR: First-run tutorial progress has persistent steer, evade, portal, garrison, and wall-evade completion flags with guided coaching.
- MAJOR: Wall waves now show a countdown, stop spawning after timeout, and expose attack telegraphs and attack type.
- MAJOR: Added explicit road evade and wall commander idle, attack, evade, and recovery animation states.
- MAJOR: Added pooled fading projectile trails for defender and enemy shots.
- MAJOR: Added an always-visible squad integrity meter to the road HUD.
- MAJOR: Enemy death now has a flash, burst, ring, reward popup, and standard hit-stop with elite scaling.
- MAJOR: Hit-stop now freezes cosmetic clocks while fixed-step simulation continues in both active scenes.
- MINOR: Defender projectiles retain target identity and discard shots whose target has died.
- MINOR: Large road formations now add layered reserve silhouettes and a scale-aware formation footprint, while the full HUD count remains authoritative.
- MINOR: Wall crack notification flags reset for every Base scene run.
- MINOR: Wall music crossfades to a danger stem at low integrity or high threat mass.
- MINOR: Landmarks now bob, pulse, and emit a one-time arrival beat.
- Ship hygiene: bumped the service-worker cache version to `2026-08-11-aaa-fix1`, preserved the payload and per-file budgets, and removed the remaining em dash from the title notes.

### Rejected

- MAJOR AAA evidence: not captured in this fix round because the requested current six-gate harness requires a deployed build and a connected browser, while this round explicitly forbids deployment and the available environment has no browser connection. Static syntax, manifest, icon, precache, asset-key, save-normalization, punctuation, and payload checks were run instead.
