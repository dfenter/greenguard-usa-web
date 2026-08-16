# Corridor Crawl

Controls: tap an adjacent tile to move or bump-attack, tap yourself to wait, tap a bottom-bar slot to use an item, long-press any tile or slot to inspect. Desktop: arrows/WASD/QEZC/hjkl to move, space or `.` to wait, 1-6 to use items, M to mute, R to restart.
Loop: seeded rooms-and-corridors floors with fog of war; fight six monster types (pack rats, a splitting ooze, a ranged archer, an adjacent-only stalker, a shoving brute, a thief that steals and flees); potions and scrolls stay unidentified until used; hunger slows regeneration and then bites.
Goal: step on the down stairs to descend, take the Crown of Echoes on depth 8, then climb all the way back out through an angrier dungeon.
Fail/win: permadeath - score is depth x10 + kills x3 + gold (+100 for escaping); best score persists in localStorage; tap anywhere on the end screen to restart instantly.

## AAA rebuild

Implemented: Phaser 3 view over GGKit-owned lifecycle, pointer identity, save,
and audio buses; seeded 8-depth descent and Crown ascent; four authored floor
bands with palette shifts, monster weighting, set-piece rooms, risk-adjacent
loot, six monster silhouettes with idle/attack/hit/death states, pooled board
and particle rendering, adjacency brackets, crisp fog reveal, unidentified
use-to-learn items, hunger warning band, long-press inspection, interactive
first-run coaching, floor-clear and depth milestone medals, starting-kit
unlock chain, generous early drops, permadeath scoring, reduced-motion gating,
and `window.__cc = { state, forceFloor, forceEvent }` probe hooks. PWA files,
manifest, generated original icons, service-worker precache, and license
provenance are included.

Floor-band/event tables:

| Depths/events | Identity | Palette and weighting | Signature/read |
| --- | --- | --- | --- |
| 1-2 | Shallow Warrens | root-stone violet, rats and oozes | splitting ooze nest with loot beside it |
| 3-4 | Flooded Corridors | blue sump stone, oozes, archers, thieves | broken pump room with gold in the water |
| 5-7 | Ember Forge | slag red, archers, stalkers, brutes | bellows crucible guarded by brute and stalker |
| 8 | Crown Vault | amethyst stone, elite mixed guard | echo dais, Crown of Echoes, four guardians |
| ascent | Angered bands | extra brute/thief pressure, preserved seed | UP stairs, clear medals, escape banner |
| probes | `forceFloor`, `forceEvent` | boot fallback and live scene reads | `crown`, `floor-clear`, `escape`, `tutorial` |

Audio: the title now ships a local, original-IP mp3 set under `assets/audio/`.
Every cue is registered and preloaded through GGKit, with the four band loops
crossfading on floor changes.
In-app browser QA and local HTTP serving could not run in this environment:
the browser connector was unavailable and the sandbox denied binding a local
port. Node syntax checks, a 1,600-level dungeon VM sweep, and manifest/service
worker audits did run successfully.

## Fix round 1

Fixed:

- CRITICAL crown reachability: rebuilt the vault around the room centre, kept
  the dais centre and cardinal approaches open, and skipped pillars that would
  block a corridor mouth.
- CRITICAL visuals: added an original pixel atlas asset, pixel-grid floor
  glyphs, terrain edge transitions, band-specific set-piece geometry, water
  wave marks, ember props, vault accents, and a radial torch mask.
- CRITICAL player animation: added timed idle, walk, attack, and hurt states;
  attack and hurt states now expire from simulation events.
- CRITICAL audio: added 14 local original-IP mp3 cues, registered and
  preloaded them through GGKit, and crossfaded the four band loops.
- MAJOR HUD placement: SCORE, GOLD, and HP now anchor to the right edge and
  short portrait layouts move the log below the header.
- MAJOR save validation: enforced integer bounds, complete counters, unique
  unlocked kits, selected-kit membership, and the medals schema.
- MAJOR diagonal corner collision: corner clearance is checked before a bump
  attack can resolve.
- MAJOR Quickening: the haste skip is consumed after the enemy phase decision,
  so one enemy phase is actually skipped.
- MAJOR Thief and Terror retreat: fear now performs real distance-increasing
  movement with corner-safe collision.
- MAJOR enemy AI: added explicit patrol, chase, attack, telegraph, and flee
  states, including a reachable sound-hunting Stalker branch.
