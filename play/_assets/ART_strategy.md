# AAA Art Bible - Strategy 2D lane (Rev 1, 2026-08-06)

Titles: Bulwark, Siegebreak, Frosthold, Towerline Duel, Bastionworks,
Ridgeline Rumble, Verge Protocol, Warring Banners, Emberline Outpost.
Engine: Phaser 3 (vendored). This is the CLARITY lane: every frame must make
ownership, intent, danger, and the next useful command legible at 390px.

## Look

Premium stylized 2D strategy, not a spreadsheet and not a flat greybox. The
camera is an orthographic tactical view with a readable playfield, layered
silhouettes, restrained texture, and deliberate accents on things the player
can command or must avoid. Use Kenney CC0 packs from
`/Users/lucille/worker-archive/studio-assets/web2d` as source vocabulary,
especially tiny-town, tiny-dungeon, top-down-tanks-redux, ui-pack, and
particle-pack material. Recolor, crop, combine, and supplement with
procedural Phaser shapes so each title has original IP. Curated shipped files
still live under `/play/_assets/` or the title asset directory and are recorded
in the asset ledger and `LICENSES.md`.

The world is quiet enough for tactics. Saturation and motion belong first to
commandable units, threats, telegraphs, and rewards. Terrain can be rich, but
it must not compete with a red enemy marker or a cyan player order. Preserve
the house rule that visual code reads public sim state and never writes it.
Use palette swaps, procedural decals, simple masks, and pooled primitives
before reaching for a shader or a large sprite sheet. No primitive-gray
placeholder is allowed in a shipped frame, and no title borrows a recognizable
faction, character, crest, or UI treatment from an existing game.

### Faction palette discipline

At 390px, faction identity is carried by three channels at once: hue family,
value contrast, and shape language. Player forces use azure and electric teal
accents (`#43C7F4`, `#3864E8`, warm white highlights). Enemy forces use ember
coral and wine accents (`#FF665C`, `#B72E4D`, pale hot highlights). Neutral,
unclaimed, and world objects use desaturated slate, bone, moss, and amber
(`#718092`, `#D8C38C`, `#788B5A`, `#E0A34A`). Amber is a warning and objective
color, never a third team.

Team color is repeated on unit trim, selection ring, attack tracer, health-bar
cap, and command icon. A unit also receives a faction notch, banner, eye slit,
or outline pattern so red versus teal is never the only read. Biome colors are
lower saturation than faction colors and may not use the player cyan or enemy
coral as a dominant ground color. The selected object gets a white outer key,
not a new team color. Check faction readability in a 390px crop before adding
detail.

| Do | Don't |
| --- | --- |
| Do use cyan plus a bright top notch plus a square-ended friendly ring for player units. | Don't make ownership depend on red versus green or on a one-pixel tint. |
| Do reserve coral for enemies, enemy intent, and enemy-owned structures. | Don't paint an entire biome coral because the battle is happening there. |
| Do give neutral buildings bone or slate bodies with an amber objective marker until claimed. | Don't recolor a neutral object instantly without a claim pulse, icon, or shape change. |

### Unit silhouette tiers

Silhouette wins before texture. At normal phone scale, a grunt should read as
one compact mass, an elite as a mass with one strong asymmetry, a hero as a
vertical focal shape, and a structure as a stable footprint with a readable
top profile. The tier is visible in scale, negative space, and motion, not
only in a tiny rank badge.

- **Grunt:** 16-24px visual height in the gameplay camera, one body mass, one
  primary tool or weapon, one team notch. Use the broadest count and the
  simplest animation.
- **Elite:** 1.25-1.5x grunt height, one shoulder, crest, shield, or weapon
  offset, plus a double-rim base or longer shadow. Elites get a distinct hit
  reaction and a stronger telegraph.
- **Hero:** 1.7-2x grunt height, clear head and torso separation, two
  asymmetrical identifiers, a team-colored base ring, and an ability-ready
  accent. A hero must remain identifiable while surrounded by eight grunts.
