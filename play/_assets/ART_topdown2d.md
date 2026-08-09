# AAA Art Bible — Top-down 2D lane (Rev 1, 2026-08-06)

Titles: Driftlands, Wanderlight (retrofit). Engine: Phaser 3 (vendored).
Wanderlight exception: sim modules keep running untouched; Phaser (or a
new canvas view layer if Phaser fights the existing loop) replaces the
view only — view reads sim, never writes (ART_DIRECTION.md rule 7).

## Look

Readable 16px-grid pixel/tile art scaled with crisp nearest-neighbor
(`pixelArt: true`), 3x-4x zoom on phones. Reference class: modern
top-down adventure pixel games.

- Tiles/sprites: Kenney tiny-town + tiny-dungeon (CC0) as the base
  vocabulary; recolor via palette swap to the title's identity so the two
  games do not look like siblings. Driftlands = warm island palette
  (sand, teal water, jungle green). Wanderlight = cool forest/dusk.
- Terrain edges always use transition tiles, never hard color seams.
  Water animates (2-4 frame cycle). Tall grass/props between the player
  and camera get subtle sway (house rule 3: secondary motion).
- Characters: >=3 animation states minimum per gate (idle, walk 4-dir,
  attack; hurt flash). Kenney character sheets or original pixel edits;
  IP gate: nothing resembling licensed characters.
- Lighting: day/interior contrast via tinted overlay + radial gradient
  "torch" masks in dungeons; no real lighting engine needed.

## Feel (gate-checked)

- Camera: room-scroll or smooth-follow with lookahead; screen shake on
  hits within house budget; hit-stop 40-70 ms.
- Combat feedback: enemy white-flash 2 frames, knockback, pooled hit
  sparks (>=2 particle systems: hit sparks + footstep dust or leaf
  burst).
- Pickups: ease-out-back pop + sparkle + counter tick-up (never snap).
- Transitions: fade-through-black 0.25 s or slide between rooms.

## Audio

Music: exploration + dungeon + danger stings (freepd adventure set).
SFX >=8: sword, hit, hurt, pickup, door, secret, step (surface-varied),
UI. ggkit.audio buses; music crossfade on area change.

## Per-title notes

- Driftlands: prototype has 3 dungeons + island + gear + fog-of-war —
  that content graph is the design doc; uplift adds tilemaps, sprite
  animation, minimap styling, and a proper title screen with the island
  silhouette.
- Wanderlight: 5,909-line module split (js/engine,world,dungeon,tiles,
  sprites,entities,items,sound,game). Replace tiles.js/sprites.js
  code-drawn output with atlas rendering; keep world/dungeon/entities
  sim intact; sound.js rerouted through ggkit.audio.

## RPG addendum

Applies to Corridor Crawl, Aetherfall, Starweft, Skyshard Vale, Mythweave,
Wayfarer Courts, Thornmark, Gravemarch, and Fieldnotes Safari. Names, story,
sprites, icons, dialogue, and effects stay original IP. The top-down lane must
remain readable beneath the extra party, progression, and menu information.

### Combat readability

- Combat has a three-step read: silhouette first, team and role second, state
  third. Party members use consistent portrait frames, health bars, resource
  bars, and role marks. Enemies use silhouette families and a small shape mark
  for elite, boss, or summon status. Never rely on color alone: pair team
  colors with border shapes, pips, or letter marks.
- Keep field sprites separated from their feedback. A unit's selection ring,
  target bracket, health bar, and status row must not merge into a single blob.
  The selected party member gets one clear bracket; the active enemy gets one
  clear target treatment. Avoid a permanent halo around every unit.
- Party portraits sit in one stable rail, with the same order in combat,
  turn order, and command menus. If four characters are present, the rail can
  compress, but portraits never become smaller than the tap target allows.
  Do not make the player infer party order from field position.
- Enemy families get a shared silhouette language across wilds and dungeons.
  Rare variants may add one accent shape or palette note, not a full new stack
  of effects that obscures the attack telegraph.

### ATB and turn language

- ATB uses a short, labeled gauge with a visible fill direction. Empty, ready,
  and delayed states have distinct shapes and labels. A full gauge produces a
  calm READY chip and a stronger portrait frame, not a frantic permanent
  flash. The turn order rail shows the next few actors with portraits or
  original role marks.
