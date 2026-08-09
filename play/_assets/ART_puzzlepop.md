# AAA Art Bible - Puzzle Pop lane (Rev 1, 2026-08-06)

Titles: Gridfall, Parlor Pop, Berry Cascade, Fizzlift, Chroma Tap, Reef
Tiles, Terrace Tales, Hearth & Halls, Dominion Keys, Kinetic Burst, Hivefall,
Runeline Depths, Driftwood Cove, Forgelock, Stacklock. Engine: Phaser 3
(vendored). One shared pooled particle engine is the lane foundation. House
motion language from ART_DIRECTION.md applies; this is the clarity-first
celebration lane. All art is original, procedural/generated, or from Kenney
CC0 packs at /Users/lucille/worker-archive/studio-assets/web2d. No licensed
characters, logos, trade dress, or lookalike text.

## Look

Bright, tactile puzzle objects on quiet, slightly dimensional boards. The
reference class is premium casual mobile puzzle art, not candy branding and
not a flat debug grid. Use chunky silhouettes, soft contact shadows, clean
edge highlights, and one secondary motion per interactive object class. A
board should look inviting before it moves, then become spectacular only when
the player earns a cascade or goal.

- Kenney CC0 UI, shape, nature, furniture, and factory sheets are the base
  vocabulary. Recolor, crop, layer, and combine them into original objects;
  generated gradients, procedural particles, and simple vector shapes fill
  the gaps.
- Materials carry meaning: ceramic or painted wood for ordinary pieces,
  glass or enamel for special pieces, brass or stitched trim for goal/UI
  accents. Keep material contrast broad enough to survive 390px rendering.
- Use flat-shaded forms, low-frequency texture, and fake-lambert contact
  shading. No runtime lighting stack is needed. A tile needs one readable
  face, one edge, and one shadow, not a miniature illustration.
- Meta scenes use the same object grammar at a calmer pace: rooms are warm
  layered interiors, gardens are terraced dioramas, and aquariums are deep
  blue glass boxes with readable fish silhouettes. Every scene gets one hero
  object and two or three supporting layers.

Do / don't

- Do: give each tile family a strong silhouette, a controlled highlight, and
  one simple material cue. Don't: fill a tile with tiny decorative detail.
- Do: recolor Kenney parts into a title-specific kit and add procedural
  accents. Don't: ship a raw pack sheet or a mixed pack collage as the art
  direction.
- Do: reserve the loudest contrast for the playable board and the current
  goal. Don't: let wallpaper, room props, or meta confetti compete with the
  board state.

## Palette system

The board palette is dark-to-mid value and high contrast so pieces separate
from the playfield. The meta palette is warm, airy, and lower contrast so
restoration reads as a place rather than another puzzle board. Semantic color
is stable inside a title even when a title-specific palette variant is used.

Board tokens, default values:

- Ink: #182238 for outlines, deep labels, and selected-state backing.
- Board: #243453 for the outer playfield and dark goal strips.
- Cell: #314567 for empty cells; Cell edge: #5D7294 for the grid rhythm.
- Highlight: #F7FBFF for selection rings, glyphs, and positive edge accents.
- Berry coral: #F25C68 with a round seed symbol.
- Sun yellow: #F7C948 with a four-point sun symbol.
- Leaf green: #5BCB77 with a leaf symbol.
- Tide blue: #38A8DE with a droplet symbol.
- Plum violet: #9A7CF3 with a six-sided star symbol.
- Ember orange: #F29A4A with a square flame symbol.

The six piece families are never distinguished by hue alone. Symbols are
large, centered, and filled with Highlight or Ink according to contrast. The
semantic names may be remapped per title, but the value ordering and symbol
contrast must remain clear. Never use red versus green as the only meaning.
Run a deuteranopia, protanopia, and tritanopia preview before a title review.
Target at least 3:1 contrast between a piece glyph and its face, and 4.5:1
for gameplay-critical UI text.

Meta tokens, default values: Paper #FFF8EE, Ink #2B2D42, Wood #A86F4C,
Leaf #4F9D69, Water #5DB7D8, Brass #F3BC50, Coral #EC6B62, and Shadow
#D9C9B5. A meta reward repeats the board piece accent in a ribbon, spark, or
object inset so the board and scene feel like one authored world.

Do / don't

- Do: pair every hue with a shape, symbol, and value difference. Don't: make
  a colorblind player infer a match from hue alone.
- Do: keep board colors saturated against Ink and Board. Don't: apply the
  soft Paper meta palette directly under active pieces.
