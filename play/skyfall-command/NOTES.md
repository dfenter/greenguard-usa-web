Tap anywhere in the sky to launch an interceptor from the nearest battery.
Keyboard: arrows/WASD move the crosshair; Space or Enter fires.
Destroy incoming warheads before they reach the six towns.
MIRVs split, smart bombs dodge blasts, and fast movers need quick reactions.
Every fifth cleared wave restores one town and adds interceptor ammo.

## Fix round 1

Round 1 review findings from the adversarial code review, the QA gate pass and
the art/FX/design pass, plus the two carry-ins (the failing feel_no_spikes gate
and the missing LICENSES.md).

An earlier implementer lane for this title was interrupted part way through
this fix round and left the title in a non-running state. Before any finding
below was addressed, the working tree was audited file by file: work that was
already correct was verified and kept, work that was half-applied was finished,
and two blocking regressions the interrupted lane had introduced were repaired.
Those two are listed first because nothing else could be verified until they
were fixed.

### Blocking regressions repaired first (from the interrupted lane)

- **The render pass was never wired up.** The lane had correctly split entity
  pose out of `step()` into sim state so that hit-stop could freeze the
  rendered world, but `paint()` was never given the other half: threat and
  interceptor sprites were never positioned, `paintBlasts()` and
  `stepRibbons()` were defined and never called, and the shield highlight and
  district fires had no driver. Nothing in the playfield moved. `paint()` now
  writes every entity transform, runs the blast bloom and the ribbon pool, and
  skips only the transforms while the cosmetic clock is frozen.
- **Touch input was dead, so the game was unplayable on a phone.**
  `kitPointer()` read `event.pointerId` only, but Phaser hands it a
  `TouchEvent` on touch devices and a `MouseEvent` on desktop, neither of which
  has that field, so every touch resolved to `null` and no shot was ever fired.
  Verified by headless run: 40 taps produced 0 shots before the fix, and the
  tutorial advances on the first tap after it. `clientOf()` now resolves the
  client position out of whichever event family arrived, and the GGKit identity
  check matches by pointer id where the browser supplies one and by proximity
  for touch (a touch `identifier` and a `pointerId` are different id spaces and
  cannot be compared).
- Three smaller breakages from the same lane: `paint()` called `b.ammoT` on a
  battery whose field is `ammo0` (a per-frame TypeError), `paintHud()` called
  `this.hud.combo` which the HUD rebuild had replaced with the centre chip, and
  `hud.best` was fed the string `'BEST 000123'` through a bitmap numeral face
  that carries no letter glyphs. All three corrected.

### Implemented

Code review:

- MAJOR Tutorial skips the real first volley -> already fixed; verified.
  `tutFinish()` sets `volley = 0` and calls `beginVolley()`, so night one runs
  all three of its volleys.
- MAJOR Tap targets offset during camera shake -> already fixed; verified.
  Pointer coordinates go through `cameras.main.getWorldPoint()`.
- MAJOR Phaser input bypasses GGKit pointer identity and clearing -> completed.
  The GGKit map consumption was in place but broken for touch (see above) and
  the `REDEPLOY` path still called `scene.restart()` directly; it now goes
  through `kit.restart()`, and the night-advance path clears the kit's input
  before restarting.
- MAJOR MIRV children killed by the parent blast -> already fixed; verified.
  A fresh threat carries `SPAWN_IMMUNE_STEPS` sim steps of blast immunity.
- MAJOR Armoured cruisers take two damage ticks from one blast -> already
  fixed; verified. Each blast carries an id and a threat records `lastBlast`,
  so one blast can damage a given threat exactly once.
- MAJOR City collision ignores horizontal distance -> already fixed; verified.
  `strikeDistrict()` runs a real footprint overlap test and an off-target
  warhead is a rooftop miss that can scorch but never destroy, with no
  retargeting onto another district.
- MAJOR Threat-pool exhaustion silently deletes scheduled threats -> already
  fixed; verified. `spawned` advances only on a successful allocation and a
  failed spawn is retried.
- MAJOR Blast pool overwrites active explosions -> already fixed; verified.
  `MAX_BLASTS` (44) exceeds `MAX_SHOTS` (40), and `detonate()` returns null
  rather than reusing a live blast.