- MAJOR combat read: added intent markers, elite diamond marks, telegraph SFX,
  and visible strike or volley previews.
- MAJOR touch pause safety: local touch state is cleared on GGKit pause and
  pointer release is guarded while paused.
- MAJOR gamepad input: added GGKit-gated d-pad and left-stick movement.
- MAJOR one-action input: keyboard, gamepad, wait, and item input now select at
  most one turn action per frame.
- MAJOR sprite density: player and enemy sprites scale to the live tile size.
- MAJOR set pieces: warrens, flooded, forge, and vault rooms now have distinct
  authored floor geometry and props.
- MAJOR floor and pickup feedback: added a 250 ms fade transition, pooled
  pickup pop text, and counter pulse feedback.
- MAJOR FX and knockback: split hit sparks from footstep dust, added enemy
  family secondary FX, and added safe one-tile hit knockback.
- MAJOR GGKit juice: every frame consumes `kit.juice.frame()`, applies camera
  shake offsets, and freezes turn simulation during hit-stop.
- MAJOR tutorial encounter: depth 1 reserves the starting ring and guarantees
  an adjacent training rat.
- MINOR short viewport overlap: the compact layout reserves header clearance
  for log and band text.
- MINOR PWA registration: removed the duplicate registration call and bumped
  the service-worker cache version to `aaa-20260810-f6`.
- MINOR potion icons: identified potions now use their own authored icon in
  the world and inventory.

Rejected: none. Every review finding was actionable and was fixed.

Verification: `node --check` passed for every changed JavaScript file; 800
depth-8 VM levels had 0 Crown reachability failures; 200 depth-1 VM starts had
200 adjacent training encounters; Quickening produced 0 enemy moves during its
skip; the 4x deterministic VM median was 7.355 ms; the precached payload was
150,410 bytes with no missing entries and no audio files outside mp3.

## UI declutter

- Cut the persistent three-line play log, atlas ribbon, title/kit/band flavor labels, world `?` labels, and inventory item-name labels.
- Replaced SCORE/GOLD/HP/HUNGER words with compact icon counters, meters, and visible buff-duration icons; inventory counts remain readable and touch targets remain large.
- Moved all active-play banners, pickup feedback, and event text into one queued top-edge chip: one line, 14px text, 1.0s hold, fast reduced-motion-aware fade.
- Shrunk long-press inspection to one compact line and retimed it to 1.0s; shortened the tutorial coach to one thin single-line strip with a 3.5s lifetime.
- Kept floor-clear/run-boundary information in the same queued strip and the existing results screen; gameplay, difficulty, controls, and reduced-motion gating are unchanged.

## Round 2 polish

Corridor Crawl was raised from shipped to a modern commercial bar in both
presentation and systems. The accepted controls are unchanged: tap an adjacent
tile to move or bump-attack, tap yourself to wait, tap a pack slot to use, long
press anything to inspect, arrows/WASD/QEZC/hjkl, space or `.` to wait, digits
to use, M to mute, R to restart, gamepad d-pad and stick. Every behaviour
documented above still works, including the seeded descent, the Crown ascent,
unidentified use-to-learn items, hunger pressure, floor-clear medals, permadeath
scoring, the one-chip transient discipline from the UI declutter pass, and the
`window.__cc` probe hooks.

The code is now five modules instead of three: `core.js` (deterministic
utilities plus colour and easing maths), `content.js` (creature, item, class and
meta-track tables), `dungeon.js` (floor, arena and shrine generation), `art.js`
(the whole procedural texture bakery), and `game.js` (sim plus Phaser view).

### What changed visually

- **Tile-step movement.** Every actor now interpolates between cells instead of
  snapping. Attacks play anticipation, contact and recovery: the striker pulls
  back, lunges into the target tile, then settles, with a squash-and-stretch
  curve on the sprite. Hurt reactions squash the opposite way.
- **Real field of view.** `computeFov` writes a per-tile light value, and the
  board bake renders a genuine falloff, warm at the lantern and cooling into the
  band fog. Remembered ground is redrawn as a cold blue-grey memory that can
  never be mistaken for lit play space, and unexplored ground carries a faint
  grid so the board reads as a dungeon waiting to be mapped instead of a void.
  The lit radius is driven by the torch, so the light physically closes in.