- Do: use color simulation and grayscale checks during asset review. Don't:
  approve a palette because it looks distinct only on the art director's
  display.

## Puzzle readability at 390px

The 390px portrait frame is the primary art gate. An 8x8 board occupies
roughly 320 to 336px including its inner breathing room, with 36 to 40px
visual cells and a full-cell touch target. A piece's silhouette and primary
symbol occupy 60 to 72 percent of its cell. The symbol remains at least
14px tall at 390px. Decorative texture is optional and never carries state.

Every tile or piece uses triple-coding:

1. Silhouette: the outer shape, corner treatment, or special-piece geometry
   changes between families and between ordinary and powered pieces.
2. Color and value: the semantic accent has a contrasting face and edge, with
   no two adjacent families relying on equal luminance.
3. Symbol or pattern: a centered glyph, stripe, dot, notch, or directional
   mark repeats the family meaning in a way that survives grayscale.

Match previews, legal placement ghosts, blocked cells, goal objects, and
selected cells use outlines or patterns in addition to color. The selector
must remain visible over a full cascade. Never put a decorative particle on
top of a goal glyph for longer than the feedback beat. For dragged pieces,
show a solid ghost at the proposed landing cell and a short Invalid label or
cross hatch when the placement is not legal.

Do / don't

- Do: test the full board at 390px with the device frame and safe-area inset.
  Don't: judge readability from a zoomed desktop canvas.
- Do: make special pieces broader, brighter, and symbol-marked than normal
  pieces. Don't: signal a special by a tiny sparkle hidden inside its tile.
- Do: preserve a clear focus ring, ghost, or hatch through resolution. Don't:
  rely on motion blur, sound, or color flashing to explain the move.

## Board frame and background treatment

The board is an object in the scene, not a raw rectangle. Use a rounded frame
with 12 to 18px outer radius, 8 to 12px inner padding, a quiet contact shadow,
and a one-pixel highlight edge. The frame material should establish the title:
velvet and brass for Parlor Pop, terracotta and painted iron for Terrace
Tales, coral and glass for Reef Tiles, warm wood and linen for Hearth & Halls,
slate and brass for Runeline Depths, and enamel steel for Forgelock.

The cell field stays visually calm. A procedural two-value gradient, a faint
paper grain, or a slow corner vignette is enough. Keep decorative shapes
outside the cell masks. Empty cells have a repeatable visual rhythm so the
eye can parse rows, columns, paths, and obstacles immediately. The board may
float above a low-contrast scene background, but the goal strip, move count,
and next-hand preview must sit on opaque UI cards.

Use a single board frame per title, then vary the inner material and goal
badge across chapters. The frame can breathe on a major combo, but its shape
must never deform enough to change the perceived grid geometry.

Do / don't

- Do: use an opaque, softly shadowed board frame with a clean cell mask.
  Don't: place vines, bubbles, smoke, or furniture behind active cells.
- Do: let the frame material connect to the title's meta scene. Don't: add a
  different ornamental border for every level with no world logic.
- Do: keep grid lines and goal strips legible under all board backgrounds.
  Don't: use a busy wallpaper, high-frequency noise, or an animated texture
  that competes with a falling or dragged piece.

## Meta scenes and board linkage

Meta scenes are earned places, not menus. A room uses three readable layers:
back wall or window, floor and large furniture, then hero object and props.
Restoration changes one authored object at a time and keeps the before state
visible in the progression map. A garden uses a foreground terrace, a middle
planting bed, and a distant sky or wall. Use a slow leaf sway, water shimmer,
or bird shadow as the one ambient motion per prop class.

An aquarium uses a glass tank frame, a dark-to-blue depth gradient, broad
plant silhouettes, and fish with two-frame tail motion plus a sine drift.
Refraction is a translucent procedural ribbon, not a heavy shader. Fish react
to placed objects with a short approach, circle, or hide state. Their motion
stays calm while a reward is being read.

The visual link from board to meta follows a simple chain: board goal icon,
reward token, transition ribbon, placed object, then scene reaction. A match
of the semantic board accent pays for the same accent in the room, garden, or
tank. A successful level can send a single piece-shaped spark through the
reward card into the meta object. Do not teleport a large collection of
unrelated currencies into the scene.

Rooms, gardens, and aquariums need at least three visible restoration steps
per title branch. A choice variant must change color, silhouette, or layout,
not only a text label. The meta camera is a gentle pan or 2.5D parallax move;
it never uses the board's high-frequency shake language.