- MAJOR Play scene does not handle resize -> already fixed; extended. The
  `relayout()` path was in place and wired to Phaser's resize event; it now
  also repositions the district shield highlights and recomputes the boss port
  offset.
- MAJOR Salvage "accuracy" is unbounded -> **implemented.** `kills/shotsFired`
  is clamped to 0..1 before it pays the 40 point accuracy contribution. Every
  other write to the economy was also routed through `grantSalvage()` and the
  score writes clamped to `MAX_SCORE`, because a run could otherwise mint a
  profile that its own save validator rejects on the next load and silently
  wipe the player's progress.
- MINOR Keyboard fire is not parity with touch during intro -> already fixed;
  verified. Space and Enter queue in both `intro` and `fight`.
- MINOR Save validation permits malformed economy values -> already fixed;
  verified. Safe integers, explicit policy bounds and rejection of unknown
  profile fields.
- MINOR Window blur listeners leak on every scene restart -> already fixed;
  verified. The closure is stored and removed on shutdown.
- MINOR `pickDistrict()` allocates during threat spawning -> already fixed;
  verified. It counts live districts and walks to the Nth.

QA gate:

- FEEL MAJOR, carry-in: `feel_no_spikes` failing at 44/600 frames over 33 ms,
  worst 183.4 ms -> **implemented.** Two spike sources were attacked. First,
  pool construction: `PlayScene.create()` built close to four hundred Phaser
  game objects in a single frame, and paid it again on every retry and every
  night transition because a scene restart destroys them. The pools now start
  small and grow by one object at a time on demand, so the cost is amortised
  over the first volley; the ceilings and the no-overwrite blast guarantee are
  unchanged. Second, per-kill texture uploads: the score popup was a Phaser
  Text, and `setText` re-renders its backing canvas and re-uploads a GPU
  texture, which was happening dozens of times a volley. Numeric popups are now
  bitmap numerals from the bundled digits face; only the handful of worded
  callouts a night still use Text. The in-play banner was also moved off
  Graphics onto Rectangles, per the rule already stated in the file that
  nothing on screen during gameplay may re-tessellate every frame. The
  music-stem pre-decode at boot and the baked sky from the earlier lane were
  verified in place.
- FEEL MAJOR, accessibility toggle only gates GGKit shake and hit-stop ->
  already fixed; extended. `motionOn()` / `flashOn()` / `fxCount()` were in
  place, but the boss-defeat and defeat flash plates, the dry-fire flash, the
  title hand-off flash, the ambient ash rate and roughly a dozen direct
  `emitParticleAt` calls still bypassed them. All now route through the same
  single reduced-motion configuration.
- UX/PWA MINOR, gameplay uses raw Phaser pointer events rather than GGKit's
  pointer map -> same fix as the code review MAJOR above.
- SHIP CRITICAL, per-title `LICENSES.md` missing -> **implemented.**
  `LICENSES.md` is authored and traces all 40 files under `assets/` plus the
  two PWA icons, 42 in total, by name, byte size and sha256 prefix to the generator function that
  produced them, with licence and reproduction instructions. Every asset is
  original CC0 work generated by `aaa/harness/sc_tools/build_art.py` and
  `build_audio.py`; no harvested pack is used, so no ledger pack row is
  consumed and no CC-BY attribution is owed. See "deferred" for the ledger row
  itself.

Art / FX / design:

- CRITICAL VFX showcase is not AAA-level -> completed. The staged bloom
  (70 ms core flash, eased fireball overshoot, expanding shock ring, ballistic
  embers and debris on every airburst, two delayed smoke puffs) was authored
  but its render half, `paintBlasts()`, was never called. Wired up.
- CRITICAL Interceptor and MIRV trails are not tapered ribbons -> completed.
  The velocity-aligned tapered ribbon pool was authored but `stepRibbons()` was
  never called, so no ribbon ever animated or expired. Wired up.
- CRITICAL The particle family is visually incoherent -> already fixed;
  verified. All particle textures are regenerated from one core-plus-halo neon
  generator, shapes are directional where the motion is, and smoke is the one
  non-additive member.
- CRITICAL Debris rain and shield shimmer are underbuilt -> completed. Debris
  on every airburst was already in `detonate()`; the shield's travelling
  highlight sprite existed but nothing animated it. `paint()` now drives it as
  a bright highlight scanning up the dome, and ruined and damaged districts
  emit their own fire and smoke for the rest of the night.
