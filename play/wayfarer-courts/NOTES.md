Controls: drag the left pad to walk, tap the right button to talk, gather or
enter a gate. In battle tap ATTACK, SKILL, ITEM, GUARD, BOND or SWAP; tap a
rival to change target and tap a portrait to change the ally in focus.
Keyboard: WASD or arrows to walk, Space or E to act, 1-5 for battle commands,
Q and E to swap rows, A for auto battle, Tab and 1-6 in menus, Escape to pause.

Goal: take court quests from the lantern capital, walk the regions, win the
turn fights, and open all five benches. Rank up, change class, craft from your
drops, recruit twelve companions and climb the fifteen rung Sky Arena.

Wipes cost a moment, not the road: the company stands back up at 72 percent
and the quest stays open. Progress persists locally.

---

## AAA rebuild

Rebuilt in place from the archived prototype (canvas node-crawl) to a Phaser 3
view over a fixed-step sim, with GGKit as the only implementation of pause and
resume, rotate overlay, visibility pause, pointer identity, guarded saves,
audio buses, loading screen, settings and the juice budget.

### Implemented

**Turn combat clarity (owner priority 1)**
- Explicit turn timeline: a seven chip rail above the stage, built by a
  forward simulation of every charge clock that never mutates a live unit.
  Chips carry the actor mark and colour; the next actor is highlighted.
- Formation rows matter. Front row deals 1.1x and takes full damage; back row
  deals 0.92x and takes 0.84x. Melee arts only reach the rival front row while
  it stands; arts flagged reach ignore that. Rows are shown on every portrait
  and can be changed mid battle with SWAP at no turn cost, exactly as the
  prototype allowed.
- Five elements on a strict cycle (ember beats verd beats tide beats dusk
  beats stone beats ember), 1.5x strong and 0.7x weak, shown by an icon on
  every portrait, rival header and art row.
- Eight stacking statuses (burn, chill, weaken, stun, guard, shield, regen,
  rally) with a fixed harmful, helpful, control ordering, distinct silhouettes
  and a turn countdown, drawn as one compact pip row per unit.
- Auto battle with per companion orders (assault, support, guard, focus). Any
  tap on the command panel seizes control on the spot and turns auto off.
- Fast skippable resolution: tap anywhere during a resolve, enemy or intro
  beat to collapse its timer, plus a Fast resolution toggle in settings.

**Loop (owner priority 2)**
- 30 court quests across 5 acts: fetch, purge, escort, riddle and bench.
  Each act ends on a bench fight. Quest turn in happens at the capital gate.
- Hub that grows in 5 tiers (Waystall, Forge, Arena, Academy, Court quarter)
  at 0, 3, 8, 14 and 22 filed quests. Unbuilt quarters are drawn as scaffolds
  and light up as they open.
- Sky Arena ladder: 15 fixed rungs with authored squads, escalating rewards
  and a win-to-open gate. Rungs can be refought for materials.
- Crafting: 5 materials from drops and quest rewards, 12 recipes over weapon,
  armour and charm slots, four tiers each. Gear is unique across the company.
- 12 companions in the roster: 4 start, 4 are earned by named quests
  (Flickeroot, Thimblehorn, Gloomlet, Cloudpup) and 4 are bonded in the wild
  (Pebblewink, Mothmoss, Brinebell, Emberfin) using the prototype's posted
  catch odds.
- Class change at rank 5 and rank 10 along four class lines of three tiers,
  gated behind the Academy quarter. Every class tier adds an art.
- All of it persists through GGKit save with a validated schema: unknown
  class ids, gear ids, quest ids, party members and ranks all fall back.

**World design (owner priority 3)**
- 5 authored regions: Lantern Capital, Bamboo Passes, Salt Flats, Moonbridge
  Marches, Celestial Court. Each has its own tile palette, path net, prop
  family, encounter table, material table, festival colour, a four-name NPC
  cast with written lines, and its own battle backdrop bake.
- Tile overworld of 22 x 30 tiles with a lane road net, encounter meadows,
  water, rock, props and a gate home. Each map is generated once from a fixed
  seed and baked into a single canvas texture, so nothing replays a Graphics
  command list per frame.

### Presentation

- Every sprite, portrait, rival silhouette, tile, hub illustration, battle
  backdrop, UI mark and particle is authored into canvas textures at boot.
- Player entity has six animation states across four facings: idle, walk,
  act, cast or guard, hurt, cheer and a downed pose.
- Five pooled particle systems: hit sparks, heal motes, reward bursts,
  footstep dust and ambient festival embers. Every pool is preallocated.
- Screen shake and hit stop go through the GGKit juice budget, so the
  accessibility toggle removes shake, hit stop, banner overshoot, transient
  fades and halves particle counts.
- Audio: five original music loops (town, field, battle, court, celestial)
  crossfaded by area, and sixteen distinct effects, all through GGKit buses,
  all mono mp3. Music is only requested after the first interaction.

### UI law compliance

- One transient at a time. Toasts queue behind each other and behind a centre
  banner, never stack.
- Centre banners only at run boundaries: battle start, battle end, quest
  filed, act clear, class change, capital growth, journey end.
- In play events use a small corner chip that measures its own width, holds
  for one second and never overlaps the turn rail, the play area or the
  command grid.
