# Mythweave

Bind ten myth-spirits, chain three command cards a turn, and unmake the cut
that is unravelling the loom-halls.

## Controls

- Tap a command card to add it to the chain. Three cards make a turn.
- Three cards from the same spirit fire that spirit's Weave Art.
- Hold a card to preview its damage against the current target.
- Tap a foe to change target. Tap a lit spirit portrait to fire a ready
  Weave Art. Tap RESOLVE to play the chain, tap again to skip the animation.
- Keyboard: 1 to 5 pick cards, Q W E fire the three Weave Arts, Enter or
  Space resolves and skips, arrows change target and move menu focus,
  Escape opens pause and settings.

## Goal

Clear five chapters and twenty four battles, bind all ten spirits, and end
The Unwoven. Spirits are earned by clearing content. There are no shops, no
currency and no gacha.

---

# Dev section

## AAA rebuild

Rebuilt in place from the prototype. Phaser 3.87 from `/play/_shared/`,
GGKit as the only implementation of lifecycle, pointer identity, guarded
saves, audio buses, loading, settings and juice. Two shipped scripts:
`content.js` (data registry) and `game.js` (sim plus view).

### Implemented

- **Combat clarity.** Enemy intent is telegraphed above every foe as an icon
  plus the exact number it will deal, refreshed every turn. Damage preview
  runs on both selection (a ghost number over the target and a chain readout)
  and card hold. The chain bonus is shown as you build it (`CHAIN 2/3
  bonus +2`). Break bars sit under every health bar; filling one staggers the
  foe, which skips its turn and takes 1.5x damage. There is no hidden roll in
  combat: every damage number is a pure function of visible state. The only
  randomness is the deck shuffle, and the top of the deck is shown in the
  footer (`NEXT  VUL  Anvil Strike`). Resolution animates on the stepped sim
  clock and is skippable, which multiplies every step delay by 5.5.
- **Class triangle and element ring.** Blade cuts Ward, Ward smothers Rite,
  Rite unmakes Blade (1.25x / 0.8x). Ember beats Ash beats Tide beats Ember,
  Glass beats Bone beats Loom beats Glass (1.35x / 0.75x). Both are surfaced:
  the card carries an element pip and a class mark, the target line names the
  foe's pair, and holding a card prints `STRONG x1.35` or `WEAK x0.75`.
  Neutral is exactly 1.00, so the prototype's tuned base numbers are intact.
- **Loop.** Five chapters, twenty four battles, one rising boss per chapter.
  Six Trials of the Weave with fixed seeds, fixed waves and one standing rule
  each. Free Battle in any cleared realm, with the exact encounter shown
  before you commit and rerollable. Ten collectable spirits, all story loot.
- **Progression.** Spirit levels 1 to 20 from battle experience, plus a four
  step ascension track (Bound, Deepened, Woven, Ascendant) fed by bond fights,
  first trial clears and every fifth free battle win. Card values scale as
  `ASC_MUL[asc] * (1 + 0.028 * (level - 1))` where `ASC_MUL` is the
  prototype's `[1, 1.3, 1.65]` plus a fourth tier at 2.0. Chapter stars (one
  to three per battle by turns used and thread remaining), roster, party,
  levels, ascension, tokens, trial best turns and finale best run all persist
  through the GGKit save with a validating sanitiser.
- **World.** Five authored realms with their own baked backdrop, palette,
  encounter table, music and myth motif: the Lantern Quarter (hung paper
  lanterns), the Drowned Shrine (submerged bells), the Ash Steppe (leaning
  standing stones), the Glass March (mirror shards) and the Loom (vertical
  warp threads and the cut).
- **Art.** Every pixel is baked into canvas textures at load: five backdrops,
  twenty foe silhouettes across fifteen families, eleven spirit portraits,
  twenty two card faces, a ten frame player spritesheet, sixteen icons, five
  particle sprites, the wordmark and every panel. No Graphics command list is
  replayed per frame.
- **Player entity, five animation states.** The Weaver has idle, weave, guard,
  hurt and cheer, two frames each, driven by sim events.
- **Five particle systems.** Hit sparks, shatter (break and defeat), bloom
  (heal and block), weave burst, and ambient loom motes.