- CRITICAL Flat foreground reads greybox-adjacent -> already fixed; verified.
  Authored rooftop layer, reflected city glow, horizon rim light, per-district
  lit plinths and contact shadows.
- CRITICAL Loading, settings and pause are default utility overlays ->
  completed. The loader and settings sheet were already re-skinned into the
  Skyfall grade; the pause overlay was not, and its SETTINGS row opened the raw
  GGKit shell instead of the themed one. Both corrected. GGKit still owns the
  loader, settings and pause lifecycle; the title only restyles the DOM they
  produce.
- CRITICAL Boss night lacks visual escalation -> completed. The storm sky
  grade, aurora curtain and phase banners were in place; the boss had no attack
  language. Both ports now charge a warning beam down the playfield for the
  last half second before the Obelisk fires, and discharge with a flare and a
  shake when it does.
- CRITICAL Performance gate is already red -> see the FEEL carry-in above.
- MAJOR Hit-stop does not freeze the rendered world -> completed. This is the
  render-pass repair described at the top: pose is sim state, `paint()` is the
  only writer, and it holds the transforms while the cosmetic clock is frozen,
  so the world genuinely stops without any sim step being skipped.
- MAJOR HUD collision risk at 390 px -> already fixed; verified. Reserved pause
  cell, chain moved to its own centre chip, bitmap numerals, no secondary label
  below 12 px. The chain chip's pop was also converted from a per-kill tween
  allocation to a pooled decay.
- MAJOR Onboarding obscures the action and teaches by prose -> completed. The
  training panel moved out of the middle of the playfield to below the aiming
  clamp, a numbered step counter was added, and coach-mark arrows now point at
  the battery ammo counters and the district pips on the steps that describe
  them.
- MAJOR Command/refit is a scaffold of flat cards -> already fixed; verified.
  Per-track icons, current-to-next stat deltas, animated tab underline, salvage
  counter pop and a purchase celebration beat.
- MAJOR District damage states are too repetitive -> already fixed; extended.
  Three district faces times intact, damaged and ruined, plus the new
  per-district fire and smoke behaviour. Batteries carry idle, charge, empty
  and dead states.
- MAJOR Sky depth stops at static stars plus two moving skyline strips ->
  already fixed; verified. Ion haze parallax, star twinkle, and seven distinct
  baked night grades so blackout, wind, barrage, the late campaign and the
  finale are looks and not only rules.
- MAJOR Reduced-motion coverage is incomplete -> see the FEEL accessibility
  entry above.
- MAJOR Resize handling is incomplete -> see the code review resize entry.
- MAJOR Storefront identity is generic -> already fixed; verified. Bespoke
  logo lockup with an entrance and a breathing loop, authored DEPLOY CTA with a
  light sweep, and a staged hand-off into the night.

### Disputed

Nothing. Every finding described real behaviour in the reviewed build.

Two items are worth recording as accurate-but-since-superseded rather than
disputed: the code review's "blast pool overwrites active explosions" and
"threat-pool exhaustion" both describe the reviewed build correctly, and both
had already been corrected by the interrupted lane before this round began.

### Deferred

