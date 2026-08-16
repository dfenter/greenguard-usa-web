# Skyhammer
Controls (touch): drag anywhere, and the ship follows your finger 1:1 from where you grabbed; a second finger down = FOCUS (slower, tighter shot, hitbox shown); tap the BOMB button to clear the screen.
Controls (keys): arrows/WASD move, Shift focus, Space/Z bomb, Enter restart. Fire is automatic.
Loop: 3 seeded stages of wave grammar (aimed streams, fans, spirals, walls-with-gaps), each capped by a 3-phase boss with destructible pods. Near-misses graze and build the score multiplier (up to x8).
Fail/Win: 3 lives, hit = life lost and bombs refill; clear stage 3 for the 1CC win screen. Score and best (localStorage) shown on the HUD.

## AAA rebuild

Rebuilt in place on 2026-08-10 from the archived canvas prototype to the
flagship bar. The prototype's concept, tuning and pattern grammar survive; the
implementation does not. Engine is Phaser 3.87 from `/play/_shared/`, and GGKit
is the sole lifecycle, pause, input-identity, save and audio implementation.

Files: `index.html`, `game.js` (scenes and sim), `sh_art.js` (all art and audio,
generated procedurally at boot), `sh_content.js` (world design and wave
grammar), `manifest.json`, `sw.js`, `icon.png`, `icon512.png`, `favicon.png`,
`favicon.ico`, `LICENSES.md`. The prototype's `core.js` and `content.js` are
gone. Payload is 320 KB for the title, largest file 88 KB, and roughly 1.5 MB
including the shared Phaser build. No asset is fetched and no CDN is touched.

### Implemented

**Mechanics.** 1:1 finger-follow drag: the ship moves exactly the distance the
finger travels on glass, verified at 55.4 game px for a 60 css px drag. A
second finger holds FOCUS, which scales the drag to 0.42 (measured 23.3 px for
the same 60 px), tightens the shot spread, and draws the TRUE hitbox as a
2.6 px dot inside a rotating ring. Graze radius is 12.5 px, 16.0 px in focus;
every graze ticks a meter that drives the multiplier from x1.0 to x8.0, and the
multiplier chip pops on change. Bomb clears the screen, pays out every live
bullet, damages the boss and every pod, and fires a baked expanding shockwave
plus flash, shake and hit-stop. Boss pods take staged damage and read it:
pristine, cracked, critical, plus a white hit flash, with a per-pod health bar.
Taking a hit costs a life and a power level, drops a red vignette, blanks the
bullet field, refills bombs, and blinks invulnerability.

**Loop.** Three modes. STAGE RUN is a seeded run with three continues.
BOSS RUSH unlocks after the first clear. 1CC CHALLENGE has no continues and
carries the top medal. Medals are per stage: bronze on score, silver on score
plus graze, gold on score plus graze with no bomb used. The unlock chain is
clear a run to open Boss Rush and the 1CC, take three medals to add IRON
MERIDIAN to the run, then hold silver on all four stages to summon SKYHAMMER
PRIME as a fifth finale. Drops are deliberately generous: two per wave, three
on each signature wave, a guaranteed pair on every stage clear, one from every
destroyed pod, and two from the graze route. Drops magnetise inside 76 px so a
generous drop is never lost. Power, bomb, score flare, shield and extend all
convert to score when they would be wasted.

**World.** Four authored stage identities plus the finale, each with its own
grammar, cast, palette, parallax speed, boss silhouette and one discoverable
graze route (a pair of drifting pylons that pay a multiplier-scaled bonus for
the grazes banked in the previous three seconds, plus two guaranteed drops).

| # | Stage | Grammar | Cast | Waves | Tier | Gate wave | Boss | Phases / pods |
|---|---|---|---|---|---|---|---|---|
| 1 | DAWN SHELF | aimed streams | drone, lancer | 8 | 1.0 | 4 | KESTREL FRAME, swept raptor frame | 3 / 2,2,3 |
| 2 | EMBER REACH | fan spreads | pod, drone, lancer | 9 | 2.3 | 5 | VAULT CHOIR, cathedral organ | 3 / 3,2,3 |
| 3 | STORM VAULT | spiral gauntlet | orb, drone, pod | 10 | 3.7 | 6 | CORONA WEAVER, ringed halo weaver | 3 / 2,3,4 |
| 4 | IRON MERIDIAN | walls with gaps | block, pod, lancer, orb | 11 | 5.2 | 7 | BASTION GATE, portcullis bulwark | 3 / 3,3,4 |
| 5 | HAMMERFALL | boss only | lancer, orb | 0 | 7.0 | none | SKYHAMMER PRIME, hammer titan | 4 / 3,4,4,5 |

Boss move grammar per phase, from `sh_content.js`:

| Boss | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|
| KESTREL FRAME | aimed, fan | aimed, ring, fan | aimed, ring, rain | - |
| VAULT CHOIR | fan, ring | fan, arms, aimed | fan, wall, ring, rain | - |
| CORONA WEAVER | arms, aimed | arms, ring, spiralWall | arms, ring, rain, aimed | - |
| BASTION GATE | wall, aimed | wall, arms, ring | wall, rain, arms, aimed | - |
| SKYHAMMER PRIME | aimed, wall, ring | arms, fan, rain | spiralWall, ring, arms, aimed | arms, wall, ring, rain, fan |

`spiralWall` is the signature composite: a wall whose safe gap orbits, so the
lane has to be tracked instead of memorised.

**Presentation.** Every sprite, particle, plate, ring and sound is generated in
`sh_art.js` at boot. Ship, five enemy classes, five boss silhouettes and the
pods all carry idle / hit / destroy frames, swapped by `setFrame` rather than
tint so the canvas fallback matches WebGL. Bullets are colour coded by lane
(aimed rose, fan amber, spiral cyan, wall violet, ring ember, arms mint, rain
periwinkle, pod pink) so the colour teaches the motion. Six pooled particle
systems: muzzle, graze, hit, boom, shard, smoke. Banner beats are 60 percent of
screen width with a Back.easeOut overshoot for stage start, boss warning, phase
break, stage clear, medal and the graze route. Audio runs entirely on the GGKit
bus: 16 synthesised sfx (shot, focus shot, hit, graze, boom, pod break, bomb,
phase sting, warning, clear, medal, pickup, extend, death, ui, gate, game over)
plus three music stems crossfaded between field, boss and menu.

**Reduced motion.** One switch. `kit.juice.enabled` gates shake, hit-stop,
banner overshoot, flashes, particle counts and score pops together, and the OS
`prefers-reduced-motion` preference forces it off at boot and on change.
Verified: emulating the OS preference flips `__sh.state.reducedMotion` to true.

### Verification hook

`window.__sh = { state }`, one preallocated object created before Phaser boots
and mutated in place by the live scene, so the boot fallback and the running
game are the same object. Reports `mode`, `scene`, `stage`, `stageKey`,
`stageName`, `phase`, `lives`, `bombs`, `power`, `multiplier`, `meter`,
`graze`, `score`, `best`, `bossPhase`, `bossHp`, `bossMaxHp`, `bossName`,
`podsAlive`, `bullets`, `medals`, `unlocks`, `seed`, `noContinue`,
`reducedMotion`. Switches: `forceStage` (number, begin a run at that stage),
`forceBoss` (skip the wave block), `forceGenerousDrops`, `forceUnlockAll`,
`forceGrazeGate`. `window.__sh.game` is the Phaser game.

### Verified in a real browser

Driven through CDP in headless Chrome at 390x844, DPR 2, portrait, WebGL
renderer. Zero console errors and zero exceptions across every run.

- Boot to menu, menu to play, 36 baked textures present.
- All five stages reached their boss: DAWN SHELF / KESTREL FRAME, EMBER REACH /
  VAULT CHOIR, STORM VAULT / CORONA WEAVER, IRON MERIDIAN / BASTION GATE,
  HAMMERFALL / SKYHAMMER PRIME.
- Full boss kill through three phases: break, break, dying, then stage clear,
  gold medal awarded and persisted, ALL CLEAR overlay, Boss Rush and 1CC
  unlocked on return to the menu.
- Death with no lives opens the continue overlay.
- Drag, focus, focus-drag scaling, bomb consumption and screen clear, graze
  gate, drops, banner width and pod damage frames all measured, listed above.

### Bugs found and fixed during the rebuild

- Pools were built before the Blitters they populate, so `create()` threw on
  the first frame. Blitters now precede `buildPools()`.
- `softDisc` used a hardcoded mid-stop alpha instead of a fraction of the peak,
  so every faint glow was brighter in its ring than at its centre. The nebula
  rendered as grey doughnuts that buried the bullets.
- Phaser `Text.setResolution(2)` lays the quad out at the texture's pixel size,
  which drew every HUD string at double its measured width and made the top
  band collide with itself. Removed.
- The boss-only finale softlocked: the intro handed the phase straight to
  `warn`, and the warning trigger in `stepWaves` refuses to fire when the phase
  is already `warn`, so nothing ever summoned the boss.
- Reduced-motion gating could never fire. The old test was "juice enabled AND
  the OS is not asking for reduce", but GGKit's default for juice is already
  true, so no value meant "the player has not chosen". The OS preference now
  drives the single switch instead of being a parallel condition.
- Live HUD values were Phaser Text objects. A `setText` rebuilds a canvas and
  re-uploads a texture, so a live score readout paid a texture upload per
  frame. Score, best, multiplier, graze, power and the bomb count now render
  from a baked fixed-width glyph atlas as pooled Images.

### Deferred

