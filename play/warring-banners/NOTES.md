# Warring Banners

Controls: tap one of your banners to light its march range, tap a lit hex to move, tap a red ringed foe to read the full damage forecast, then tap it again to commit. Undo returns a banner to where it started as long as it has not struck. Tactic cards sit above the rail and each one is playable once per battle. Drag to pan, pinch or wheel to zoom, and End Turn hands the field to the enemy. Keyboard: arrows and WASD move the cursor, Enter or Space acts, Esc deselects, U undoes, T toggles the threat overlay, E or R ends the turn, F refits the camera, 1/2/3 play tactic cards, plus and minus zoom, M opens settings.

Goal: win the season. Twenty battles run across four provinces, from the river fords to the imperial gate, with four objective kinds: rout the enemy, hold marked ground when the clock runs out, escort the grain carts to the far road, or break the gates and take the keep. Spear beats cavalry, cavalry beats archers, archers beat spears. Forest and hills give cover, high ground adds weight to a strike, flanking stacks, rivers stop everyone but the fords, and a banner cut off from every friend fights weaker and starves. Victories unlock generals, tactic cards, and veterancy that carries into every later battle.

## AAA rebuild

Rebuilt from the prototype on 2026-08-13 as a Phaser 3 title on GGKit. The
prototype's four-warlord season sandbox became the tactical layer the brief
asked for: a twenty battle campaign, armies of six, zone of control, flanking,
height, a damage forecast with its modifier breakdown, undo before commit, and
an AI that focuses and flanks.

### Implemented

- **Files.** `index.html`, `engine.js` (pure simulation), `art.js` (procedural
  texture bakery), `game.js` (Phaser scene, render, input, HUD), `manifest.json`,
  `sw.js`, `icon.png`, `icon512.png`, `favicon.ico`, `assets/audio/*.mp3`,
  `LICENSES.md`. The prototype's `ai.js`, `audio.js`, `hex.js`, `main.js` and
  `render.js` are gone; their behaviour lives in `engine.js` and `game.js`.
- **Engine.** Axial pointy-top hexes, deterministic combat with no dice, zone of
  control, supply, objectives, weather, tactic cards, generals, save schema v3
  with strict validation plus a repair path.
- **Renderer.** Every board is baked into one canvas texture per battle, so the
  battlefield costs a single draw call. Overlays, unit bodies, icons, chrome and
  particles are all pre-baked textures blitted from pools. No `Graphics` object
  is created after the loading screen.
- **Tactical clarity.** Tap one: select and light the march range with a path
  preview. Tap two: read the forecast tray (damage, whether it breaks the
  banner, the answering blow, and up to five modifier chips). Tap three:
  commit. Undo is on the rail and on U. The eye button paints every hex the
  enemy can reach next turn.
- **AI.** One focus target per turn, then per banner a search over every
  reachable hex scoring expected damage, kill value, flank support, cover and
  incoming threat. It commits instead of trickling. The first province defends
  its ground so the opening teaches positioning; later provinces press. Killing
  the rival general breaks enemy morale for the rest of the battle.
- **Animation never blocks input.** The enemy turn is resolved in the sim and
  replayed as short animations; a tap skips straight to the end of the replay.
- **UI law.** One transient at a time (banner outranks toast outranks coach
  strip), centre banners only at battle start and battle end, corner chips for
  in play events, icons over labels, a thin fading tutorial strip, 44px plus
  touch targets, safe area insets from the page shell, no text under the thumb
  zones.

### Content

| Layer | Count |
| --- | --- |
| Campaign battles | 20 across 4 provinces |
| Authored maps | 12 (six also play mirrored, so 20 distinct layouts) |
| Objective kinds | 4 (rout, hold, escort, siege) |
| Weather states | 4 (clear, rain mud, snow, crosswind) |
| Unit classes | 5 pickable plus general, convoy, gatehouse, watchtower |
| Generals | 8, unlocked at 0/1/3/5/8/11/14/17 victories |
| Tactic cards | 8, unlocked at 0/1/3/5/8/11/14/17 victories |
| Skirmish setups | 6 maps x 4 odds |
| Difficulty | Captain (default) and Veteran, persisted |

A campaign battle runs six to fourteen turns, roughly two to four minutes, so
the season is about an hour before skirmish and roster experiments.

Persisted meta progression (GGKit save, schema v3, validated on load and
repaired rather than discarded when a field is wrong): victories, cleared
battle ids, army composition, chosen general, tutorial seen, best score, best
skirmish score. Veterancy is derived from victories: +2.5% health and +1.5%
strike per win, shown on the title and roster screens.