- **Structure:** 2-3x grunt footprint, an anchored base, a vertical marker,
  and a clear attack-facing direction. Walls and towers must not collapse
  into the same silhouette as units.

Use Kenney character, tank, town, and dungeon forms as proportions only. Add
procedural banners, rings, weapon arcs, and emissive marks to make original
rosters. Do not solve crowd readability with oversized nameplates. At most one
short unit label appears above a hero or selected elite; health bars belong
below the silhouette and disappear at full health unless the unit is selected.

| Do | Don't |
| --- | --- |
| Do give each tier one readable shape change before adding surface detail. | Don't distinguish an elite from a grunt only with a tiny star or a darker texture. |
| Do keep a hero's head, weapon, and base ring visible when nearby units overlap. | Don't let a hero's cape, glow, or nameplate cover the enemy telegraph beneath it. |
| Do draw structures with a grounded footprint and a facing cap. | Don't use a free-floating circular icon as the only visual for a tower or wall. |

### Range, telegraph, and AoE language

Range is a promise. It is shown only when relevant: selected unit range uses a
thin player-color ring or sector, an enemy range uses a thin coral dotted
ring, and a structure's facing uses a wedge or lane strip. The idle battlefield
does not become a nest of circles. On touch, the first tap selects and reveals
range; the second tap confirms a command or placement.

Threat telegraphs use a neutral danger language that survives faction swaps:
amber edge pulses for imminent action, white or pale violet for charge and
ability ownership, and a dark filled center for a blocked or occupied area.
The telegraph sequence is anticipation at 0.8-1.2s, two edge pulses, a brief
contact accent, then a scale-faded decal. Procedural ground decals have three
parts: a low-alpha floor wash, a crisp perimeter, and a directional glyph or
hatch. A safe area must be visually quieter than the danger edge.

Use circles for radial attacks, wedges for facing attacks, lanes for charges
and projectiles, and linked hex outlines for board effects. A ground decal is
at least 2px at 390px, its perimeter remains readable over a busy floor, and
its interior never hides the unit that caused it. AoE overlap is shown by
stacked opacity and a single combined edge, not by adding a new color for
every overlap. A cancelled telegraph contracts and fades rather than vanishing
so the player understands the interruption.

| Do | Don't |
| --- | --- |
| Do show the attack shape, facing, and remaining charge time in one decal. | Don't flash a generic red circle after damage and call it a telegraph. |
| Do dim the safe floor and keep the danger perimeter crisp. | Don't make the warning so bright that the target unit disappears inside it. |
| Do use the same circle, wedge, lane, and hex grammar across all nine titles. | Don't invent a new marker shape for every hero ability. |

### Battlefield versus UI layering

The battlefield is the source of truth; the UI names, filters, and confirms
what the battlefield is already showing. Phaser display order is explicit:

1. `terrain`: ground, transition tiles, water, fog base, and landmarks.
2. `decals`: move previews, ranges, AoE, path arrows, and placement ghosts.
3. `units`: structures first, then units by footprint depth, then selected
   outline and health bars.
4. `combat-fx`: projectiles, trails, hit bursts, overhead status icons, and
   short-lived damage numbers.
5. `command-ui`: action tray, card hand, resource bars, objective strip, and
   touch prompts.
6. `shell-ui`: pause, settings, rotate overlay, banners, and accessibility
   controls through GGKit.

The command UI type system has three levels. `COMMAND` is 12-14px uppercase
with strong contrast for verbs such as MOVE, PLACE, RAID, and HOLD.
`VALUE` is 16-20px semibold for costs, health, wave count, and timers.
`TITLE` is 22-28px bold for an objective or a short victory statement. Use
one display face plus the system fallback, with fixed tracking and line
heights. Every primary touch target is at least 44px; the visual icon can be
smaller inside the hit target.

