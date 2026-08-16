# Silkwind

Side-view wuxia duels. Three stances form a counter triangle you switch
mid-combo, and every duel is best of three exchanges on an authored stage.

## Goal

Win two exchanges out of three. Read the rival's tell before you commit:
strikes can be parried, grabs and burst arts cannot. Breath fills on its own
and pays for wire-work dashes and finishing arts.

## Controls

Touch: swipe up or down in the arena for a high or low strike, swipe right to
dash in, swipe left to evade, tap to parry, and use the corner buttons for
high, low, parry, grab and the burst art. The three chips at the bottom left
change stance. The pause disc sits at the bottom centre.

Keys: arrow up and down strike high and low, arrow right dashes, arrow left
evades, J parries, K grabs, space spends breath on a burst art, 1 to 3 pick a
stance, R restarts the duel, P pauses, Enter and Escape work the menus.

## The three stances

Crane beats Tiger, Tiger beats Serpent, Serpent beats Crane. Winning the
triangle multiplies your damage by 1.5 and losing it cuts you to 0.65, so the
swap is instant and always available, even during a recovery.

## Modes

- The Ascent: eighteen ranked duels across four stages.
- Trial of Forms: the tutorial plus eight graded drills that pay insight.
- Survival: an endless line of rivals with escalating pressure.
- Techniques: spend insight on eight permanent upgrades.

---

# Dev section

## AAA rebuild

Engine Phaser 3 from `/play/_shared/phaser.min.js`, GGKit from
`/play/_shared/ggkit.js`, both by absolute path behind
`<base href="/play/silkwind/">`. Landscape, 1280 x 720 virtual, Scale.FIT.

### Preserved prototype behaviour

The archived prototype in this directory was the design document. Everything
below survives the rebuild unchanged unless noted:

| Constant or rule | Value |
|---|---|
| Stance triangle | crane > tiger > serpent > crane, 1.5x and 0.65x |
| Dash cost / burst cost | 20 / 50 breath (technique track can lower both) |
| Breath regeneration | 0.006 per ms, ceiling 100 |
| Player strike | 150 ms startup, 90 ms active, 300 ms recovery |
| Player parry | 0 / 210 / 250 ms |
| Player grab | 230 / 110 / 470 ms |
| Player evade | 0 / 240 / 150 ms |
| Player dash | 0 / 200 / 70 ms |
| Player burst | 260 / 120 / 360 ms |
| Damage bases | strike 10, thrust 8, grab 13, burst art 18 |
| Punish / guard break / armoured | 1.6x / 1.55x / 0.25x |
| Round | best of three exchanges, 60 second clock, 1200 ms opening freeze |
| Range | two step measure, smoothing 0.009, every clean hit breaks it apart |
| Recovery cancel | the last 45 percent of a recovery is cancellable |
| Rivals | the same eight, with their tell, gap, loose, stance mode, guard mode, sequence and tip |

Changes made deliberately: orientation is landscape per the slate row (the
prototype was portrait); the persistent hint line became a fading coach strip;
the eight-master ladder became an eighteen rung ascent that reuses the same
eight rivals with escalating modifiers.

### Content

| Ascent | 18 rungs | rival, stage and tell/gap/loose/health modifiers per rung |
|---|---|---|
| Rivals | 8 | Reed Warden, Iron Bell, Twin Willow, Ash Sparrow, Quiet Lantern, Nine Coil, Storm Heron, The Silkwind |
| Stages | 4 | bamboo grove, rain temple roof, frozen lake, silkwind peak |
| Trials | 8 graded drills | first breath, parry form, guard reading, evasion, the measure, stance triangle, qi discipline, iron will |
| Tutorial | 6 interactive steps | strike, guard break, parry, evade, stance counter, burst art |
| Survival | endless | rival cycles, stage advances every three waves, escalating tell, gap, health and damage |
| Techniques | 8 | deep breath, swift hands, iron palm, long step, wind body, silk guard, ninth art, second wind |

Rough length: the ascent alone is 18 duels of two to three exchanges, about
25 minutes on a first clear, plus 8 drills and an endless mode.

### Progression and saving

GGKit `save` with `validateSave`. Schema v3 holds rungs cleared, wins, losses,
insight earned and spent, per-technique ranks, eight trial grades, survival
best, tutorial flag, and the coach-hint preference (stored in `seen`).
`validSave` rejects any technique key that is not in the registry, any grade
outside 0 to 3, and any save whose spend exceeds its earnings;
`normalizeSave` rebuilds a legal profile from a partial one and recomputes
spend from the owned techniques rather than trusting the stored number.

Insight: 3 per new ascent rung, 1 per new trial grade tier, 4 at survival
waves 3, 6 and 10. The eight techniques cost 61 in total.

### Audio

Original synthesis, mono mp3 at 96 kbps, never ogg. Five looping music beds
(menu plus one per stage, selected by stage) and sixteen effects: whoosh, hit,
heavy, clash, parry, block, break, grab, dash, burst, stance, ui, ko, win,
lose, gong. All routed through the GGKit buses; effects are pre-decoded during
the loading screen and music is only fetched after the first interaction.