- Tutorial is one thin fading strip at the top edge, one line at a time, seven
  steps, each advanced by the player actually doing the thing.
- Persistent HUD is one compact bar: region, one objective line, coin, time,
  auto chip, pause chip. Icons and meters carry the rest.
- Every touch target is at least 44px. Effective text is at least 12px for
  decoration and 14px or more for anything the player must read. Safe area
  insets are applied by the page shell.

### Preserved prototype behaviours

- The four founding wayfarers with their exact base stats: You 82/15/4 front,
  Mira 66/10/4 back, Rook 74/13/3 front, Pax 70/9/6 back.
- All eight spirits with their names, colours, glyphs, base stats and passive
  traits: Stonewarm +8 company vitality, Tidecall +8 percent bond odds,
  Kindle +2 attack, Softstep 12 percent back row evade, Duskwink +4 percent
  bond odds, Buttonhide +2 defense, Driftstep heal 3 after each fight,
  Brightbite +5 attack.
- The three prototype benches in order with their exact stats: Veyra Ashglass
  142/17/5, Orren Vell 176/20/7, Seln of the Reeds 214/23/9. Two new benches
  continue the ramp for acts 4 and 5.
- Bond odds formula unchanged: clamp(0.06 + weakened * 0.72 + trait bonus,
  0.05, 0.94), posted on screen, and a target above 82 percent health refuses
  the attempt with "weaken it first".
- Row multipliers, the def * 0.25 attack subtraction, guard at 0.55, back row
  at 0.84 and the 12 percent back row evade all carry over.
- Score values carry over: 90 a road fight, 450 a bench, 140 a bond.
- A wipe restores the company to 72 percent and keeps the quest open.
- Keyboard 1-4 battle commands and Q and E row swaps still work.

### Known defect classes avoided

Pools are preallocated with no separate debug view. Render state lives on the
scene, never on the sim unit. Pointer claims are registered on window level
listeners installed after GGKit init and seed kit.input.pointers at claim time,
so touch survives while the kit is paused. No camera split is used. Scenes are
built through a prototype factory so custom methods survive. Test switches are
readable from the boot fallback and from the live scene. The accumulator is
clamped so no clock outruns the stepped sim. Every keyed lookup against
content goes through a guarded accessor. All static board and map art is baked
to textures. No runtime Graphics arcs. setTextIfChanged and setColorIfChanged
guard every label. Scene config uses parent: document.body. sw.js precaches
only files that exist.

### Verification hook

`window.__wc = { state, forceMode(mode), forceStage(stage) }`. state exposes
mode, stage, progress (0 to 1 over the thirty quests), health (worst party
member out of combat, party total in combat), score, act, region and the live
combat object. forceMode accepts title, hub, field, battle. forceStage accepts
a region key, an arena rung 1 to 15, or `boss1` through `boss5`.

### Verified in this lane

Headless Chrome at 390 x 844, served from the repo root so the absolute
`/play/_shared/` paths resolve exactly as they do when deployed:

- Boots to the title with zero console errors and zero failed requests.
- Full flow driven by real taps: title, capital hub, company panel, wayfarer
  panel, quest board, accept a quest, walk the field, encounter, battle,
  attack, art list, arena rung, bench fight.
- Every captured frame is non black and carries far more than 64 distinct
  colours at 4 bits per channel (112 on the sparsest menu panel, 271 to 529
  across the five regions, the arena and the bench fights).
- Auto battle driven to turn 3 of a bench fight with damage, elements and
  statuses all resolving, and all five regions entered through the hook.
- `node --check` passes on game.js and sw.js. sw.js precaches 32 paths and all
  of them exist. Payload is 1.09 MB total, largest single file 199 KB.

Not run here: the 4x CPU throttle frame trace. The build box was carrying a
load average near 600 from the rest of the fleet, and every Chrome timing run
either timed out at the protocol layer or lost the renderer. The trace belongs
to the orchestrator's gate pass against the deployed URL anyway.

### Deferred

- No cloud save or cross device sync: the brief is a local first mobile title.
- Escort followers walk the player's breadcrumb trail rather than pathing on
  their own; the region maps are open lanes, so a path solver would not change
  the outcome.
- Rival units reuse four family silhouettes with per rival colour and scale
  rather than a unique sprite each; the bible asks for shared family
  silhouettes, and this keeps the payload at about 1.1 MB.

## Retina pass 2026-08-16

- Audit before ratio: 1.00x at the emulated DPR 3 portrait viewport. Configured after ratio: 3.00x from `GGKit.hiDpi.factor(390, 844)`, with a 1170 x 2532 backing store for the 390 x 844 design box.
- Recipe: Phaser `Scale.FIT`, dense scale dimensions, `GGKit.renderDefaults`, `setZoom(f)` in Boot and Play, and matching resolution through the shared text style helper.
- Factor cap: none beyond GGKit's standard maximum of 3. No title-specific cap.
- Live canvas ratio and gameplay screenshot were unavailable because the browser backend was empty and the sandbox denied private HTTP listeners. The after ratio above is the configured geometry, not a live canvas read.
- Static title-local canvas bakes now use `GGKit.hiDpi.canvas` and Phaser texture source resolution. Gameplay, balance, and content were unchanged.