Cards use a dark translucent body, a 1px player-color top rule, a strong icon
silhouette, a cost chip in the upper corner, and one short effect line. A
card in hand is not a menu button: it has a lifted shadow, drag state, and
destination ghost. Buttons use filled player blue for the primary command,
slate for neutral actions, amber for warnings, and coral only for hostile or
destructive actions. Press is a 0.96 scale with a one-beat spring recovery.
Never cover a live telegraph with a card, modal, or floating text block.

| Do | Don't |
| --- | --- |
| Do put a placement ghost on the decal layer and its confirm action in the command tray. | Don't paint a second, conflicting range preview inside the button. |
| Do use a stable bottom command rail with 44px targets and a safe-area inset. | Don't scatter tiny controls over the battlefield where they look like props. |
| Do make cards communicate cost, role, and effect before the drag begins. | Don't use raw debug text, browser-default buttons, or card art with no gameplay affordance. |

### Fog and threat visualization

Fog of war is a cool charcoal veil at 55-75% opacity with a soft feathered
edge. It obscures information without producing black holes. Revealed zones
retain a faint boundary shimmer for 0.25s after the reveal, then settle into
the biome palette. Unknown threats are neutral silhouettes or question marks;
they become enemy coral only when identified by the sim. Do not reveal a
hidden enemy through its full-color VFX.

Threat is visible in three scales. The top objective strip gives wave or
campaign pressure. The board gives route arrows, spawn rims, danger sectors,
and a compact threat meter at a path junction. The screen edge gives one
directional amber wedge when an off-screen threat is relevant. Threat markers
use pulse frequency to communicate time, not more saturation: slow pulse means
watch, fast pulse means act now. The map remains playable when several markers
are active by collapsing nearby warnings into one route badge.

| Do | Don't |
| --- | --- |
| Do feather fog edges and reveal a short route history after a scout action. | Don't use an opaque black mask that hides the place the player just explored. |
| Do combine nearby threats into one readable route badge with a count. | Don't stamp a red arrow on every enemy and turn the board into warning confetti. |
| Do keep an unidentified contact neutral until the sim confirms its faction. | Don't leak a hidden enemy's team color through its silhouette, projectile, or damage number. |

## Feel (gate-checked)

All motion follows `ART_DIRECTION.md`: anticipation, contact accent,
follow-through; eased UI; one visible overshoot; camera shake at most one
concurrent effect and no more than 2% of view height; render-side hit-stop of
40-70ms for standard hits and 120ms maximum for kills or bosses. Cosmetic
clocks may pause for hit-stop, but the sim accumulator and deterministic
replay never pause or skip. Every flash, shake, and strong contrast effect is
behind the GGKit juice and Reduced Motion controls.

### VFX escalation ladder

Strategy games need juice that confirms decisions without turning the board
into an arcade screen. Escalation is based on event importance and spatial
area, not on random noise:

| Event | Readable beats | Budget |
| --- | --- | --- |
| Command or placement | ghost snap, ring tick, small dust or construction spark | 2-4 pooled particles, no shake |
| Standard hit | anticipation notch, white contact flash, 2-4 directional sparks, one spring recoil | 40-70ms cosmetic stop, no more than one small shake |
| Kill | target flash, 6-10 shards or embers, short score or resource tick, corpse fade | 50-70ms stop, one brief ring, no camera cut |
| Elite or structure break | distinct silhouette flash, 12-20 debris pieces, ground ring, heavy follow-through | 80-120ms stop, one budgeted shake, stronger audio accent |
| Wave clear | path sweep, resource burst, banner slide, three staggered reward pops | 20-40 pooled particles total, no full-screen white flash |
| Ultimate or hero combo | 0.25-0.4s anticipation, directional charge, readable impact plane, lingering afterglow | 20-32 pooled particles, 80-120ms stop, no overlapping camera shakes |

Kills should make the player feel the tactical consequence. Waves should make
the board feel relieved. Ultimates may own the frame for one beat, but they
must return control quickly. Use procedural additive ribbons, rings, shards,
soft circles, and scale-faded emissive primitives. Kenney particle-pack
sprites may be used only when they pass the same pool and payload budget.