- **The feel gate could not be measured on this box.** Unthrottled the game
  holds a flat 16.7 ms median with a 16.8 ms max, and at 4x CPU throttle the
  median is 16.7 ms, inside the 17.5 ms budget. The long-frame budget could
  not be confirmed: at 4x throttle the run showed 132 frames over 33 ms out of
  600, but a control measurement of an EMPTY PAGE in the same harness showed
  41 over 33 ms out of 380, and disabling the HUD, every particle system and
  every tween moved the number by less than the run-to-run spread. The long
  frames are the headless compositor on this machine, not the title. This
  needs a re-measure on an uncontended box with a real GPU before the feel gate
  can be called.
- No packaged asset is used. `/play/_assets/` currently contains only the art
  bibles and the ledger, no asset files, so everything is procedural. If a
  curated Kenney cut is ever wanted for this title, the sprite and audio
  registries in `sh_art.js` are the single swap point.
- Boss Rush does not award medals; medals stay a Stage Run and 1CC reward.
- The graze route is one gate per stage. A second, harder route per stage was
  scoped but not built.
- No leaderboard and no seed entry UI. The run seed is random per launch and
  reported through `__sh.state.seed`; a seed-sharing screen is unbuilt.

## UI declutter

- Removed live-play center banners for boss warnings, phases, graze events, and routine score/pickup popups; meaningful events now use one queued corner chip capped at about 1 second, while center beats remain only for stage and clear boundaries.
- Collapsed the persistent HUD to top-edge score, multiplier meter, stage fraction, and color-coded life/bomb/power icons; removed BEST, GRAZE, PWR, boss-name, and stage-name labels from active play while retaining results/menu information.
- Kept one queued single-line tutorial strip, removed repeating stage flavor and continue prose, moved status icons out of bottom thumb zones, and preserved reduced-motion gating for notice transitions.

## Retina pass 2026-08-16

- Before ratio: approximately 1.00x static FIT baseline for the 360x779 portrait design. A live pre-pass canvas readback was unavailable in this sandbox.
- After ratio: 3.00x target by factor math at emulated DPR 3, producing a 1080x2337 backing store for the computed 360x779 design viewport.
- Recipe: Phaser `Scale.FIT`, design coordinates preserved, scale dimensions multiplied by `GGKit.hiDpi.factor(360, 779)`, shared `GGKit.renderDefaults` merged, and zoom applied in boot, menu, and play scene `create()` methods. HUD and boot-error text use the same factor.
- Factor cap: none beyond GGKit's default clamp to [1, 3].
- Could not do: live `canvas.width / getBoundingClientRect().width` readback, gameplay screenshot, and `retina_audit.mjs` acceptance because no browser surface was available and private port binding was denied.

## Retina completion

- **Measured, not expected.** Release gate at deviceScaleFactor 3, run serially at concurrency 1 from `ue-port-studio/aaa/harness` against a private local server: `node release_gate.mjs http://localhost:8791 1 skyhammer`.
- Gate verdict: **READY**. Measured `canvas.width / getBoundingClientRect().width` = **3.00x** (gate floor 2.85), sampled late by the gate, well after the point where a RESIZE parent poll would have reverted it. Backing store 1170x2532 in a 390x844 CSS box.
- Real gameplay frame: **11377 distinct colours** (8-bit), flattest colour 36.2% of the frame. The frame was compared side by side against the same interaction at deviceScaleFactor 1: layout, spacing and art are pixel-proportional, only the sampling is denser.
- **The earlier note in this file was wrong.** It recorded "3.00x target by factor math" without a browser. The real measurement was 2.77x. `GGKit.hiDpi.factor` clamps its result at dpr, which is correct when the design box is WIDER than the display box but leaves this title short: Skyhammer designs at a fixed 360-wide world and FIT upscales it by 390/360 = 1.083 BEFORE the display's own dpr, so 360 x 3 = 1080 backing pixels spread over a 390-pt box is 2.77x, not native.
- Fix: `RETINA_FACTOR` now takes the larger of `hiDpi.factor(GW, GH)` and the unclamped `(displayed CSS width * dpr) / designWidth`. That lands the backing store exactly on the panel's pixel count (1170 x 2532 for 390 x 844 at dpr 3) and never above it.
- **Real defect found and fixed while verifying.** The Play scene rendered a completely blank canvas at DPR 3 and put the whole playfield in a corner at DPR 2. Cause: the per-frame camera shake called `cameras.main.setScroll(jf.dx, jf.dy)` absolutely, which snapped the zoomed camera back to scroll 0,0 and undid the `centerOn(GW/2, GH/2)` from `create()`. The shake is now an offset from the scroll `centerOn` produced (`camBaseX/camBaseY`). Nothing was logged for this: the gate caught it as a 100%-one-colour ART failure, not as an error.
- Recipe: Scale.FIT with a fixed design size, so `hiDpi.phaser()` was deliberately NOT used (it moves the world coordinate space). `scale.width/height` are raised by the factor and every scene does `setZoom(f)` AND `centerOn(GW/2, GH/2)`.
- Text keeps `resolution: RETINA_FACTOR`, which is the Text object's own bake resolution, not `source.resolution`.
