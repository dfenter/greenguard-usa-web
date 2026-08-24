# Razorfin — Architecture Contract (Rev 1, 2026-08-19)

Orchestrator-owned. Lanes implement EXACTLY these interfaces. If an interface
must change, the lane STOPS and reports; the orchestrator revises this file.
Read play/_shared/NOTES.md defect classes before writing input/render code.

## Rev 8 addendum (2026-08-23): roster expansion 61 -> 85

RFD.SHARKS grows from 61 to 85 rows: 24 new sharks added as two new acts,
tiers 9-12 in each (same tier band as Act 3's super/legendary rows).
  - Act 4 "Pantheon" (12 sharks) — Greek GOD versions, radiant palettes.
  - Act 5 "Underworld" (12 sharks) — Greek DEMON/monster versions, infernal
    palettes.
Act numbers are now 1-5. Several consuming files hardcode act 1-3 (act
names, act clamps in silhouette/eye rendering, a hard `rows.length !== 61`
roster-count assertion in shark3d.js). See NOTES-pantheon-data.md for the
full inventory — those are NOT fixed here (out of this lane's ownership).

## Modules, ownership, load order

index.html loads, in order:
  /play/_shared/phaser.min.js
  /play/_shared/ggkit.js
  data.js       (orchestrator)  window.RFD   pure data, zero logic
  juice.js      (Lane F)        RF.Fx, RF.Juice, RF.Sound, RF.Music
  sharkart.js   (Lane D)        RF.Art
  abilities.js  (Lane E)        RF.Abilities
  world.js      (Lane B)        RF.World
  meta.js       (Lane C)        RF.Meta, RF.DevMode
  game.js       (Lane A)        RF.Game + Phaser scenes + player controller

`window.RF = {}` is created by juice.js (first RF module); every later module
attaches its namespace and MUST NOT touch another module's namespace.
No module registers window/document listeners; ALL input via kit.input
subscriptions (onDown/onMove/onUp/onKeyDown) — see _shared/NOTES.md
"release-side defect". No setTimeout/setInterval for game logic (pause safety);
schedule off the fixed-step clock RF.ctx.time.

## Runtime context

game.js creates ONE context object and passes it everywhere:

RF.ctx = {
  kit,            // GGKit instance ({slug:'razorfin', orientation:'landscape'})
  scene,          // active Phaser.Scene (Ocean during play)
  dpr,            // TITLE-SIDE density factor (Rev 3): clamp(devicePixelRatio,1,3),
                  // computed by game.js and exported as RF.Game.dpr. GGKit.hiDpi is
                  // clamped to 1 by the 2026-08-17 fleet kill switch, so razorfin owns
                  // its own factor: game sized in device px (zoom=1/dpr), EVERY px
                  // value (fonts, HUD, hit areas, bakes) multiplied by dpr. sharkart.js
                  // and world.js bakes use RF.Game.dpr (fallback 1). Real-device retina
                  // signoff is a SHIP GATE owned by Dan per the kill-switch policy.
  time: { now, dt, frame },     // fixed-step clock, dt === 1/60 during step()
  rng: mulberry32 instance,     // seeded; NO Math.random in sim code
  player,         // player entity (below) or null outside runs
  save,           // live profile object (RF.Meta owns shape)
  run: { score, coins, xp, combo, comboT, frenzy, goldRushT, biggestTier, slowmoT, timeScale },
}

## Entity schema (pooled plain objects; Phaser sprites attached)

ent = {
  active, id, kind,       // kind: 'prey'|'predator'|'hazard'|'pickup'|'player'
  defId,                  // key into RFD.CREATURES / RFD.SHARKS / RFD.HAZARDS
  tier,                   // 1..12 size tier
  x, y, vx, vy, angle,    // sim units = world px
  hp, maxHp,
  st: {},                 // per-entity scratch (AI state, frozen/stun/burn/poison timers: frozenT, stunT, burnT, poisonT, cookedBy)
  sprite,                 // Phaser GameObject (world.js owns lifecycle)
  r,                      // body radius px (collision)
}

Status effect timers are FIELDS ON st, decremented by world.js each step;
abilities.js SETS them, world.js APPLIES their consequences (frozen = vel zero
+ tint, stunned = no AI, burn/poison = dot). One implementation, in world.js.

## Interfaces (exact signatures)

### juice.js (Lane F)
RF.Fx.init(scene)                          // build pooled emitters (4-6 pools: bubbles, blood/score motes, element sparks, shockwave rings, ambient)
RF.Fx.emit(name, x, y, opts)               // fire-and-forget pooled burst; name ∈ RFD.FX keys; opts {tint, scale, count, angle}
RF.Fx.beam(x1,y1,x2,y2,opts)               // sustained beam segment (atomic breath), caller re-emits per frame
RF.Juice.hitStop(ms)                       // freezes sim (game.js reads RF.Juice.consumeFreeze())
RF.Juice.shake(intensity, ms)              // camera shake via scene.cameras.main
RF.Juice.consumeFreeze()                   // -> ms of pending hit-stop, zeroes it (game.js calls once per frame)
RF.Sound.play(name, opts)                  // kit.audio sfx by name from RFD.SFX; opts {vol, rate}
RF.Music.setLayer(layer)                   // 'calm'|'danger'|'goldrush' crossfade via kit.audio music
RF.Juice.kaiju(ent, scene)                 // Leviathan Rex presence: dorsal glow pulse, bass thud cadence, entry roar+shake (reads ent.defId==='leviathan_rex')

### sharkart.js (Lane D)
RF.Art.bakeShark(scene, sharkDef, variant) // -> textureKey string; bakes via GGKit.hiDpi.canvas at DPR; caches; variant ∈ 'play'|'menu' (menu = larger, posed)
RF.Art.bakeCreature(scene, creatureDef)    // -> textureKey; procedural jelly/crab/turtle/mine/puffer; Kenney fish pass through (returns their loaded key)
RF.Art.paletteOf(sharkDef)                 // -> {base, belly, accent, glow} for UI/particle tinting
Silhouette params come ONLY from sharkDef.sil (see data.js schema). Head enum:
point|blunt|hammer|saw|frill|whale|croc|angler|eel|rock|mech|skull|void|kaiju.
Every baked texture MUST be visually distinct at 96px length; countershading
mandatory; Act 2/3 add glow/pattern layers keyed off sharkDef.sil.fx. Act 4
("Pantheon", tiers 9-12, gods) and Act 5 ("Underworld", tiers 9-12, demons)
follow the same glow/pattern convention (Rev 7 addendum, 2026-08-23).

### abilities.js (Lane E)
RF.Abilities.passives(sharkDef)            // -> resolved passive struct {wideBite, lunge, biteUp, filterFeed, ambush, slowMetab, junkEater, pressureImmune, armored, coinMagnet, fireWake, dreadAura, undying} + stat multipliers
RF.Abilities.canFire(ctx)                  // power meter full & no active power running
RF.Abilities.fire(ctx)                     // activate player.def.active; manages duration/cooldown internally
RF.Abilities.update(ctx)                   // per fixed step: running actives, fireWake trail, dreadAura field, coinMagnet pull; sets st timers on affected ents via ctx.world queries
RF.Abilities.chargeFromEat(ctx, ent)       // called by game.js on every swallow
RF.Abilities.hud(ctx)                      // -> {charge:0..1, ready:bool, id, tint} for game.js HUD
Actives (RFD.ABILITIES rows, ONE implementation each, parameterized):
pyro, freeze, volt, toxin, sonic, vortex, phase, quake, chrono, atomic.
Element VFX via RF.Fx.emit/beam ONLY (no ad-hoc emitters).

### world.js (Lane B)
RF.World.init(scene, ctx)                  // build zones, pools, spatial hash, tilemap-free layered background per RFD.ZONES
RF.World.update(ctx)                       // spawner budget, AI, status-effect application, despawn ring
RF.World.query(x, y, r, kindFilter)        // -> array of active ents (spatial hash)
RF.World.spawnBurst(defId, x, y, n)        // ability/debug spawns
RF.World.kill(ent, cause)                  // release to pool; emits death FX via RF.Fx; drops pickups
RF.World.zoneAt(y)                         // -> RFD.ZONES row
RF.World.entities                          // live array (read-only for other lanes)
Predator AI: roster-driven NPC sharks (RFD.SHARKS rows with npc:true weights
per zone); chase player if player.tier < npc.tier, flee if >.

### meta.js (Lane C)
RF.Meta.load(kit)                          // -> profile (validate + migrate, horde-meridian chain); SAVE_VERSION=1
RF.Meta.commit(kit, profile)               // persist via kit.save.set
RF.Meta.endRun(ctx)                        // apply run coins/xp/level-ups/unlock callouts -> results payload
RF.Meta.canBuy / RF.Meta.buy(profile, sharkId | upgrade)   // economy per RFD.ECONOMY
RF.Meta.ownedFor(profile, id)              // || RF.DevMode.state.forceUnlockAll  (dev overlay NEVER persisted)
RF.Meta.tierUnlocked(profile, tier)
RF.DevMode.init()                          // parse URLSearchParams ONCE: unlockall, invincible, coins, notut; expose window.__rf {version, state, switches, unlockAll(), resetSave(), giveCoins(n), forceGoldRush(), forcePower(id), forceZone(n)}
Scenes owned: Shop (tier-grouped, 5 act sections, scrollable), Results.
UI LAW: no center banners in play; Shop/Results are out-of-run, free-form.

### game.js (Lane A)
Phaser config: GGKit.hiDpi.phaser({...GGKit.renderDefaults smart-merge}),
Scale parent #game-root, landscape 844x390 CSS baseline.
Scenes: Boot (load Kenney assets + bake), Menu (title, shark select grid via
RF.Meta), Ocean (the run), + wires Shop/Results from meta.js.
Fixed step: STEP=1/60, MAX_STEPS=4 accumulator; ctx.run.timeScale multiplies
accumulated time (chrono/slow-mo); RF.Juice.consumeFreeze() before stepping.
Player controller: touch target-follow (kit.input.onDown/onMove), boost on
second pointer, eat resolution (mouth sensor circle; wideBite arc; near-tier
multi-bite 250ms cd; swallow -> RF.Abilities.chargeFromEat + combo + hunger),
hunger drain (def.metab * zone pressure rule; tier>=9 immune), death -> slow-mo
-> Results. HUD: ONE corner cluster (health, boost, power button, coins,
combo chips <=24px, <=1s, one at a time). DEV chip when RF.DevMode active.

## data.js schema (orchestrator)

RFD = {
  SHARKS: [{ id, name, tier, act, cost, stats:{speed, accel, turn, bite, hp, metab, boost}, passives:[...], active:'volt'|null, sil:{head, len, girth, finScale, tailScale, palette:{base,belly,accent,glow}, pattern, fx}, npc:{weight, zones}|null, blurb }],
  ABILITIES: { pyro:{...}, ... },   // range/duration/dmg/charge/tint per active
  CREATURES: [{ id, name, tier, kind, speed, hp, score, coins, sprite, packMin, packMax, tint }],
  HAZARDS: [{ id, name, tier, kind, speed, hp, score, coins, sprite, dmg, tint }],
  // tint (Rev 7 7.6, S3): hex int, dominant/visible color per species. Used
  // by the engine swallow burst color (fx tint) instead of a constant amber.
  ZONES: [4 rows: yMin,yMax,name,tint,fog,ambient,pressureTier,intendedTier,spawns:[[defId,weight]]],
  // intendedTier (Rev 7 7.2, S3): the player tier a zone is built around.
  // Contract: every prey row in a zone's spawns table has tier <=
  // intendedTier+2 (world3d selftest gate). Over-tier prey do not spawn in
  // that zone; the TOO BIG cue still covers a player who is simply
  // under-tier for what IS in the table. Density for zones that lost an
  // over-tier row is preserved by raising the remaining low-tier weights,
  // not by leaving a gap.
  PICKUPS: [{ id, name, weight, dur, tint, hits? }],
  RELICS: [{ id, zoneId, name }],           // 3 per zone x 4 zones = 12 rows
  RELICS_BY_ZONE: { [zoneId]: [row,...] },  // derived index, generated
  // Relics (Rev 7 7.6, S3 table / S2 placement): secret per-zone collectibles.
  // Entity kind 'relic' (world3d, deterministic seed = zone id, maze
  // dead-ends), excluded from eatEligible, collected via the pickup path in
  // stepEat -> ctx.run.relics[]. profile.relics[zoneId] is a 3-length bool
  // array indexed to RELICS_BY_ZONE[zoneId] order. A full zone set (3/3 true)
  // is a relic-set unlock check in Meta.endRun (see meta.js schema below).
  MISSIONS: [{ id, type, name, target, gems }],
  // type in eatCount | findRelic | surviveZone | score. target shape by type:
  //   eatCount:   { defId: string|null, n }   // null defId = any prey
  //   findRelic:  { zoneId: number|null, n }  // null zoneId = any zone
  //   surviveZone:{ zoneId, seconds }
  //   score:      { n }
  // gems is the integer reward (1-5) on completion. 12-16 rows; 3 are chosen
  // active per run by Meta.rollMissions(profile). Progress/completion consumed
  // via Meta.missionEvent(ctx, type, payload) (see meta.js schema).
  GEMS: { frenzy:{ goldrush, blood, school }, daily, gempickup },
  // Award table. frenzy.* = gems on that frenzy-cue completion; daily = first-
  // run-of-the-day bonus; gempickup = value of a rare world 'gempickup'
  // entity. Gems are NEVER purchasable (standing rule); spend-only via
  // Meta.spendGems.
  SKINS: [{ id, name, sharkId: string|null, cost, palette:{base,belly,accent,glow} }],
  // Cosmetic palette-swap skins, gem-cost only. sharkId:null = selectable on
  // any owned shark; sharkId:'<id>' = locked to that shark. profile.skins =
  // { owned:[ids], selectedSkin: id|null } (global selection, kept simple
  // per the plan -- not per-shark).
  SECRET_SHARKS: [{ sharkId, relicSets, gemCost }],
  // Two existing act-3 roster rows (nullfin, banshee) gated behind EITHER a
  // full relic-set count (profile.relics zones with all 3 true) OR a
  // Meta.spendGems gem-only unlock -- first path to be satisfied wins, no
  // roster row added. Checked in Meta.endRun's relic-set unlock step.
  ECONOMY: { tierUnlockLevel:[..12], xpCurve, coinValues, upgradeCosts, dailyBonus },
  FRENZY: {...}, FX: {...}, SFX: {...},
  SAVE_VERSION: 2,  // bumped Rev 7 (S3): profile gains gems/relics/skins/missions
}
Ability/passive IDs in SHARKS rows are the single source of truth; abilities.js
must throw at boot (console.error, not crash) on any unknown id — that is the
integration tripwire.

## meta.js save schema additions (Rev 7, SAVE_VERSION 2)

Profile gains (defaultProfile/validateSave/normalize/migrate updated together):
```
gems: 0,
relics: { <zoneId>: [false, false, false] },  // one entry per RFD.ZONES id
skins: { owned: [], selectedSkin: null },
missions: { active: [missionId,...] (len 3), progress: {[missionId]: number},
            completed: {[missionId]: true} }
```
Migration from SAVE_VERSION 1 preserves coins/xp/level/sharks/best/runs
unchanged and backfills the new fields to their empty defaults (see NOTES for
the exact chain step and its selftest fixture).

## Fleet laws (binding)

- RETINA: bake at DPR via GGKit.hiDpi.canvas; >64 distinct colors/frame.
- UI: no center banners during play; one transient at a time; corner chips
  <=24px <=1s; HUD one corner cluster; tutorial = one fading top strip.
- No em dashes in ANY user-facing string.
- 60fps mid-phone: pool everything, no per-frame allocation in step(), cap
  live entities (RFD budget), spatial hash not O(n^2).
- sw.js recovery worker byte-copy; never a caching worker.
- Zero console errors/warnings at boot and through a full run.

## Lane deliverable protocol

Each lane delivers ONLY its own file(s) plus an append-only section in
NOTES.md ("Lane X pass 1: what/why/self-test result"). Self-test: a
`RF.<Ns>.__selftest()` function that exercises the module headlessly (no
Phaser boot needed where possible) and returns {pass:bool, notes:[]} —
orchestrator runs all of them in one page before integration.


## Rev 4 (2026-08-19, owner iPhone verdict): controls + living graphics

Owner verdict on device: controls wrong (must play like Horde Meridian),
graphics static (must be animated), overall look too flat ("1980 atari",
must read modern like Hungry Shark). This revision is binding.

### Controls (Lane A)
Floating virtual stick, exactly the horde-meridian feel (play/horde-meridian/
game.js bindInput ~2415): first pointer plants a visible ring+nub at touch
point (HUD camera, scrollFactor 0); drag = normalized dx/dy with max radius
62 CSS px; base FOLLOWS the finger beyond 1.35x radius (re-centering drag);
release clears. Stick vector drives DESIRED VELOCITY directly (direction +
magnitude * shark speed); shark aligns heading quickly (turn cap ~2x current
rates - responsiveness first, HSE-style). Second simultaneous pointer =
boost (unchanged). Keyboard fallback unchanged. One pointer identity via
kit.input.

### Shark rig + animation (Lane D bakes, Lane A animates)
RF.Art.bakeSharkRig(scene, def) -> { body, tail, pect, jaw|null, pivots:
{ tail:{x,y}, pect:{x,y}, jaw:{x,y} }, size:{w,h} } - texture keys for PARTS
baked separately at DPR (body includes head; tail = caudal fin pivoted at
peduncle; pect = one pectoral fin pivoted at root, drawn twice mirrored;
jaw = lower-jaw overlay for tier>=5). 'thumb' and 'menu' variants stay
single-texture (iOS memory law: total texture memory <= 80MB, measured).
Runtime (game.js): player + NPC sharks are containers assembling parts;
tail oscillates rotation (rate 4-9 Hz scaled by speed/size, amplitude up
with speed and turn), pectorals flutter subtly, body banks into turns
(slight roll/rotation lag), jaw opens on bite windup, idle bob when slow.
Fallback: single-texture sprite if rig missing.

### Modern shading (Lane D)
No flat fills. Body: 4+ stop vertical gradient, rim light along dorsal edge,
specular gloss streak, fin-root ambient occlusion, subtle speckle texture,
proper eye (iris + pupil + catchlight). Element glow layers keep working on
parts. Same treatment on procedural creatures (jelly translucency, mine
rust/highlight, puffer spikes shaded).

### Living water (Lane B world.js + Lane F juice.js)
World: animated caustic bands near surface (slow sine drift), god rays sway
(slow rotation/alpha cycles), seaweed/kelp decor sways (skew oscillation),
ambient particle density up per zone, subtle whole-water tint shimmer over
time. Prey ANIMATION: fish tail-wiggle (cheap rotation/scaleX oscillation in
update), jelly bell pulse, puffer inflate anim. Zero per-frame allocation,
entity budget unchanged.
Juice: player swim bubble trail (rate ~ speed), boost speed-lines, richer
bite burst, surface breach splash, Gold Rush screen tint pulse.

### Perf gate
60fps target midphone: parts add draw calls - player rig 4-6 sprites, NPC
rigs 3; measure texture memory (<=80MB) and frame time headless; the REAL
gate remains the owner's iPhone.

## Rev 9.5 open ocean (2026-08-24)
Owner: "you cannot dive down." Root cause (verified): the world SDF
(mazeRawSDF/buildMazeLayout, 14400x4800) rasterised a rock-maze cavern graph
— most of the map was solid rock, and rock sat only ~230 units below the
player's spawn point. That is a cavern-crawler, not the open-ocean feel the
game is going for (Hungry Shark reference).

mazeRawSDF/buildMazeLayout are replaced with an open-ocean generator using
the SAME grid raster call sites (buildSDFGrid/terrainSDF/resolveBody/
regionAt are unchanged and stay generic reads):
- A rolling seabed height profile along x (y ~4300-4600), with a few deeper
  trenches (down to ~4750).
- 6-10 sparse large mounds/islands/pillars rising off the seabed as tapered
  cones, some reaching mid-depth (Twilight band); none seal a full vertical
  column (enforced by a build-time open-column check, see SPEC3D).
- Side walls and world-edge rock, same mechanism as before.
- Zones are now DEPTH BANDS over open water: 1 Sunlit 0-1100, 2 Reef
  1100-2300, 3 Twilight 2300-3500, 4 Abyss 3500-4800 (was 0/1200/2400/3600/
  4800 maze bands; boundaries moved, band count and world height unchanged).
- Relics: still 3/zone, deterministic seeded (seed = zone id), but now sit
  in small cave pockets carved into mound flanks or trench floors instead of
  maze dead-ends.
- Player spawns in open water at (7200, 260); no rock within 600px of spawn.

Full design notes, constants, and probe results: NOTES-rev9-ocean.md.