- **Evidence captures.** QA ART MINOR ("stage a genuine prototype-before and
  uplift-after pair"), QA UX/PWA MAJOR ("rerun gate.mjs against the deployed
  HTTPS URL and verify service-worker registration plus offline reload") and
  art MAJOR ("add deterministic 390 px captures for launch trail, airburst,
  MIRV split, shield block, district hit, boss phase, boss defeat, shop
  purchase, pause/settings and loading") all require writing into
  `review_evidence/` and deploying. This brief is scoped to
  `play/skyfall-command/` with no deploy, so all three are left for the gate
  re-run. The `pwa_sw` gate check is expected to fail on localhost by its own
  admission and can only pass over HTTPS.
- **The `LEDGER.md` row.** QA SHIP asked for "the corresponding original-asset
  pack/title row" in `/play/_assets/LEDGER.md`, which is outside this brief's
  write scope. It is also arguably already satisfied: the ledger's rows are
  harvested third-party packs and their "Used by" column, and this title
  harvests nothing, so there is no pack row to claim and no "Used by" cell to
  update. `LICENSES.md` states that explicitly, including that the
  `music (mixed harvest)` row is deliberately not used. If the studio wants an
  explicit "no third-party asset" row per title, that is a ledger-format change
  and belongs in one pass across all titles rather than here.

### Verification performed

Headless Chrome at 390x844, mobile emulation, touch input:

- Boots clean: zero page console errors, zero failed requests, reaches the
  fight phase, threats spawn and move, tutorial advances on the first tap.
- `node --check` clean on `game.js` and `sw.js`.
- Payload 1460 KB against the 2500 KB budget; largest file `music_alert.mp3` at
  272 KB against the 400 KB per-file budget.
- No em dash in any user-facing string; the single match in the tree is the
  studio template header comment at the top of `sw.js`.
- `sw.js` VERSION bumped to `2026-08-07a` and its ASSETS list regenerated from
  the directory, which added the eight asset files the earlier lane had shipped
  without caching (`aurora.png`, `clouds.png`, `digits.png`, `digits.json`,
  `ground.png`, `logo.png`, `p_fire.png`, `p_ribbon.png`).
- The Phaser plain-config-scene bug class was re-checked: every scene literal
  is still promoted through `toScene()`, which copies the whole method set onto
  a real `Phaser.Scene` prototype, and no method was added to a config object
  without going through it.
- A static consistency scan over `game.js` reports no read of a `this.` or
  `self.` property that is never assigned, which is the class of defect the
  interrupted lane left behind (`b.ammoT`, `this.hud.combo`).

**The 4x throttled frame trace could not be re-measured on this machine.** The
box was running at a load average above 200 for the whole session (a concurrent
36-run review round), and headless Chrome on the software rasteriser wedged on
every attempt: three runs of a 600 frame throttled trace failed to complete,
including one with a 150 second in-page wall-clock cap. Per the studio rule
that performance captures need an uncontended box, `feel_no_spikes` has to be
re-measured by the gate re-run rather than claimed here. The three spike
sources attacked above were each identified from the code and are each a real,
bounded cost that no longer occurs; what is not yet evidenced is the resulting
number.

## Uplift round 1

### Implemented

- Added the city-defense uplift in the existing pooled combat path. Interceptor
  drops swap the equipped in-run battery package and the HUD always shows the
  current package. No draft exists in this title, so pickup swaps are the
  acquisition path.
- Added pooled parachute and pod drops with a beacon column, drift-down landing,
  tap magnetization, expiry blinking, gold tide edging, pooled escort fighters,
  pooled rail and orbital line FX, and `setTextIfChanged` for the new dynamic
  HUD readouts.
- Added `window.__sc = { state }` coverage through the boot fallback and live
  scene. State reports `wave`, `pressure`, `equippedInterceptor`,
  `livePickups`, `escortCount`, `tideOdds`, and `lastTideTurner`, with separate
  debug records for pickup views. The switches are `forceGenerousDrops`,
  `forceWeaponDrop`, and `forceTideDrop`.
- Added Wing Squadron as two autonomous escorts. The first squadron is
  scheduled by 56 seconds, and a lost formation schedules recovery after 10
  seconds. Rally Squadron restores both slots.
- Added Strike Wing lane telegraph and bomber sweep, Cluster Barrage around a
  tapped point, chain lightning, time dilation, decoy flares, repair crews,
  score flare, scrap doubler, drone escort, Aegis Dome, Overdrive, Purge Sky,
  and Orbital Lance.
- Purge-class effects are capped against cruisers and the Obelisk. They clear
  ordinary threats but leave heavy and boss health remaining.
- Bumped `sw.js` to `2026-08-07b-uplift-round1`; the existing precache remains
  complete. No new assets were added, so `LICENSES.md` remains the traceability
  record for the shipped original assets.

### Interceptor roster

| Key | Field behavior |
|---|---|
| `standard-bolt` | Balanced bolt and standard airburst. |
| `flak-burst` | Wide proximity airburst with a larger impact ring. |
| `rail-lance` | Instant line strike plus endpoint FX. |
| `seeker-salvo` | Three tinted seeker darts that bend toward nearby threats. |
| `emp-web` | Long-lived blue web that slows threats in its radius. |
| `incendiary-arc` | Long-lived orange burn zone with repeated damage ticks. |
| `twin-stream` | Two parallel green bolts from one battery shot. |
| `heavy-bunker-shell` | Slow amber shell with the largest blast and debris beat. |

### Drop tables and caps

| Lane | Rule |
|---|---|
| Power drops | 14 second first landing, then 15 to 20 seconds normally, or 6 seconds while `forceGenerousDrops` is true. Hard cap 12 spawned powers and 14 pooled live records. |
| Generous roster | Aegis Dome, Overdrive, Chain Lightning, Time Dilation, Repair Crews, Score Flare, Scrap Doubler, Drone Escort, Purge Sky, Orbital Lance, Decoy Flares, Wing Squadron, Strike Wing, Cluster Barrage. Rare Purge Sky and Orbital Lance are held until 34 seconds in normal play. |
| Weapon drops | First landing at 24 seconds, then 18 second spacing normally, or 5 seconds while forced. Unseen interceptor keys are selected first. Hard cap 10 drops. A string force selects an exact key and then clears. |
| Wing guarantee | If no escort exists, a Wing Squadron drop is scheduled by 56 seconds. A formation loss schedules a two-escort recovery after 10 seconds. |
| Tide odds | Tide drops are gated until 90 seconds, then `0.04 + time + lost districts + damaged districts + live threat saturation + tier pressure`, clamped to 0.88. Gold-edge roster: Last Bastion, Sky Purge, Rally Squadron, Chrono Repair. One tide landing per 90 seconds. `forceTideDrop` bypasses the gate. |
| Stacking and caps | Timed powers merge into their per-power duration cap. Aegis Dome and Last Bastion protect city impacts through their active windows. Purge effects damage a cruiser once and an Obelisk by a bounded fraction rather than deleting heavy content. |

### Deferred

- Live browser smoke test, touch pickup magnetization, forced-drop collection,
  rail and strike screenshots, and the 4x throttle feel budget could not run
  because no browser surface was available in this session. `node --check
  game.js`, `node --check sw.js`, roster and hook assertions, payload limits,
  and all 46 service-worker precache path checks passed.
- Round 2 remains staged: hangar/meta progression and the larger spectacle
  pass are intentionally deferred.

## Uplift round 2 - command center and spectacle

### Implemented

- Added the command center hangar as the pre-run meta scene. It is reachable
  from the title COMMAND button and from the game-over COMMAND button. The
  scene now has isolated, depth-prioritised NIGHTS, HANGAR, LOADOUT, STYLE and
  REFIT tabs. Tab hit areas occupy their own row above page content, and the
  HANGAR, LOADOUT and STYLE cards scale labels to their measured text column so
  names, descriptions, level pips and prices do not collide at 390px.
- Added a persistent scrap bank. A completed or lost campaign run banks 75%
  of its run result, with the Salvage hangar track applying its earned bonus
  before the 75% bank cut. Round 1 field upgrade spending and all round 1 drop
  tables remain present; the round 1 drop rates remain the floor.
- Added six permanent five-tier hangar tracks, persistent across guarded saves:
  Battery Output, Reload Coils, City Plating, Radar Net, Salvage and Squadron
  Bay. Their exact costs and effects are listed below.
- Added persistent interceptor loadout selection. Interceptors become
  selectable after their pickup is acquired in a run. Locked cards keep their
  silhouette and show ENCOUNTER TO UNLOCK. The selected type is equipped at
  the start of every new run.
- Added six city skyline palette themes and six interceptor trail colors.
  STYLE updates the command-center sky immediately and the chosen cosmetics
  carry into the next run. Combat values do not change.
- Added double-tap airstrike. Every run starts with two STRIKE charges, the
  HUD shows a four-pip STRIKE row, and a double-tap in the fight calls the
  allied bomber sweep. Strike Wing pickups now bank one charge up to four
  instead of firing automatically.
- Added one pooled spectacle lane for tide-turners, Strike Wing activation,
  heavy interception, city saves, combo slams, wave clears and boss entrance
  or defeat. Each beat uses a 60% viewport banner with overshoot, two shock
  rings, additive edge washes and a restrained 1.8% to 2.5% punch zoom. The
  active gate permits only one full-screen beat at a time, and reduced motion
  disables the beat layers and zoom together.
- Added Radar Net approach rings, City Plating direct-impact hit points,
  Reload Coils fire locks, Battery Output damage scaling, run-start Squadron
  Bay formations and higher escort caps. Escort pools remain bounded.
- Extended window.__sc.state with hangar {balance, tiers, equipped, style},
  forceGrantScrap and forceSpectacle. The debug view remains separate from all
  live pools.
- Bumped sw.js to 2026-08-08-uplift-round2. The precache remains complete and
  no new assets were added, so LICENSES.md remains the asset traceability
  record.

### Hangar upgrade cost and effect table

| Track | Tier costs | Tier effect |
|---|---|---|
| Battery Output | 45, 72, 116, 188, 310 | +10% interceptor damage per tier, up to +50% |
| Reload Coils | 45, 72, 116, 188, 310 | +8% fire rhythm per tier, up to +40% |
| City Plating | 55, 84, 128, 204, 310 | +1 direct district hit per tier, up to +5 |
| Radar Net | 45, 70, 112, 182, 300 | +0.10 seconds of approach telegraph per tier |
| Salvage | 50, 78, 122, 196, 310 | +10% run earnings per tier before the 75% bank cut |
| Squadron Bay | 60, 92, 140, 220, 310 | Start with 1 to 5 escorts and raise cap by 1 to 5 |

### Save schema

- Guarded save version is 5. Existing version 4 saves migrate in place with
  zeroed hangar tiers, the standard bolt loadout, the aurora palette and the
  cyan trail.
- Existing top-level fields remain: v, night, salvage, best, siege, tut, flash
  and the round 1 field-upgrade object up.
- New hangar fields are tiers {output, reload, plating, radar, salvage,
  squadron}, equipped, style {palette, trail} and seen, where seen is the
  persistent interceptor encounter registry. The persistent bank is the
  guarded salvage integer and is exposed to verification as hangar.balance.
- All hangar keys, tiers, interceptor ids, style ids and booleans are rejected
  when malformed or unknown. forceGrantScrap is a one-shot numeric or boolean
  harness grant, and forceSpectacle is a one-shot boolean or spectacle key.

### Verification

- `node --check game.js` and `node --check sw.js` pass. The 46 service-worker
  title paths resolve, no CDN or network asset references were added, the
  payload is 1,486,951 bytes and the largest file is the 278,092-byte
  `music_alert.mp3`.

### Deferred

- Live browser smoke coverage for every command tab, loadout unlock, style
  preview, double-tap charge spend and game-over return path could not run in
  this session because no browser surface was available.
- The 4x feel trace and the full 600-frame no-spikes gate were not rerun. The
  new spectacle lane is pooled and bounded, but its measured frame budget
  still needs an uncontended capture under the studio performance rule.
- HTTPS service-worker registration, offline reload, deploy verification and
  deterministic spectacle evidence captures remain gate/deploy work outside
  this local implementation scope.

## Retina pass 2026-08-16

- Measured before ratio: unavailable for this title in this environment. Fleet baseline was 1.00x for 62 titles, with the remainder from 1.10x to 2.46x.
- Measured after ratio: unavailable because no browser backend was exposed. The helper path targets 3.00x at DPR 3, but that is not a captured measurement.
- Recipe: Phaser `Scale.RESIZE`; initial sizing, resize, orientation change, and visibility change all call `GGKit.hiDpi.resize`.
- Factor cap: none; the GGKit DPR cap of 3 applies. No title-specific cap was justified.
- Could not do: DPR 3 backing-store read or gameplay screenshot. Browser discovery returned no browser, and local HTTP port binding was denied.

## Retina pass 2

- Measured ratio after the required delayed DPR-3 sample: unavailable. The corrected configuration targets 3.00x, or 1170/390.
- Converted the parented title, command, and gameplay scenes to `GGKit.hiDpi.phaser`, `Phaser.Scale.NONE`, and `cfg.ggDpr`; all layout dimensions derive from the scale dimensions, and every camera zoom/punch is re-centered on the logical viewport.
- Could not do: delayed `retina_audit.mjs`, gameplay screenshot, live input/core-mechanic check, or `live_probe.mjs`. The harness could not bind its private port (`listen EPERM`), and no browser surface was available. Node syntax and diff checks passed.
