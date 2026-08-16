Controls: left thumb anywhere on the left side moves; right thumb aims and
fires; the right edge buttons are gadget, reload, weapon swap and vault, and
the vault button only appears when there is low cover in front of you.
Keyboard: WASD move, arrow keys aim and fire, R reload, Tab or F swap, G
gadget, Space vault, Esc pause.

Goal: run the nine mission Operations campaign. Breach the door, clear the
floor, cut the charges, pull the intel, walk the hostages out and make the
extraction. Medals unlock weapons and gadgets in the Armory.

Modes: Operations (9 missions, 4 theatres), Survival (endless waves in the
harbour) and the Shoot House time trial.

Feel: hitscan fire with damage falloff, recoil bloom that rewards short
bursts, cover you can shoot through and cover you cannot, suppression that
makes hostiles flinch and miss, and reloads you can cancel with a swap or a
vault.

## AAA rebuild

Rebuilt 2026-08-13 for the AAA Mobile Uplift (fleet F13). Phaser 3 from
/play/_shared, GGKit as the sole lifecycle, pause, rotate, pointer identity,
save, audio bus, loading and juice implementation. Landscape.

### Files

| File | Role |
|---|---|
| `index.html` | shell, base href /play/ironsight-ops/, absolute _shared script paths |
| `io_content.js` | weapons, gadgets, hostile classes, 4 theatres, 9 missions, survival, trial, unlock table, guarded accessors |
| `io_art.js` | every texture baked at boot; no Phaser Graphics object exists in this title |
| `io_sim.js` | grid, collision, sight lines, reachability, flow field, pooled records, frame event ring |
| `io_rules.js` | ballistics, hostile behaviour, ordnance, objective machine, scoring |
| `game.js` | Phaser scene: rendering, HUD, menus, controls, harness hook |
| `sw.js`, `manifest.json` | PWA, precache lists only files that exist |

### Content

| Mission | Theatre | Objectives | Par | Intel |
|---|---|---|---|---|
| 1 Cold Open | Harbour Warehouse | breach, clear 5, extract | 2:30 | 2 |
| 2 Dockside Sweep | Harbour Warehouse | defuse x2, extract | 2:55 | 3 |
| 3 Quiet Entry | Night Embassy | intel x2, clear 6, extract | 3:10 | 4 |
| 4 Hostage Wing | Night Embassy | rescue x2, escort | 3:25 | 3 |
| 5 Sandline | Desert Compound | reach asset, escort | 3:40 | 3 |
| 6 Hard Deck | Desert Compound | breach, hold 42s, extract | 3:55 | 4 |
| 7 Night Cargo | Harbour Warehouse | defuse x2 under squads, extract | 4:10 | 4 |
| 8 Under Meridian | Meridian Subway | hold 26s, hold 26s, extract | 4:25 | 4 |
| 9 Last Train | Meridian Subway | clear 8, hold 55s, extract | 5:00 | 5 |

Plus Survival (endless waves, resupply every third wave, a shield every
fifth) and the Shoot House time trial (22 targets in batches of 4).
Campaign par times alone total about 32 minutes; medals gate 7 unlocks
across 27 possible medals, so a full clear plus the two side modes is well
past the 20 minute floor.

Arsenal: 4 primaries (Vector 7, Rasp 9, Longshot, Breacher), 2 sidearms
(Sidearm 45, Stub 20), 4 gadgets (Frag, Smoke, Flashbang, Drone Ping).
Hostiles: rifleman, rusher, marksman, shield, plus inert shoot house targets.
Difficulty ramps 0.55 to 1.0 across the campaign, scaling hostile hit points,
accuracy and movement, with squad sizes from a 2 man patrol to 9 plus timed
reinforcements.

### Preserved prototype behaviour

The archived prototype is the design document and these carried over
verbatim: AR 16 damage / 0.12 cooldown / 350 range / 0.042 spread, SMG
10 / 0.075 / 255 / 0.10, DMR 31 / 0.38 / 520 / 0.018; the damage falloff
curve `clamp(1 - dist/range*0.35, 0.58, 1)`; frag radius 84 and 88 damage;
smoke that breaks sight lines both ways; the sensor sweep as the Drone Ping;
the hostile think timer of 0.22 plus up to 0.18 seconds; target selection
with the 230 unit hidden penalty; cover choice scored as
`dist(bot,spot) + dist(target,spot) * 0.08`; player move speed 124; the
guarded, validated local profile save. Twin stick control and the gadget
button survive; the loadout picker became the Armory and the two arena maps
became four authored theatres because the brief called for a campaign.