Do / don't

- Do: make a board goal reappear as a concrete restored object or living
  response. Don't: pay the player with an abstract counter that never changes
  the scene.
- Do: use three depth layers, one hero prop, and restrained ambient motion.
  Don't: turn a room, garden, or aquarium into another noisy gameplay board.
- Do: preserve chosen furniture, plant, or tank variants in the saved meta
  state. Don't: offer cosmetic choices that reset after the next level.

## Feel (gate-checked)

Puzzle motion follows the house three-beat language: anticipation on a legal
selection or preview, contact accent on the clear or placement, then a
spring-damped follow-through with one visible overshoot. UI slides use ease-out
cubic. Celebratory pops use ease-out back. Board pieces use a short underdamped
spring rather than a raw linear lerp. Cosmetic motion reads sim events by
edge and never writes puzzle state.

Clear, cascade, and combo escalation ladder:

- Single clear or legal placement: one 40 to 70ms contact accent, 1.08x tile
  pop, two to four fragments, and a small score tick. No camera shake.
- Cascade: each landing gets a 1.04x settle pop, a short directional streak,
  and a staggered chime. A shared 40ms view-side hit-stop can hold the board
  once for the resolution batch, never once per tile.
- Combo of 2 to 3 clears: add a board-rim ring, a score-chip pop, three to six
  colored particles, and a frame nudge up to 0.6 percent of view height.
- Combo of 4 or more, special-piece chain, or obstacle goal: add a board-wide
  sweep, a short mascot or selector celebration state, and a nudge up to 1.2
  percent of view height. Hit-stop may reach 70ms.
- Level goal, final objective, or chapter unlock: reserve the hero fanfare for
  this beat. Use a 0.25s reward ribbon into the result card, a 100 to 120ms
  cosmetic hold, and a controlled confetti burst. Never spend this treatment
  on an ordinary three-piece clear.

The floor is 3 pooled particle systems per title, all driven by the shared
Phaser particle engine: clear fragments, movement or cascade streaks, and
reward celebration. Each system uses a 10 to 16 item pool, scale-fades to zero,
and hides dead items. A title may add a fourth system for bubbles, factory
debris, or orb trails, but never by allocating a new burst every frame.

### Board player entity and animation states

For Gate 1, a puzzle player's entity is the visible agency marker, not a
humanoid. A selector, cursor, drag ghost, or recurring mascot counts when it
has authored visual states and clear transitions. Every title must ship at
least three of these states and show them in the review evidence:

- Ready: selector or cursor breathes at 1.0x to 1.04x, with a persistent
  focus ring and a neutral pose.
- Preview: legal drag or swap changes the ghost silhouette and directional
  arrow; invalid preview changes to a cross hatch or amber outline.
- Resolve: accepted action gives the selector a short lean, snap, or mascot
  pose before returning to Ready after the cascade.

Optional fourth and fifth states are Goal, Streak, and Invalid. A highlight
that only changes color without a state-specific pose, transform, or outline
does not count as an animation state. A static cursor plus moving board tiles
does not count as a player entity. The state machine is view-only and must
remain deterministic with cosmetic random streams.

Do / don't

- Do: reserve the strongest reaction for the accepted move, cascade tier, and
  goal. Don't: make every tile pulse with equal intensity.
- Do: use one board-wide frame nudge at most, with amplitude capped at 2
  percent of view height and one concurrent shake. Don't: shake the camera on
  every tap or every falling tile.
- Do: make Ready, Preview, and Resolve visibly distinct, then show them in
  Gate 1 evidence. Don't: claim three states from three frame exports of the
  same idle cursor.

## Juice budget and accessibility

The default juice budget is dense at the point of agency and sparse behind
the board. Every tap gets a 0.96x press state and an ease-out release pop.
Accepted placement gets one spring settle. A normal clear gets one contact
accent. Only combo tiers and goals get board-rim movement, hit-stop, or
confetti. Keep one concurrent shake, amplitude at or below 2 percent of view
height, and use 40 to 70ms standard hit-stop with 120ms as an absolute hero
ceiling. The sim clock never pauses for these effects.

Route all shake, hit-stop, repeated overshoot, full-screen flash, zoom kick,
and confetti through `ggkit.juice.enabled`. When the accessibility toggle is
off, preserve selection outlines, ghost placement, symbol cues, score and
goal updates, readable fades, and the Ready, Preview, Resolve states. Remove
camera or frame shake, white flashes, repeated scale overshoot, forced zoom,
and high-density confetti. Reduced motion must not remove puzzle information.