| Do | Don't |
| --- | --- |
| Do reserve the largest contrast, ring, and sound stack for a kill, wave, or ultimate. | Don't spend the boss budget on every grunt hit. |
| Do let an ultimate travel from source to target so cause and consequence remain legible. | Don't fill the entire board with a full-screen flash that erases unit positions. |
| Do disable or reduce hit-stop, shake, and flash through the accessibility setting. | Don't let Reduced Motion change sim timing, damage, or deterministic outcomes. |

### Animation-state floor and player entity interpretation

Gate 1 requires the player entity to ship with at least three readable
animation states. Strategy titles cannot satisfy that gate with a static
cursor. Every title has a visible player proxy, even when the player is a
commander rather than a frontline fighter. The floor is **four states for
combat units**: idle or breathe, move or reposition, attack or command, and
hurt or defeat. Structures add active, damaged, and destroyed states. The
floor for the player proxy is **three states minimum**: idle, command or drag,
and resolve or impact. A fourth victory or defeat state is preferred.

The player proxy is interpreted by title: Bulwark uses a lane engineer beacon;
Siegebreak uses a banner-bearing siege captain; Frosthold uses a warm scout
drone moving between settlement tasks; Towerline Duel uses a living command
crest that animates while cards are held; Bastionworks uses a builder standard
and raid cursor; Ridgeline Rumble uses the chosen hero; Verge Protocol uses a
field operator; Warring Banners uses a campaign standard token; Emberline
Outpost uses a dispatch operator with a glowing radio pack. These are original
visual identities, not licensed character stand-ins.

Procedural animation is enough: two-frame idle breathing, four-step movement,
one anticipation pose, a contact squash, a recoil or knockback, and a fade or
collapse. Use phase offsets so units do not march in lockstep. Animation is
render-side and event-driven from sim edges such as command accepted, HP
delta, target acquired, wave started, and structure destroyed.

| Do | Don't |
| --- | --- |
| Do show idle, command, and resolve states on the player proxy in the first playable minute. | Don't call a static arrow or camera pan the player's animation set. |
| Do give units a clear anticipation pose before attack and a follow-through after contact. | Don't snap every unit between two bitmap poses with no contact or recovery beat. |
| Do use phase offsets and one secondary motion per object class. | Don't make an entire wave breathe, bob, and flash in exact synchrony. |

### Particle-system floor

The strategy lane ships with **four pooled particle systems per title as the
minimum**: contact sparks, dust or debris, projectile or command trails, and
wave or ability bursts. Hero-heavy titles should reach six by splitting
construction feedback and environmental ambience, but four is the gate floor
and not four one-off sprites. Start each system with a pool of 12 and scale to
16 where evidence proves it is needed. Keep the combined active primitive
budget at 96 unless a measured gate pass approves a lower-cost profile.

All systems use pooled Phaser particles or pooled geometric primitives, a
shared unlit-emissive material or lightweight Canvas blend, ballistic or
spring motion, and scale-fade to zero before recycle. No Niagara, no runtime
network fetch, no editor-authored particle asset, and no per-event allocation
in the hot path. Card battler ability bursts use the same system as projectile
trails, with a card-shaped glyph or ribbon rather than a new emitter.

| Do | Don't |
| --- | --- |
| Do name and count four persistent pooled systems in the title's art checklist. | Don't claim the floor is met because four decorative dots were drawn in one burst. |
| Do recycle particles after scale-fade and share the emissive material. | Don't allocate a new texture, emitter, or array for every hit. |
| Do add a fifth or sixth system only when it improves a distinct read. | Don't add ambient confetti that competes with a range ring or costs the 60fps gate. |

### Map and biome dressing

Every arena must read as a place before the first unit moves. Build the frame
in three layers: a base terrain family, a route and elevation layer, and
three to five landmarks that explain the setting. Functional props get a
clear interaction state; decorative props get one small secondary motion, not
constant noise. Terrain transitions use edge tiles or procedural masks, never
hard unmotivated color seams. The active route remains the cleanest strip of
the map, while boundary spaces can carry texture and silhouette.