- Pure turn-based battles use explicit YOUR TURN, ENEMY TURN, and RESOLVING
  states. The active unit gets a selection bracket and the command panel
  opens from the same screen edge every time. Do not use an ATB-looking bar
  for a title whose sim has no time gauge.
- Command options use action verbs and one-line consequence text: ATTACK,
  GUARD, SKILL, ITEM, or a title-specific original term. Disabled actions
  explain why in a small adjacent label. Selection, confirmation, and result
  states need different accents so a tap never looks like a hidden second
  command.

### Damage and status discipline

- Show one damage number per resolved hit or one aggregated number for a
  tightly grouped multi-hit action. Critical hits may scale and add a mark;
  they do not spawn a cloud of duplicate digits. Damage, healing, shielding,
  and blocked results use distinct icons as well as restrained color changes.
- Damage over time reports on a measured cadence or as one total at action
  resolution. Never cover the battlefield with a number fountain. Defeat gets
  one final readable result and one short impact beat, following the house
  anticipation, contact, and follow-through pattern.
- Limit visible status icons per unit. Each icon has a distinct silhouette,
  a compact countdown, and an inspect or details path for its full text. Use a
  consistent order for harmful, helpful, and control effects. Do not animate
  every icon independently or use tiny unlabeled abbreviations as the only
  explanation.
- Hit flashes, shake, and hit-stop stay inside the house budgets and obey the
  reduced-motion setting. Cosmetic feedback reads sim events and never writes
  combat state.

### Dialogue and quest UI

- Dialogue uses a portrait, speaker name, readable body copy, and one accent
  rule. Set a clear type scale with no more than two type families. Body text
  is sentence case, never a wall of all caps. Text reveal can be skipped with
  one tap, and the next tap must advance rather than repeat the line.
- Quest markers use one shape family with clear variants for main objective,
  side objective, turn-in, and nearby interaction. A marker includes a short
  label at close range and an edge pin at long range. Do not place a marker on
  every NPC or collectible at once.
- Quest cards show objective, location, reward category, and current state in
  that order. Keep reward claims specific and original. Progress persists in a
  compact log that reads like the world map and tile art, not a raw debug list.

### Palette shifts and menu-heavy screens

- Towns use warm, welcoming midtones with painted signs, cloth, and wood
  accents. Wilds use broader greens, earth colors, and open sky contrast.
  Dungeons shift cooler or darker with stone, mineral, and danger accents.
  These shifts should be clear at a glance while party and enemy silhouettes,
  health bars, and quest markers keep their fixed contrast rules.
- Transition between town, wilds, and dungeon with a tinted overlay or short
  tile-aware wipe. Do not darken the playfield so far that the HUD becomes the
  brightest object during normal exploration.
- Menu-heavy screens retain the lane look through pixel-grid spacing, tile
  motifs, crisp borders, and the current area accent. Use a dimmed game view
  behind the panel rather than replacing the world with a generic blank
  screen. Panels are rounded or stepped consistently within one title.
- Keep one primary action per panel and align stat columns. Equipment and
  party screens show portrait, role, current value, change, and comparison in
  that order. Use small rarity bands or icons, never a rainbow of competing
  gradients. Avoid raw stat dumps and nested full-screen dialogs.
- Idle and collection screens still feature one hero, creature, or location
  at a time. Surface collect, equip, journal, and details as explicit tabs or
  buttons. Progress, drop tables, and timers are labeled honestly and remain
  legible without animation.

### Per-title emphasis

- Aetherfall and Starweft: ATB party rail, command verbs, and elemental or
  orb effects must stay legible during menu-heavy battles.
- Skyshard Vale: switchable party portraits and elemental combo marks must
  read over open wilds without turning every enemy into a glowing target.
- Mythweave, Wayfarer Courts, and Thornmark: turn, pet, quest, and field-spawn
  information uses the same portrait and status grammar across story and
  combat screens.
- Gravemarch: idle earnings, gear doors, dodge prompts, and drop tables use
  restrained feedback so active dodge remains the visual priority.
- Corridor Crawl: roguelike room states, enemy intent, and run resources use
  high-contrast marks that survive dungeon palette shifts.
- Fieldnotes Safari: collection rarity and capture state use silhouette,
  pattern, and label support, with discovery markers kept separate from
  combat or traversal markers.