Use `prefers-reduced-motion` as the initial preference, then allow the GGKit
settings shell to override it. Touch targets remain at least 44px even when
the art cell is smaller. Avoid auto-pan, parallax, or a moving background
during a drag. The player should always know what is selected, what will
happen, and why a move is invalid.

Do / don't

- Do: keep focus rings, symbols, ghost pieces, state labels, and score ticks
  when juice is disabled. Don't: equate accessibility with hiding feedback.
- Do: put all high-energy effects behind `ggkit.juice.enabled` and one shared
  budget. Don't: let an individual title add a second unbounded shake path.
- Do: test a full cascade with reduced motion, color simulation, and a 390px
  frame. Don't: ship a setting that removes the only cue for a legal move or
  goal state.

## UI type system

Use a platform system stack so the lane has no font payload: `system-ui,
-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. The type system is
set, not browser-default. Display titles use 26 to 30px, weight 800, line
height 1.0 to 1.1. Section and result headings use 18 to 22px, weight 750.
Goal, move-count, and score chips use 14 to 16px, weight 750, with
tabular-nums. Body and instruction text uses 14 to 16px, weight 500 to 650,
with 1.25 line height. Never put gameplay-critical information in text below
12px. Micro labels are 12px only when repeated by an icon, color, or shape.

Use sentence case for instructions, title case for named rooms, and all caps
only for short score-chip labels. Keep score and move counters aligned on a
fixed digit width so they tick without layout jumps. Rounded cards inherit
the board frame material at a quieter value. Icons and text are paired for
goals, obstacles, settings, and accessibility controls.

The scale setting uses 1.0x, 1.15x, and 1.3x text presets. At 1.3x, cards wrap
and stack rather than clipping the board or pushing the primary action below
the safe area. The board remains the visual priority; result copy never
covers active cells.

Do / don't

- Do: use a measured size, weight, line height, and spacing scale in every
  title. Don't: rely on a browser default or a decorative font for legibility.
- Do: pair icon, label, and state color for goals and controls. Don't: encode
  an instruction with a color swatch alone.
- Do: let large text reflow at 1.3x inside the safe area. Don't: shrink
  gameplay text until it fits a fixed-width card.

## Audio

Music is light, loopable, and layered by state: one calm board loop plus a
brighter resolve or meta loop, or two complete tracks. SFX must be distinct
and routed through GGKit buses: tap, select, invalid, swap or place, clear,
cascade, combo, goal, reward, and UI confirm gives at least 10 useful cues.
Use short pitched marimba, glass, paper, wood, bubble, or enamel sounds from
original/generated sources and free CC0 material where licensed. Shipped
files are mp3 or m4a only, never ogg. Audio unlocks on first interaction and
mute/volume persists through GGKit.

Sound escalation mirrors the VFX ladder. A single clear is a dry tick or
pop. Cascades step upward in pitch without becoming a machine-gun. A combo
gets a chord or arpeggio, and a level goal gets the only long fanfare. Meta
scenes use quieter loops and leave room for fish, leaves, room creaks, or
factory belts.

Do / don't

- Do: give each action one identifiable cue and reserve layered music for
  meaningful streaks. Don't: use one loud sound for every tile in a cascade.
- Do: duck or soften the board loop during goal and reward fanfares. Don't:
  let a celebratory sting mask the next input or the result card.
- Do: transcode and ship mp3 or m4a through GGKit buses with persistent mute.
  Don't: ship ogg files or bypass the audio lifecycle.

## Per-title notes

- Gridfall: clean geometric paper and ceramic pieces on a graphite board;
  clear rows and columns with a ruler-straight sweep. The daily seed gets a
  small stamped badge, not a noisy calendar wall.
- Parlor Pop: velvet, brass, walnut, and warm window light. Each room repair
  should visibly move from worn to lived-in, with the board frame borrowing
  the room's trim.
- Berry Cascade: botanical berry families, leaf-shaped symbols, and a woven
  picnic-board frame. Cascades feel juicy through squash and droplets, not
  through candy wrappers or licensed confectionery cues.
- Fizzlift: cool glass, froth, and floating bubble outlines. Gravity inversion
  is shown by arrows, bubble trails, and a brief board tilt, never by rotating
  the whole phone frame.
- Chroma Tap: chunky painted blocks with chalk-edge symbols and rubbery
  collapse. The next-spawn preview is a quiet vertical dock with large group
  silhouettes.
- Reef Tiles: coral, pearl, and blue-glass board frame with fish silhouettes
  kept outside active cells. Pearls earned on the board become tank decor and
  a short fish approach reaction.
- Terrace Tales: terracotta planters, stone steps, and leaf-green accents.
  Three terrace layers make each restoration legible, with day and dusk as
  calm palette variants rather than board-darkening filters.
- Hearth & Halls: painted wood, linen, brass, and firelight. Fixture choices
  change the silhouette or layout of the room, and household reactions are
  small portrait or prop poses rather than dialogue walls.
- Dominion Keys: carved slate, warm brass pins, rope, and clear hazard
  silhouettes. A pin pull gets an anticipation line, contact notch, and safe
  result reveal; avoid generic medieval crest language.
- Kinetic Burst: dark indigo board, luminous orbit lines, and six fighters
  represented by original geometric badges. Ki types use a triangle plus
  symbol and value, never a franchise-like aura or character silhouette.
- Hivefall: amber comb cells, cool steel tools, and readable squad markers.
  A match sends a short authored strike toward the horde lane, linking board
  resolution to combat without covering the next move.
- Runeline Depths: slate tiles, mineral glows, and runes with a broad center
  stroke. Orb paths leave a single clean trail that fades before the next
  decision window.
- Driftwood Cove: weathered wood, tide blue, paper notes, and hand-painted
  map marks. Merged objects visibly advance from found scrap to cove fixture,
  and mystery notes use the same paper material as the board goal card.
- Forgelock: enamel steel, amber hazard stripes, and blue conveyor lights.
  Push-block faces need arrows and contact feet; belts animate slowly behind
  the puzzle so factory motion never obscures a solution.
- Stacklock: graphite, indigo, and hot amber line-clear accents. Falling
  pieces have unmistakable silhouettes and a clean lock-in flash; the sprint
  timer uses a calm ring and never borrows branded block-game iconography.

Do / don't

- Do: give every title one material kit, one board frame, and one meta motif
  that can be reused across its full content arc. Don't: make fifteen titles
  share the same fruit, jewel, or generic home-renovation kit.
- Do: let the named mechanic drive its VFX and prop motion, such as rising
  fizz, belt push, orb trace, or fish approach. Don't: add unrelated sparkle
  layers that hide the mechanic.
- Do: keep every character, room, badge, symbol, and phrase original or
  traceable to the permitted CC0 and procedural sources. Don't: imitate a
  competitor's mascot, logo, costume, board frame, or trade dress.

## Production and gate notes

Phaser canvas is the shipped view. Use the shared GGKit lifecycle, input,
settings, save, audio, loading, and juice contracts. View code reads sim edges
such as selection changes, valid placements, clear counts, goal completion,
and meta unlocks. It never writes sim state or reseeds sim RNG. Cosmetic
randomness uses a visual stream only. Particle pools, shape atlases, and
procedural gradients must keep the per-title payload within the AAA mobile
bar and leave no primitive-gray placeholder in a shipped frame.

Gate 1 evidence must show the board in an ordinary state, a legal Preview,
an accepted Resolve, and at least one cascade or goal tier at 390px. It must
also show the three player-entity states, the triple-coded piece set, the
three particle systems, and the reduced-motion result. The after-shot must
clear the non-black and greater-than-64-distinct-color assertions. Asset
credits and Kenney CC0 provenance belong in each title's LICENSES.md.

Six-gate cross-check: Gate 1 is the art, palette, player-state, particle, and
evidence bar defined above. Gate 2 is covered by the Audio section with two
music states and at least eight distinct SFX. Gate 3 requires enough board
chapters, goal variants, and persistent room, garden, aquarium, or factory
changes to support 20 minutes of play without a visual repeat wall. Gate 4
uses the 390px frame, reduced-motion path, house timing, and the 4x throttle
budget of the shared harness. Gate 5 keeps every board, result card, and meta
choice inside safe-area insets, with loading, pause, settings, and rotate
states supplied by GGKit. Gate 6 is verified against the deployed URL with
zero failed requests, the payload cap, and complete license records.

Do / don't

- Do: keep all art, VFX, and animation render-side and deterministic-safe.
  Don't: change puzzle constants, random seeds, or save values to make a
  screenshot look better.
- Do: reuse the shared particle engine and GGKit accessibility toggle. Don't:
  create a title-specific asset or effect path that bypasses the house budget.
- Do: capture before and after evidence at 390px and verify payload, requests,
  and license records. Don't: treat a desktop beauty shot as proof of the
  mobile gate.
