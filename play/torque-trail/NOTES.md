# Torque Trail

## Player controls

- Left vertical control: throttle above center, brake below center.
- Right horizontal control: drag left or right to steer.
- Keyboard: `W` or `ArrowUp` throttle, `S` or `ArrowDown` brake, `A` and `D` or the arrow keys steer.
- Tap a depot ring to open its job board. Choose a load, choose tires, and deliver to the gold beacon.
- Engage winch when bogged near a gold-ringed tree. Press `W`, `Space`, or the winch button.
- Recover when no anchor is close. Recovery costs up to $25 and never ends a run.
- Visit a depot to change tires, toggle diff-lock, change livery, or buy a torque upgrade.
- `Escape` opens the pause menu. The Settings panel controls music, effects, screen shake, and reduced motion.

## Goal

Complete delivery work across the mud bog, rock crawl, and ridge trail. Earn payouts, tune the truck, unlock every route, and keep the frontier supplied.

## Developer notes

### Preserved prototype behaviors

- The original throttle and steering model remains the baseline: acceleration uses the 195-unit impulse, the speed caps are 90 water, 105 mud, 145 rock, and 215 packed trail, and the steering power follows speed.
- The three prototype tire profiles are preserved: ROAD `1.2 / .68 / .75`, MUD `.8 / 1.35 / .9`, and ROCK `.88 / .78 / 1.3` for road, mud, and rock traction.
- Mud bogging starts after sustained low-speed throttle in mud, clears when leaving mud, and can be solved by a nearby tree winch or recovery.
- The prototype job board, cash payouts, current cargo, last depot, and reset-trip behavior remain intact, expanded to twelve delivery jobs.
- Persistence uses GGKit guarded saves with content validation. Cash, jobs, completed routes, tire choice, diff-lock, upgrade, livery, current cargo, position, recovery state, and tutorial completion persist between jobs.
- The player vehicle has idle, driving, bogged, winching, and delivered presentation states with wheel spin, chassis lean, pitch, lamps, and recovery feedback.

### Audio inventory

- Music: `quiet-range.mp3` for the title and `open-trail.mp3` for driving, both loaded through GGKit music bus on first interaction.
- SFX: `click`, `confirm`, `back`, `open`, `drop`, `select`, `winch`, `mud`, `wood`, and `payout`, all MP3 and routed through GGKit SFX bus.
- Audio preferences are persistent through GGKit. No OGG files ship.

### Content inventory

- One handcrafted-feeling open world map with six depots.
- Three primary terrain zones: Mud Bog, Rock Ridge, and Ridge Trail, plus open meadow, shallow water, and connecting roads.
- Twelve delivery jobs across six depots, tier 1 through tier 6, with gated route progression and repeatable contracts for more than 20 minutes of discovery and route play.
- Interactive first-run briefing covering job loading, driving, diff-lock, and delivery.
- Three tire choices, three persistent torque upgrades, three persistent liveries, payout economy, winch anchors, and no-fail recovery.

### Known limitations

- The SUV source mesh is a low-poly utility vehicle rather than a bespoke truck silhouette. Cargo rails, bed, lamps, livery, and effects are added in the view rig.
- Terrain is procedural vertex-colored geometry with intentionally stylized lighting instead of a texture-heavy PBR landscape.
- Music is curated to short looping cuts to keep the mobile payload below the per-title budget.

## Fix round 1

### implemented