- **Audio.** Four original music loops (menu and Lantern Quarter, Drowned
  Shrine and Glass March, Ash Steppe, boss and Loom) plus sixteen distinct
  SFX, all through GGKit buses, all mp3. Music is registered at boot but only
  loaded on the first pointer or key, so nothing is fetched before the player
  interacts.
- **UI law.** One transient at a time: the coach strip, event chips and the
  run boundary banner share a single queue, and the strip is suppressed while
  a banner is up. Event chips are auto width and left anchored at the top
  edge, capped at 1.0s. The centre banner is 234px, sixty percent of the
  frame, and only fires at run boundaries (battle start, wave change is a chip
  instead, and results use a full screen panel). The persistent HUD is one
  chip row, icons over labels everywhere (intent, status, card faces, thread
  band). All readable text is 13px or larger, most at 14 to 16. Touch targets:
  cards 68x170, foes full slot, rail slots 118x72, resolve 250x62, pause
  52x48. The bottom 76px is left clear for thumbs and the home bar.
- **Tutorial.** Five interactive steps on the first run, each a thin fading
  top strip, each gated on the player actually doing the thing.
- **PWA.** manifest, 192 and 512 icons, favicon, `sw.js` from the shared
  template with a precache list that was checked file by file against disk.

### Preserved prototype behaviour

- Hand of five, chain of three, three from one spirit fires the ultimate.
- Every original spirit kit is byte identical: Vulmar, Sethrin, Kaark,
  Grendok, Lumeth, Thraxa, Ninveil, Ossivane and the Weaver keep their card
  names, values and ultimates. Two spirits were added for the two new
  chapters (Sableen, Orroven).
- Foe hit points and move cycles are unchanged; a chapter ramp
  `[1, 1.15, 1.35, 1.6, 1.75]` scales them past chapter one, so chapter one is
  exactly the tuned prototype fight.
- Player thread is still `62 + chapter * 10`.
- Turn order: play the chain, discard, every living foe acts, end of round
  burn and weaken tick, redraw. Block clears at turn start, power decays by
  one, weaken halves foe damage to 0.6, frayed raises incoming damage to 1.3.
- Bond fights are optional and never block the story path.
- A wipe is a free retry with no cost, and the results screen offers a party
  change before retrying.

### Content tables

| Chapter | Realm | Battles | Boss | Spirits bound |
|---|---|---|---|---|
| I. The Lantern Quarter | Lantern city | 5 | The Wickmother | Sableen, Kaark, Sethrin |
| II. The Drowned Shrine | Drowned shrine | 5 | Tidebound Abbess | Grendok, Ossivane |
| III. The Ash Steppe | Ash steppe | 5 | Cindercrown | Thraxa, Orroven |
| IV. The Glass March | Glass march | 5 | The Glass Warden | Lumeth, Ninveil |
| V. The Loom | The Loom | 4 | THE UNWOVEN | - |

Twenty foes across fifteen silhouette families. Six trials (Threads, Tides,
Cinders, Mirrors, Bones, the Cut) with rules: four card hand, halved healing,
foes enrage each round, halved block, halved gauge fill. Five free battle
realms with four entry encounter tables.

Rough length: twenty four battles at roughly one minute each, plus six trials
of three waves, plus the free battle grind needed to reach the level gates on
the ascension track. Comfortably past twenty minutes to exhaust.

### Audio inventory

Music: `lantern`, `shrine`, `steppe`, `loom`. SFX: `ui`, `pick`, `unpick`,
`strike`, `guard`, `arcana`, `weave`, `heal`, `hurt`, `break`, `unravel`,
`bind`, `victory`, `defeat`, `star`, `intent`. All synthesised for this title,
mono mp3 at 96 kbps. Payload 1506 KB total, largest file 257 KB.

### Verification hook

`window.__mw.state` exposes mode, stage, stageName, chapter, progress, score
(damage dealt this battle), health, hp, maxHp, turn, phase, roster, tokens,
cleared and total. `window.__mw.forceMode(mode)` accepts title, map, battle,
trials, free, party, end. `window.__mw.forceStage(n)` jumps to global battle
index 0 to 23, unlocking and binding everything before it. Both are readable
from the boot fallback and applied live to the running scene.