### Rendering

Every frame is procedural and baked to canvas textures at load, never rebuilt
per frame:

- Fighter sheets: 3 stances x 14 poses in one sheet per fighter, so a stance
  swap is a frame offset and reads instantly. The opponent sheet is rebaked
  between duels, on a menu, never during play.
- Stages: one composited backdrop per stage (sky, silhouettes, haze, stage
  glow, floor and vignette) plus a single parallax mid layer. Six stacked
  full width layers were collapsed into two to cut the per frame overdraw.
- HUD chrome, control glyphs, menu plates and particle shapes are baked once.

Phaser Graphics is used only for the two sash ribbons and the enemy tell arc,
which is hand tessellated into 18 segments rather than using `Graphics.arc`.
All text goes through change-guarded `setText`, `setColor`, `setAlpha` and
`setVisible` helpers.

Three frame-cost findings from the throttled traces, worth carrying to other
titles in this lane:

- `render: { antialias: true }` alone asks for a multisampled WebGL context.
  On a software rasteriser that roughly tripled the cost of every frame.
  `antialias: true, antialiasGL: false` keeps LINEAR filtering for the scaled
  procedural sheets without the multisampled context, and nearly doubled the
  frame rate on its own.
- A full screen menu scrim hides the duel completely, so the world was being
  drawn underneath it for nothing. The world container is now culled whenever
  a menu owns the screen, and menus get their own baked ink wash backdrop.
- A quad at alpha zero is still a blended draw. The change-guarded alpha
  helper now also toggles visibility, which retires the banner, chip, coach
  strip and aura quads when they are invisible.

Particle systems, all pooled with no per-frame allocation: impact sparks,
tapered shards, expanding rings, ground dust, and per-stage weather (leaves,
rain, snow, silk motes).

Player animation states: idle breath, guard high, guard low, wind up, strike
high, strike low, thrust, grab, parry, hurt, dash, burst, down.

### UI law compliance

One transient at a time: corner chips queue, they never stack. Centre banners
only at run boundaries (exchange start, exchange end, results). Coaching is a
single thin fading strip at the top and only appears in the tutorial and the
first three rungs, and can be turned off in settings. The persistent HUD is
health, breath, exchange pips and a clock. Touch targets are 88 virtual pixels
or larger, which is over 44 CSS pixels at the 844 x 390 frame, and readable
text is 26 virtual pixels or larger, which is over 14 CSS pixels.

### Verification hook

`window.__sw` is created in `index.html` before the engine loads and the same
object stays live in the scene, so a headless probe reads the same bridge
before and after boot.

- `window.__sw.state`: mode, screen, stage, stageIndex, rung, rungsCleared,
  duellist, round, roundsWon, roundsLost, hp, hpMax, enemyHp, enemyHpMax,
  breath, stance, score, insight, timer, techniques.
- `window.__sw.forceMode`: `title`, `tutorial`, `ladder`, `ladder-last`,
  `trial`, `survival`. Consumed on the next frame.
- `window.__sw.forceStage`: stage id or index.
- `window.__sw.forceWin`: ends the current exchange as a win.

### Known bug classes explicitly avoided

- Textures are baked before the game objects that display them. Creating an
  image against a missing texture and then calling `setDisplaySize` bakes in a
  scale computed against the placeholder, which silently ruins every layer.
- The pointer zone claim is a window level listener registered after GGKit
  init, and it seeds `kit.input.pointers` when GGKit skipped the record.
- The simulation only advances in fixed 1/60 steps and every gameplay clock
  reads `run.simTime`, which is only advanced by those steps.
- Scenes are built with a prototype class, not a plain config object.
- The service worker precache lists only files that exist.
- All arrow IIFEs are closed `})()`.

### Known limitations

- Music loops through `decodeAudioData`, so an mp3 encoder gap of a few
  milliseconds is audible at the loop point.
- The rival AI is sequence driven with an improvisation rate rather than a
  reactive planner, which is what the prototype tuned and what the tells
  depend on being readable.
- Survival stages stop advancing after the fourth stage and keep escalating
  the modifiers instead.

## Retina pass 2026-08-16

- Before ratio: 1.85x static FIT baseline from the 1280x720 design backing store against the 693 CSS pixel landscape width on an iPhone-class viewport. A live pre-pass canvas readback was unavailable in this sandbox.
- After ratio: 3.00x target by factor math at emulated DPR 3. `GGKit.hiDpi.factor(1280, 720)` is 1.625 for the 693x390 CSS landscape fit, producing a 2080x1170 backing store.
- Recipe: Phaser `Scale.FIT`, design coordinates preserved, scale dimensions multiplied by the factor, shared `GGKit.renderDefaults` merged, and zoom applied in the main scene `create()`. HUD text uses the same factor.
- Factor cap: none beyond GGKit's default clamp to [1, 3]. No title-specific cap was needed.
- Could not do: live `canvas.width / getBoundingClientRect().width` readback, gameplay screenshot, and `retina_audit.mjs` acceptance because no browser surface was available and private port binding was denied.