Use a shared 16px or 24px logical grid and scale crisply at 3x-4x on phones.
Biome dressing is low-saturation and uses repeated material motifs: stone
seams, snow ridges, wooden braces, cracked asphalt, hex grass, or industrial
plates. Landmark silhouettes should survive a squint test and should appear
at spawn, objective, and end-of-route locations. Water, smoke, banners,
falling snow, steam, or fire provide the one ambient motion signature that
makes a place feel alive.

| Do | Don't |
| --- | --- |
| Do give each arena a base material, a route material, and three recognizable landmarks. | Don't ship a colored grid with units placed on top and call it a battlefield. |
| Do make terrain transitions explain cliffs, roads, walls, and buildable space. | Don't use decorative props that look like valid placement cells or blocked paths. |
| Do keep biome saturation below faction accents and add one restrained ambient motion. | Don't let snow, smoke, water, or foliage animate across the whole board at once. |

## Audio

Each title uses a tactical music bed plus a danger or victory layer, with
music crossfades through `ggkit.audio`. Ship at least eight distinct SFX per
title through the GGKit buses: select, confirm, cancel, place, move, attack,
hit, kill, warning, wave clear, ability, and victory are the reference set.
Files are mp3 or m4a only in the shipped game. Touch must unlock audio, and
mute and volume settings persist through GGKit.

Audio mirrors the visual hierarchy. A command click is short and dry, a
placed structure has a pitched material thunk, a kill has a directional
contact accent, an incoming wave has a low warning pulse, and a wave clear
opens the music rather than adding constant noise. Never use sound to reveal
information that the visual layer intentionally hides.

| Do | Don't |
| --- | --- |
| Do give select, confirm, cancel, and place different short sounds so touch intent is obvious. | Don't use the same click for every UI action and every battlefield event. |
| Do layer a danger stem when the threat meter crosses a threshold. | Don't leave the danger stem running from title screen through victory. |
| Do make kill and wave-clear accents punch through at safe mobile volume. | Don't use clipping, a constant alarm, or an unlicensed music cue as a shortcut to excitement. |

## Per-title notes

- **Bulwark:** Lane tower defense and maze-building. Read the board as a
  fortified canal district with modular stone, timber gates, and one clean
  enemy approach. Player cyan marks buildable and owned lanes; enemy coral
  marks the advancing route; neutral amber marks open maze sockets. Towers
  get tall caps and directional barrels so the maze does not become a field
  of identical dots.
- **Siegebreak:** Fantasy siege defense with hero combos. Use a mossy cliff
  fortress, canvas banners, broken bridge spans, and warm breach fire. Keep
  the captain hero vertically dominant and let combo links travel as bright
  ribbons between heroes and target points. The walls should feel heavy before
  they crack.
- **Frosthold:** Survival 4X settlement with no build timers. Use a frozen
  settlement ring, snow-packed routes, blue dusk, and a furnace orange center.
  Survivor silhouettes stay warm bone and player teal; raiders are ember
  coral against the snow. Heat is shown as a soft local glow and steam, never
  as a red wash over the whole map.
- **Towerline Duel:** Lane card battler and full deckbuilder. The arena is a
  compact two-lane training citadel with strong rails, tower crowns, and a
  readable center seam. Cards use a dark glass body, one role glyph, a cost
  chip, and a faction top rule. Unit cards enter with a brief drop shadow and
  lane landing ring, not a full-screen summon animation.
- **Bastionworks:** Build-and-raid base. Use a sunbaked brick village with
  roads, walls, mines, storage yards, and three distant landmark silhouettes.
  Build placement is the hero interaction: ghost tint, snap, construction
  sparks, dust, and a satisfying material thunk. Raid targets use neutral
  bone until scouted, then enemy coral with readable wall levels.
- **Ridgeline Rumble:** Single-lane MOBA 3v3. Make a cliffside lane with a
  ridge wall, a shallow river cut, brush pockets, two tower silhouettes, and a
  clear home-to-enemy gradient. The selected hero owns the visual center; bot
  allies use the same player cyan but lighter labels; enemies use coral plus
  role glyphs. Keep the lane clear enough for skill wedges and retreat paths.