- **Fourteen creature silhouettes**, each with idle, attack, hit and death
  textures plus code-driven lunge, bob and flash: gnaw rat, cinder swarm, split
  ooze, quill archer, bog spitter, ash cutpurse, hollow stalker, chest mimic,
  slate bulwark, rubble brute, lantern warden, gloom wraith, and the two bosses
  Slagmaw and Echo Sovereign. Bosses render at 1.4x tile with a dedicated health
  bar and phase label above the board.
- **Item icons with readable silhouettes.** Each identified consumable owns a
  shape, not just a tint: six flask forms for the potions, six wax-seal glyphs
  for the scrolls, plus ration, torch and crown. Unknowns share one muted
  silhouette so identification stays a real decision.
- **Five floor themes across ten depths** with authored per-band identity and
  its own floor-grain vocabulary: Shallow Warrens (roots), Flooded Corridors
  (tide marks), Ember Forge (slag cracks), the new Hollow Deeps (bone), and the
  Crown Vault (runes). Band palettes were lifted so lit stone reads as stone.
- **Six pooled FX systems**: hit sparks, footstep dust, magic motes, ambient
  torch embers, hand-tessellated shockwave rings, and a baked lantern glow that
  scales with torch fuel. Every impact has a particle burst and a sound.
- **Escalating celebration.** A pickup pops a chip and a small burst; a floor
  clear fires a medal ring, motes and a pitched shard cue; a boss defeat stages
  three expanding rings, a wide burst and a long shake; the Crown adds a gold
  ceremony; the run end raises a results card with an eased medal, staged text
  and a shard tally.
- **Animated screen transitions.** A nine-bar staggered wipe covers every screen
  change (title to run, run to title), floors still cross-fade, and the results
  card scales in rather than cutting.
- **A real title screen**, which the title never had: animated crown wordmark,
  five class cards that slide in staggered, the shard track with its next
  unlock, lifetime stats, and a DESCEND button. This also closes the missing
  title-menu half of the UX gate.
- Reduced motion still gates all of it through `kit.juice.enabled`: wipes
  shorten, staggering stops, ambient embers stop, particle counts drop, and the
  breathing and pulsing on menus goes flat.

### What changed in gameplay

- **Twelve field creatures with distinct AI**, up from six, plus two bosses.
  Rats gain courage in packs and break when alone and wounded; swarms take two
  steps a turn with no wind-up; oozes act at half speed and still split; archers
  telegraph a volley; spitters kite and poison; cutpurses steal and flee;
  stalkers hunt by sound through stone; mimics wait disguised as loot and ambush
  for bonus damage; bulwarks shrug off four damage from the side they face, so
  they must be flanked; brutes telegraph a three-tile charge that knocks you
  back; wardens mend wounded allies and summon swarms; wraiths walk through
  walls, ignore line of sight, and drain hunger on contact.
- **Boss floors every five levels.** Depth 5 is Slagmaw in an authored arena
  (gate room, throat corridor, wide pit): a slam ring, an ember lash at range,
  and a phase-three enrage with adds. Depth 10 is the Echo Sovereign, who blinks
  next to you when kited, fires an echo shockwave, and summons guardians. The
  Crown only appears once the Sovereign falls. The descent is now ten depths.
- **A consumable economy.** Coin shrines appear on most non-boss floors from
  depth 2: the offer and its price float over the tile, and standing on it and
  waiting buys it. Gold finally spends. New consumables: Torch Oil, the
  Revealing scroll (names one carried unknown), and the Blight potion, which
  hurts and poisons you, so drinking an unknown is a genuine risk. Mimics can
  replace a floor pickup, so loot itself can bite.
- **Torch pressure.** Torch fuel burns every turn, faster on deep floors and on
  the ascent, and the sight radius closes with it. A guttering torch warns once;
  a dead torch blinds you to three tiles and doubles hunger drain.
- **Five classes with real starting kits and passives**, chosen on the title
  screen: Wayfarer (balanced, mends on floor clear), Scavenger (eight pack
  slots, two unknown potions, richer gold, cheaper shrines), Ward-Bearer (tanky,
  starts with a warding scroll, sheds 1 damage per hit), Echo Runner (high
  attack, bonus damage on the first strike against an unwounded foe), and
  Lampwright (unlocked by the meta track: wide slow-burning torchlight, spare
  oil, a Revealing scroll).