- Resize state corruption -> control rectangles now retain valid measurements, remeasure after controls become visible, and reject zero-sized input zones.
- Pointer zone theft and stale drags -> each pointer is claimed on control pointerdown, read by its claimed zone, and cleared on pointerup, cancel, blur, pause, and lost capture.
- Recovery abandoning cargo -> recovery keeps the active job and respawns outside the destination trigger radius.
- Obsolete service-worker code -> code requests use network-first fallback, search strings are respected, the cache version is bumped, and registration requests `/play/` scope.
- Missing reachable audio volume controls -> the themed settings panel exposes persistent Music and Effects sliders through GGKit audio setters.
- Insufficient repeatable content and display-only difficulty -> route tiers unlock from delivered runs and completed routes become repeatable contracts.
- feel_no_spikes failure -> boot no longer decodes the complete SFX bank, the nearest-settlement hot path no longer allocates, UI writes are snapshot-gated, and surface VFX use fixed-size pools.
- Active bog and winch state not persisted -> guarded saves now validate and restore recovery state, with pagehide checkpoints.
- Winch overshoot -> pull motion clamps to the six-unit release distance and checks the post-move distance.
- Road traction misclassification -> packed-road precedence now runs before mud and rock zone checks.
- Torque Kit recovery promise -> upgrades increase winch speed and reduce recovery cost, with matching garage copy and stat bars.
- Livery cargo-bed mismatch -> the cargo-bed material is retained and recolored with the selected livery.
- Stale tire selection -> job and garage tire choices update together.
- Landscape status overlap -> the state chip is moved above the control lane with a dedicated landscape layout.
- Greybox-adjacent terrain -> fog, wet depressions, wheel ruts, road transition marks, rock strata, sockets, and zone-specific surface passes were added.
- Unauthored zone layout -> Mud Bog now has reeds and deadwood, Rock Ridge has boulder gates and sockets, and Ridge Trail has fences and route markers.
- Missing truck hero -> title and chase cameras frame the authored truck, with idle presentation, visible suspension travel, contact shadows, livery preview, and wheel effects.
- Missing fog/weather mood -> fog color follows the current track and water shimmer, flag motion, foliage sway, and ripples add restrained secondary motion.
- Mud interaction read -> paired rear-wheel mud spray, wet-road spray, puddle marks, and rut marks are pooled and surface-colored.
- Rock contact read -> authored boulder clusters, dark ground sockets, suspension probes, and terrain-driven chassis travel reinforce the crawl line.
- Static suspension -> four wheel pivots now use terrain probes for compression and rebound.
- Fixed vehicle shadow -> four tire contact blobs and a slope-aware chassis blob adapt to wheel travel and ground slope.
- Straight winch rope -> the rope is now a segmented, sagging cable with tension interpolation, vibration, and color change.
- Generic VFX -> separate pooled mud, gravel, wet-road, cable-spark, and payout-confetti systems have distinct motion and color profiles.
- Missing motion language -> bog, winch, recovery, and delivery events feed a spring-damped chassis accent; Reduced motion disables the custom accent, shake, and hit-stop together.
- HUD readability and missing telemetry -> state placement is safe above the controls, and speed and grip arcs update in the driving HUD.
- Text-only job, payout, and garage surfaces -> route thumbnails, tier pips, repeatable status, payout banner, stat bars, and a livery-aware animated truck preview were added.
- Passive onboarding -> the first briefing now pulses the Bramblehook target, draws a route guide, and opens its board when the card is tapped.
- Generic loading -> a title-specific loading composition shows authored stages and progress while GGKit still owns loader lifecycle.
- Off-brand settings -> the title now owns a themed settings panel while GGKit remains the audio, lifecycle, and persistence implementation.
- Unproven landscape support -> lateral controls, reserved HUD space, and a dedicated landscape composition are defined.

### disputed

- None. The duplicated review blocks were consolidated into the unique findings above.

### deferred

- Production HTTPS ship-hygiene evidence -> deploy and production gate capture are forbidden by this fix-round scope, so only local static checks were run.
- Asset ledger `Used by` metadata -> `/play/_assets/LEDGER.md` is outside the permitted edit paths; no new assets were added and the title LICENSES.md remains complete.

## GGRacer retrofit

- `game.js` is now the title adapter. The preserved simulation owns controls, terrain classification, truck handling, bogging, winch recovery, job completion, GGKit saves, modes, UI, and audio. GGRacer owns the rendered road, environment, truck presentation, chase camera, lighting, headlights, suspension motion, and speed FX.
- The old title-side terrain, road ribbon, OBJ vehicle, camera, and particle render paths were removed. Depot rings, gold delivery beacons, and winch anchor rings remain title-side meshes and are positioned from `trackQueries.closestPoint()` and `sampleRacingLine()` on the active stage.
- `tracks/frontier-main.json` and the twelve `tracks/job-*.json` files were authored from the existing `ROAD_PATHS` vertices. Their elevation values are the existing `heightAt(x, z)` terrain samples, banking stays gentle, every stage is point-to-point with `closed: false`, and all twelve shipped jobs remain selectable and drivable.
- Theme progression is deliberate: early pump-seal and radio work uses desert, Silt and Lantern House work uses coastal, survey, fuel, and core work uses alpine, and the tier 5 and tier 6 quarry runs use night-city with `timeOfDay: night` so GGRacer headlights read clearly. Quality tier 2 is forced for the title showcase path and the engine's dense parallax dressing remains active.
- The adapter gap is that the shared carkit exposes a GT-bar truck-like silhouette rather than a title-specific cargo-bed mesh. Torque Trail feeds its livery, speed, steering, braking, pitch, roll, and terrain-derived `suspension` state into that supported vehicle; changing the shared carkit was outside this retrofit contract.