- **Verge Protocol:** Zombie tower defense with a steerable field operator.
  Dress the place as an original floodlit quarantine district: barricades,
  dead storefronts, utility poles, and a supply depot. Infected enemies use
  pale bone bodies with coral wound accents so the horde is readable without
  turning the entire map red. The operator's radio pack and route marker are
  always visible during turret placement.
- **Warring Banners:** Hex campaign strategy. Use a seasonal valley map with
  rice terraces, wooded ridges, stone passes, supply roads, and three faction
  banner poles. Hexes use low-contrast terrain tiles and a single crisp
  ownership rim. Army composition is reinforced by silhouette and banner
  motif, never by text alone. Seasonal seed changes alter dressing accents,
  not the core readability grammar.
- **Emberline Outpost:** RTS-TD hybrid with a base layer. Use an industrial
  outpost on a volcanic ridge: rail segments, cooling pipes, ash fields,
  warm work lights, and a distant red horizon. Operators are distinct from
  structures by having locomotion and a visible command beacon. Facing and
  range must be clear on the grid before any industrial texture is added.

| Do | Don't |
| --- | --- |
| Do give every title one named landmark family that can be recognized in a 390px screenshot. | Don't recolor the same generic arena nine times and call the palette a new identity. |
| Do preserve the shared faction grammar while changing biome materials, props, and ambient motion. | Don't change the meaning of cyan, coral, amber, or the command ring from title to title. |
| Do use original names, silhouettes, crests, card text, and procedural combinations. | Don't imitate a reference game's hero, faction, card frame, or signature icon. |

## Gate fit

- **Gate 1, ART:** no primitive-only frames; player proxy has at least three
  states; combat units have four; four pooled particle systems are the lane
  floor; faction colors and silhouette tiers are checked in a 390px crop; the
  after-shot must be non-black and above 64 distinct colors.
- **Gate 2, AUDIO:** music bed plus danger or victory layer, at least eight
  distinct SFX, GGKit buses, touch unlock, persistent mute and volume, mp3 or
  m4a only.
- **Gate 3, CONTENT:** the art grammar supports a tutorial, difficulty ramp,
  ten or more stages, and persistent progression without timer walls hiding
  missing content.
- **Gate 4, FEEL:** render-side juice follows the escalation ladder, remains
  within the 4x CPU-throttled 60fps trace, and honors Reduced Motion.
- **Gate 5, UX/PWA:** command rail, cards, safe-area insets, menus, loading,
  rotate overlay, and touch targets use the shared GGKit shell.
- **Gate 6, SHIP:** deployed evidence must show zero console errors, zero
  failed requests, valid payload and license records, and no em dashes in
  user-facing text.

| Do | Don't |
| --- | --- |
| Do validate strategy art in the deployed 390px evidence frame and in a live wave. | Don't approve a beautiful menu screenshot as proof that the battlefield reads. |
| Do measure pooled FX, frame time, payload, and audio format together. | Don't trade deterministic sim behavior or mobile performance for a larger effect. |
| Do record CC0 sources, original procedural additions, and title-specific decisions. | Don't ship an untraceable asset, a CDN dependency, or a licensed-looking stand-in. |

---

## RETINA LAW APPLIES (owner bar delta 2026-08-16)

"everything should be high resolution and more distinct colors no atari
looking nonsense it is for iphones make the tech shine"

See play/_assets/RETINA_LAW.md, which is MANDATORY and sits at the same
level as this bible. Headline: the fleet was measured on an emulated 3x
iPhone display and NOT ONE title rendered at native density (ratios of 1.0
to 2.0 against a device ratio of 3.0). Colour depth is already good fleet
wide; the defect is pixel density, and the upscale is what makes the art
look coarse. Render at min(devicePixelRatio, 3), bake textures at device
scale, keep text vector or device-scale baked, and do not pay for it in
frame time.