### Verified locally

`node --check` on every shipped script. Booted at 390x844 dpr2: zero console
errors, zero failed requests across title, story, battle, resolution, result,
map, party, trials, free battle, trial start and the pause shell. A full
battle was played to a win and to the reward story page. Gate harness at
390px with 4x CPU throttle: non black 94.4 percent, 365 distinct colours on
boot and 173 in play, payload 1506 KB, per file max 257 KB, zero console
errors, frame median 16.7 ms.

### Known limitations

- The harness reported 96 of 600 frames over 33 ms. That is not this title:
  the same trace with `scene.update` and `paintFrame` stubbed out entirely
  still produced 36 of 240 frames over 33 ms, so the spikes are the contended
  build box, not the game. The feel gate needs a re-run on an uncontended
  machine against the deployed URL.
- `pwa_sw` reads false over http on localhost; service worker registration is
  https only and is expected to pass on the deployed URL.
- No harvested asset pack was available in this workspace, so all art and
  audio are generated rather than cut from the CC0 packs in the ledger.

## Retina pass 2026-08-16

- Audit profile: CSS viewport 390x844 at DPR 3. Measured pre-pass backing-store ratio: 1.00x. FIT scale math after the pass measures 1170x2532 against the 390x844 CSS canvas, a 3.00x ratio.
- Recipe: `GGKit.hiDpi.factor(390, 844)`, dense FIT scale dimensions, `GGKit.renderDefaults`, and `this.cameras.main.setZoom(f)` in PlayScene. Existing canvas baking now uses dense GGKit canvases, text resolution uses the same factor, and pointer mapping stays in design coordinates.
- Factor cap: none. The factor is the GGKit native value, capped only by GGKit's normal maximum of 3.
- Could not complete live headless canvas readback or a gameplay screenshot because no browser backend was available in this environment. `node --check` passed.


## Blank frame repair

Symptom: at CSS 390x844 / deviceScaleFactor 3 the title booted clean, the render loop
advanced, the backing store measured 3x, and the frame was blank.

### Root cause

The retina conversion raised the backing store to design x factor and applied
`cameras.main.setZoom(factor)`, but a zoomed Phaser camera transforms about its
ORIGIN, which defaults to the centre of the viewport. With scroll 0 a design-space
point x therefore lands at `zoom*x - (width/2)*(zoom-1)`, i.e. the whole design box
sits one and a bit screens to the left of and above the viewport. The loop runs, the
scene draws, nothing is on screen, and there is no error anywhere.

This title is repaired with `cameras.main.setOrigin(0, 0)` alongside the zoom rather
than the fleet's `centerOn(DESIGN_W/2, DESIGN_H/2)`. Both put the design box back on
screen, but origin (0,0) additionally leaves scroll 0 meaning "design origin", so any
absolute `setScroll()` the title already performs (screen shake, world scrolling) and
any `setScrollFactor(0)` HUD stay correct in design pixels with no compensation. See
the per-title cause below for why that mattered here.

- The factor is named `HIDPI_FACTOR`, so the scripted pairing did not match.
- Second defect on top of the centring: `PlayScene.update` runs an ABSOLUTE
  `this.cameras.main.setScroll(-frame.dx, -frame.dy)` every frame for the shake, which
  would have reset a `centerOn` on the very next frame. With origin (0,0) it is correct.
- Repair: `setOrigin(0, 0)` next to the zoom. Shake untouched.

### Measured, by me, on a real gameplay frame

Release gate run serially (concurrency 1) against a local static server:
`node release_gate.mjs http://localhost:<port> 1 mythweave`, headless Chrome,
390x844 at deviceScaleFactor 3, best of four post-interaction frames.

| | distinct colours (8-bit) | flattest colour share | backing/CSS ratio | gate |
|---|---|---|---|---|
| before | 478 | 27.5% | 3x | HOLD (art) |
| after | 5417 | 17.9% | 3x | READY (all checks pass) |

`node --check` clean on every file touched. No gameplay, balance, content or art
direction was changed.