### Feel and presentation

Fixed 60 Hz accumulator with a 5 step ceiling; hit stop halts the sim step
while the art clock advances with it, so no clock can run past the sim.
Recoil bloom per weapon with decay and a separate movement penalty, shown
live by an eight frame reticle. Aim assist steers at most 1.6 rad/s toward a
target inside a 15 degree cone, weakened by how hard the stick is pushed, and
never snaps; it can be switched off in Settings. Penetrable crates tax a shot
by the weapon pierce value and break apart, walls stop it, glass shatters,
barrels cook off and chain. Near misses inside 26 units suppress: hostiles
lose accuracy, slow down and break for cover. Six pooled particle systems
(sparks, blood, splinters, explosion fire, smoke, muzzle dust) plus pooled
tracers and ejected casings. Player rig is legs plus torso with six leg
frames and six torso frames (idle, fire, reload, vault, lean, down).

Audio: 3 looping tracks (menu, mission, contact intensity, crossfaded when
hostiles have eyes on you) and 22 distinct SFX, all original synthesised MP3
through the GGKit buses, no ogg anywhere.

UI law compliance: one transient at a time through a chip queue, corner chips
for in play events, centre banners only at run boundaries, a single thin
coach line that fades after about three seconds, icons over labels, all HUD
text at 14px or larger, action buttons at 44px or larger in the thumb zone,
safe area insets from the shell.

### Harness hook

`window.__io = { state, forceMode(mode, arg), forceStage(n) }`. The state
object is allocated before Phaser boots and mutated in place; force calls
made before the scene exists are queued and drained on ready. Modes are
`menu`, `ops`, `armory`, `campaign` (arg is the mission index), `survival`
and `trial`.

### Measured locally

`gate.mjs` against a local server at 844x390, dpr 2, 4x CPU throttle: http
200, non black 99.6 percent, distinct colours 214 on the title and 295 in
play, feel median 16.7 ms, zero console errors, zero failed requests, payload
1153 KB, largest file 226 KB. The spike count in that harness run is not
trustworthy on this box: an idle control trace on the static title screen,
where this title does almost no per frame work, showed the same spike
profile, so the numbers are dominated by the software rasteriser under
throttle. The level bake was still batched into a single draw list (it was
280 ms unbatched) and the theatre mood is baked into the level texture rather
than composited every frame. Service worker registration is https only, so it
reads false on localhost. Both need re-checking on the deployed URL.

### Deferred

- No online play. The prototype's TDM and Control arena modes were dropped in
  favour of the campaign the brief specified; Survival keeps the arena feel.
- Civilians take a third of incoming damage and are never targeted on
  purpose, so an escort loss needs real carelessness rather than one stray
  round.
- Breach charges are a hold on the marker rather than a placed physical
  charge, which keeps the interaction to one thumb.
- Gamepad input is not wired; touch and keyboard are.

## Retina pass 2026-08-16

- Measured before/after canvas-to-CSS ratio: no per-title live measurement was available. The fleet baseline measured 1.00x for 62 titles and 1.10x to 2.46x for the remainder. The after audit was blocked when the prescribed runner could not bind its private port (`listen EPERM`), and no browser backend was available. Static target at DPR3 is 3.00x.
- Recipe: `GGKit.hiDpi.factor(GW, 390)`, dense FIT scale dimensions, `GGKit.renderDefaults`, camera zoom in the scene create method, matching Text resolution, and all `io_art.js` procedural canvas textures baked with `GGKit.hiDpi.canvas()` plus source resolution.
- Factor cap: none beyond GGKit's default [1, 3] clamp.
- Could not capture the required gameplay screenshot, backing-store ratio, or gameplay color metrics in this sandbox. `node --check game.js` and `node --check io_art.js` pass.