### Audio

Three looping music beds and fourteen distinct effects, all original
procedural renders, mp3 only, played through the GGKit buses.

- Music: `music-campaign` (menus), `music-battle` (fords and passes),
  `music-siege` (city and plain, and every siege objective).
- Effects: select, move, cancel, attack, arrow, hit, kill, heal, card, warn,
  endturn, claim, victory, defeat.

### Particles and animation

Six pooled systems share one array and one update pass: contact sparks, ground
dust, debris, command trails, reward bursts, and the weather bed (rain, snow,
wind grit, drifting leaves). Unit states are idle breathe, march, attack with
anticipation and follow through, hurt flash, and death fade. The player proxy
is a campaign standard with idle, command and victory states.

### Preserved prototype behaviour

- Pointy top axial hex geometry and the mulberry32 seeded RNG.
- The counter triangle: spear beats cavalry beats archers beats spear, at 1.50
  into the beaten class and 0.75 into the class that beats you.
- Terrain cover values: forest 1.35, hill 1.25, ford 0.85, keep and gate 1.90,
  rivers impassable except at fords, terrain move costs of 1 for open ground and
  2 for forest, hill, terrace and ford.
- The cut off rule: a banner with no friend within reach fights at 0.70 and
  loses 2 health at the start of its turn.
- Deterministic combat whose whole calculation is shown before committing.
- Drag to pan, pinch or wheel to zoom, End Turn on the bottom rail, keyboard
  cursor with Enter to act and Esc to deselect.
- Progress banked between runs, now as campaign victories and veterancy rather
  than a gold legacy.

### Deliberate changes from the prototype

- The four warlord season sandbox became the twenty battle campaign the brief
  specifies. Recruiting from a keep became the army composition screen with a
  per battle supply budget, which is also the difficulty ramp for the first
  province.
- Movement is per class rather than a flat two points, because zone of control
  and cavalry charges need the spread.
- A fallen general is a heavy blow rather than an instant defeat: the army
  fights at 0.85 and the tactic cards lock. Instant defeat made the AI's focus
  fire feel arbitrary in playtests.

### Known limitations

- The frame time gate could not be measured honestly on this machine: a
  control run of an already shipped title on the same box showed the same
  spikes, and even an unthrottled trace of a blank frame reported frames over
  33 ms, so the box was contended. Median frame time with the game rendering
  everything (threat overlay on, unit selected, weather running) sat at the
  vsync floor locally. The throttled trace belongs on an uncontended box
  against the deployed URL.
- Fog of war is not modelled. Every banner is visible from turn one, which is
  what the forecast first design wants.
- Skirmish scores are kept as a single best value rather than a table.

## Retina pass 2026-08-16

- Audit before ratio: 1.85x at the emulated DPR 3 landscape viewport, using the 1280 x 720 design box in a 693.33 x 390 shown fit box. Configured after ratio: 3.00x from `GGKit.hiDpi.factor(1280, 720)`, with a 2080 x 1170 backing store.
- Recipe: Phaser `Scale.FIT`, dense scale dimensions, `GGKit.renderDefaults`, `setZoom(f)` in WBScene, and a Phaser text factory that applies the matching resolution. The factor is 1.625 for this fit.
- Factor cap: none beyond GGKit's standard maximum of 3. No title-specific cap.
- Live canvas ratio and gameplay screenshot were unavailable because the browser backend was empty and the sandbox denied private HTTP listeners. The after ratio above is the configured geometry, not a live canvas read.
- Static title-local canvas art now uses `GGKit.hiDpi.canvas` and Phaser texture source resolution. Gameplay, balance, and content were unchanged.

## Release gate repair

2026-08-16, mobile release gate lane.

### PWA installability

The manifest declared only a 64x64 and a 512x512 icon, so it had no 192x192 and
was not installable. Added `icon192.png`, downscaled with LANCZOS from the
existing `icon512.png` master so the art is unchanged, and added the matching
manifest entry. `icon.png` (64x64) is now declared at its true size.

Verified with `node release_gate.mjs http://localhost:8347 1 <slug>` from
/Users/lucille/ue-port-studio/aaa/harness, serially at concurrency 1, against
`python3 -m http.server 8347 --directory /Users/lucille/greenguard-usa-web`.

Gate verdict: **READY** (all checks pass).