- **A meta unlock track across runs.** Echo shards accrue from depth, medals,
  bosses and escapes, and cross seven fixed thresholds: Deeper Satchel, Kindling,
  the Lampwright class, Haggler, Scholar, Warded Step and Delver. Crossings are
  announced on the results card and are live on the very next descent.
- Poison is a new status with its own HUD pip; the HUD gained a torch meter and
  a boss bar, and the pack grew to eight slots.

### Save migration

The profile is now version 2 and the stored blob is migrated, never discarded.
GGKit's validator accepts both the shipped v1 shape and the v2 shape, and
`migrateProfile` converts v1 in place: best score, medals, run and escape
counts, and the tutorial flag carry over; the kit ids are remapped (`basic`
became `wayfarer`); `maxDepth` is clamped into the new 1-10 range; and the new
counters (`shards`, `bosses`, `kills`) are seeded, with returning players
credited `maxDepth * 3 + escapes * 20` shards so the meta track does not read as
empty after the update. Anything that fails both validators degrades to a fresh
profile instead of throwing: verified against a v1 blob, a type-corrupt blob and
raw garbage. The service worker version is `aaa-r2-20260813-a` and its precache
list was regenerated from disk (37 entries, zero missing, zero unlisted).

### Verification

Headless Chrome at 390x844 dpr2, zero console errors and zero failed requests
across every pass. 400 seeds x 10 depths: 800 boss arenas generated, 800
objectives reachable by flood fill from the up stairs, 400 of 400 Crown daises
reachable, 1,685 shrines placed. All 14 AI branches were driven live and every
intent fired (chase, patrol, strike, flee, volley, spit, charge, guard, mend,
summon, slam, wave, blink) with no exception. Shrine purchase refuses when poor,
charges exactly, fills the pack and clears the tile; torch burn shrinks the lit
tile count 52 to 46 to 38; the Revealing scroll names unknowns and Blight both
damages and poisons. Frame trace under 4x CPU throttle: median 16.7 ms at every
depth, idle traces 0-1 frames over 33 ms of 600. Payload 0.858 MB excluding
`_shared`, largest file 147 KB, no ogg anywhere. Those frame numbers come from
the least-contended sample available: this Mac was carrying other lanes at a
15-minute load average above 50 for most of the session, and repeat traces on a
loaded box scattered to 15-77 frames over 33 ms with the median unchanged at
16.7 ms. The trace should be re-taken on an uncontended box before it is used as
gate evidence.

Performance work was needed to get there. The first driven trace on depth 8 spent
60 of 600 frames over 33 ms. Fixed by pooling particle records so play allocates
no objects, sharing one cell vector instead of allocating per actor per frame,
caching colour strings for the ~900 lookups per board bake, baking the board
vignette once at layout instead of rebuilding a radial gradient every turn,
skipping redundant `setTexture` calls, and capping summon-driven population
growth. That took the same trace to 3-7 frames over 33 ms.

### Deferred

- The in-app browser connector was unavailable again, so all interaction proof
  is headless Chrome via puppeteer rather than a live browser session.
- Boss floors are authored rather than seeded; only their decor varies by seed.
  Seeded arena variants were judged a worse trade than guaranteed reachability.
- The ascent deliberately has no second boss fight. It raises spawn weights,
  torch burn and hunger instead, so the climb stays a chase rather than becoming
  a repeat of the fight you just won.

## Retina pass 2026-08-16

- Before ratio: 1.00x source baseline at DPR 3. After ratio: 3.00x configured
  through `GGKit.hiDpi.resize(game, cssW, cssH)`; a live canvas ratio could
  not be measured because Chrome aborted in this sandbox and the private HTTP
  bind was denied.
- Recipe: applied Phaser Scale.RESIZE hi-DPI sizing at boot, resize,
  orientation-change, and visibility events. Applied `GGKit.renderDefaults`
  while retaining the title's pixel-art and rounded-pixel settings, and set
  Phaser text resolution from `GGKit.hiDpi.dpr()`.
- Factor cap: none beyond the GGKit maximum of 3. No title-specific cap was
  needed.
- Could not complete the live DPR 3 gameplay screenshot or layout check.
  Existing authored canvas bakes were left at their logical sizes because a
  frame-unit migration to `GGKit.hiDpi.canvas(...)` could not be live-verified.
