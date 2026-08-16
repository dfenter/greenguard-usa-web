Controls: drag anywhere with one finger (or mouse) to move; WASD/arrows also work.
Weapons auto-fire; collect blue gems to level up, then tap one of three upgrades.
Survive escalating waves, elite spikes each minute, and defeat the Meridian Core at 10:00.
Death or victory shows score, kills, time, and a persisted best; tap Run Again for an instant restart.

---

## Dev notes

### Prototype behaviours preserved

Every behaviour named in the prototype brief survives in the shipped build and
is covered by the scripted playtest at
`/Users/lucille/ue-port-studio/aaa/harness/hm_playtest.mjs` (22 assertions,
all green, zero console errors):

- One-finger drag to move, anywhere on screen, plus WASD and arrow keys.
- Auto-fire. The player never fires manually; every weapon line picks its own
  target and cadence.
- Blue gem XP with a three-choice draft on level up. Cards are pickable by tap
  or by the 1 / 2 / 3 keys, and the three options are always distinct.
- Escalating waves off a twelve-row difficulty table, with an elite spike at
  every minute mark before the boss.
- The Meridian Core boss at 10:00, telegraphed by a collapsing ring.
- Death and victory both land on a stats screen (time, kills, level, score,
  gems banked) with a persisted best, and Run Again restarts instantly with no
  reload.

### Audio inventory

All audio is routed through the GGKit buses. Nothing touches WebAudio
directly, so the kit's touch unlock, persistent mute and per-bus volume apply
to everything. Format is mp3 only; there is no ogg anywhere (iOS Safari cannot
decode ogg through `decodeAudioData` and would ship silent).

- **Music: 2 layered stems**, `musicBase` and `musicHeat`, on a shared 132 BPM
  tempo, key and 16-bar length so the kit's crossfade is phase-coherent.
  `musicHeat` takes over above the danger threshold and for the whole boss
  fight, and falls back once the arena calms down.
- **SFX: 15 distinct cues** - shoot, hit, death, elite death, boss death, gem,
  levelup, select, click, hurt, wave, telegraph, pulse, unlock, enemy shoot.
- A voice limiter collapses repeats of the five hot cues (hit, death, gem,
  shoot, enemy shoot) inside a 34-60 ms window. The horde can otherwise land
  dozens of identical transients in one frame, which reads as mush and costs
  real WebAudio node churn.
- Every cue and both stems are decoded during the title screen, never during
  play. See the feel notes below.

Provenance for every file is in LICENSES.md. Nothing third-party ships.

### Content inventory

- **Run length: 10 minutes to the boss**, and a full arc runs past that with
  the boss fight itself. Meta progression is what carries the title past the
  20 minute bar: the first run is rarely a win, and banked gems persist.
- **Tutorial**: interactive, first run only, guided through roughly the first
  60 seconds. Each step waits on a real player action rather than a timer, and
  it never blocks the sim.
- **Difficulty ramp**: 12 wave rows from 0:00 to 9:20, each raising the spawn
  pool, the spawn rate and the pack size. Six enemy families with distinct
  silhouettes and behaviours (drifter, sprinter, bulwark, sapper, ranged
  lancer, orbiting weaver), plus elites and the boss.
- **In-run progression**: 13 upgrade lines - 6 weapons capped at rank 8, 7
  stat lines capped at rank 6 - drafted 3 at a time.
- **Persisted meta progression**: 6 permanent unlocks (Core Tuning,
  Reinforcement, Drive Coils, Field Magnet, Gem Refinery, Failsafe) bought in
  the shop with gems banked across runs, plus a persisted best score and run
  count. Saves are guarded and validated by GGKit; an unknown unlock id or an
  out-of-range rank rejects the whole save rather than loading it.

### Feel work (what the frame-time spikes actually were)

The feel gate measures frames over 33 ms at 4x CPU throttle. Four real causes
were found and fixed; all four were bursty rather than steady, which is why
the median was always fine:

1. **Mid-play audio decode.** Only five SFX were preloaded. Every other cue,
   and worse, the 29 s `musicHeat` stem, was fetched and decoded the first
   time it was needed - and `musicHeat` is needed the first time the danger
   meter crosses its threshold, in the middle of a fight. That was the 200-370
   ms hitch. Everything is now decoded in the background while the title
   screen is up.
2. **Draft overlay rebuilt from scratch on every level up.** Three containers,
   six sprites, fifteen Phaser `Text` objects (each allocating a canvas,
   rasterising and uploading a new GPU texture) and up to 24 rectangles, all
   constructed inside one frame, roughly 200 ms. The overlay is now built once
   and repopulated in place.
3. **Damage-number churn.** Each floating number called `setText`, `setColor`
   and `setFontSize`, and Phaser re-rasterises and re-uploads on every one of
   those, so it paid three times over; it also allocated a Tween per number.
   Style is now cached per pool slot and the scale pop runs off the pool clock.
4. **WebAudio node churn** from unlimited identical cues, addressed by the
   voice limiter described above.

Pooling and display-list parking were already in place from the previous pass
and were left alone: dead pooled objects are removed from the display list,
not merely hidden.

### Known limitations

- The service worker only registers over https, so the PWA install and
  offline path cannot be exercised on `localhost`. The gate's `pwa_sw` check
  is expected to fail there and pass on the deployed origin.
- Frame-time measurement on a contended machine is dominated by the machine.
  A blank page under the identical harness has been measured at 49 frames over
  33 ms out of 600 while the box was loaded; numbers are only meaningful on an
  uncontended box.
- The boss is the only scripted encounter. Waves after 9:20 keep using the
  last table row rather than continuing to escalate.
- `window.__HORDE` is exposed deliberately as an automation hook for the gate
  and playtest harnesses. It is a read-and-poke surface, not a cheat menu, and
  no UI references it.
- Both music stems are 29 s loops. Longer-form music would be better but would
  blow the 400 KB per-file budget at any reasonable bitrate.

---

## Fix round 1

Three read-only reviews (adversarial code, QA vs the six gates, art/FX/design)
were implemented against this build. Every CRITICAL and MAJOR finding is
addressed below, plus every MINOR that had a small fix. Verified end to end
with `hm_playtest.mjs` (22/22 assertions, zero console errors) and a targeted
probe covering the settings sheet, the cached draft overlay and the GGKit pause
handshake.

### Implemented

**Code review - MAJOR**

1. Pause lifecycle bypassed GGKit -> the scene no longer flips its own frozen
   flag; `holdPause()` / `releasePause()` / `releaseAll()` take a named GGKit
   pause REASON, so reasons stack and a settings sheet opened from the pause
   menu resumes into the pause menu, not into the run.
2. Boss telegraph mutated the run while paused -> the telegraph is a
   simulation-clock `after()` timer, not a real-time tween, so it inherits every
   freeze (draft, pause, settings, backgrounded tab) for free.
3. Boss callback leaked into a fresh Run Again -> every deferred callback
   carries the `runToken` of the run that scheduled it and is rejected once the
   token moves on; `resetRun()` also flushes the timer list outright.
4. Death/victory finalised score and gems too early -> `endRun()` only ARMS the
   ending; the simulation step finishes, then `finishRun()` does the accounting,
   so the killing frame's kill and the gem picked up microseconds later are both
   counted before anything is banked.
5. Boss impossible with a saturated enemy pool -> boss spawns are `force`d,
   which evicts the furthest trash enemy, and `bossUp` is set only after the
   Core actually exists.
6. System pause/blur left Phaser input latched -> `clearStick()` and
   `clearKeys()` run on every pause, resume, restart and scene shutdown, the
   stick vector is zeroed (not just `active`), and `stepInput()` requires
   `stick.active` before reading the vector.
7. Pointer cancellation stuck movement -> `pointercancel`, `lostpointercapture`,
   window `blur` and `visibilitychange` are all hooked at the window and routed
   into the single `clearStick()` release path; the listeners are torn down on
   scene shutdown so a restart cannot stack them.
8. All-upgrade state softlocked an empty draft -> `checkLevel()` never opens a
   draft with an empty pool; the level converts to a full heal plus a score
   bonus, announced in the banner.
9. Corrupted audio/UI preferences could brick startup -> both preference blobs
   this game owns are schema-validated and dropped if malformed, before
   `GGKit.create()` ever reads them.
10. A long frame lost simulation time -> movement substeps stay capped, but the
    elapsed gameplay clock is now credited explicitly via `advanceClock()`
    (bounded to 0.25 s per frame), so a stall no longer drifts the 10:00 boss
    and the elite minute marks later and later.

**Code review - MINOR**

1. Gem recycling was not FIFO -> a saturated pool now reclaims the live gem with
   the smallest `born`, not whatever the ring cursor pointed at.
2. Save validation accepted junk -> every field must be a safe integer in an
   explicit range and every meta key must be an OWN key of a known unlock, so
   `__proto__`, fractional ranks and `1e308` are all rejected.
3. Keyboard overrode touch -> the two vectors are summed and re-normalised, so
   dragging right while holding W gives the diagonal.
4. Upgrade stacking did not match the card text -> damage, speed, crit, regen
   and magnet are additive per rank against a base captured at run start; armor
   is deliberately and explicitly multiplicative (`1 - 0.88^r`), documented in
   `pickUpgrade()` as the only line that compounds.
5. Edge spawning could land an enemy on the player -> spawn angles are retried
   until the clamped point clears a real standoff, with an inward mirror as the
   last resort.
6. Projectile pool exhaustion silently dropped attacks -> a saturated enemy-bolt
   pool recycles the bolt with the least remaining life, so every shot fired is
   a shot the player can see and dodge.
7. Collision queried a stale spatial hash -> the hash is rebuilt after
   `stepEnemies()`, so mines, pulses and sapper blasts test where enemies
   actually are this step.

**QA review - gates**

- AUDIO: added player-facing Music and Effects volume controls to the settings
  shell (the same shell from the title and from the pause menu). Verified: two
  sliders present, `kit.paused` true while open, and the levels persist to
  `gg-horde-meridian-audio` (`{"music":0.35,"sfx":0.6}` survived a drag).
  The confirmation cue now fires once on release instead of machine-gunning
  across the drag.
- CONTENT: the tutorial has no timer fallbacks left. Every step waits on a real
  action: a real kill, a real gem pickup, a real upgrade selection, a real wave
  banner. The only clock left re-points the callout if the scripted target dies
  before the player reacts.
- UX/PWA (code half): manual pause and the draft both go through GGKit reasons;
  all stick and key state is cleared on every pause.
- SHIP hygiene (provenance half): see the LICENSES.md item below.

**Art review - CRITICAL**

- Greybox arena -> the arena is an authored place in five layers: 128 px deck
  plating, three depth bands giving the floor near/mid/far value structure,
  seeded floor inlays (plates, grates, vents, hazard chevrons), eight landmark
  pylons on a ring, and the Meridian mount at origin that the Core descends onto
  at 10:00 and that brightens as its arrival approaches. All placed once from
  the deterministic PRNG and camera-culled.
- Default-font / generic UI -> an authored two-role type system ships with the
  game (`HM Display` / `HM Body`, real woff2 files, not a system stack) on a
  formal scale with an 11 px floor, plus authored button materials with
  primary/ghost/disabled tones, a real pressed frame, icons and a glow rail.

**Art review - MAJOR**

- Player/gem/projectile semantics -> the player wears a reserved counter-rotating
  bracket marker drawn under the sprite as a dark cut-out; gems stay upright as
  a diamond silhouette and leave a trail once the magnet has them; player bolts
  are elongated and rotate to travel; enemy bolts carry their own frame and read
  hot.
- Enemy tiers collapsing at 390 px -> three separable channels in the order the
  eye resolves them: silhouette, a LOCKED family colour role applied to commons
  as well as elites, then rank furniture (aura + crown + a compact threat bar)
  that only elites and the Core ever wear, pooled to the elite budget.
- Static sprites -> the player has real two-frame idle and move loops plus a
  hurt state; enemies get per-family motion (drifter breathing, weaver flutter,
  sprinter lunge, boss wind-up swell), a squash-and-recoil hurt response along
  the hit axis, and a spinning collapsing husk on death.
- VFX not a designed family -> one three-beat vocabulary everywhere:
  anticipation (white flash + squash, now on the killing hit too), contact (a
  hard ring snapping outward from the hit point), aftermath (debris + husk +
  score popup). Standard, elite and Core kills differ only in ring size, husk
  timing, debris count and hit-stop, so escalation reads. Score popups are rate
  limited to one per 140 ms.
- Juice toggle -> the damage vignette and the invulnerability blink were the two
  effects still running unconditionally; both are now behind `kit.juice.enabled`
  with the shake and hit-stop. (See "Disputed" for the rest of this finding.)
- Danger edge as a full-screen wash -> replaced with four falloff strips keyed
  to the screen edges, so the frame lights up and the middle of the playfield
  keeps its contrast. A permanent screen vignette was added alongside it.
- Boss telegraph generic -> a three-stage sim-clock arrival: a floor danger zone
  fills and pulses on the mount, a 3-2-1 countdown ticks over it, then the Core
  lands with a contact ring and smoke. Its attack signature draws the projected
  bolt paths during the wind-up so the volley is dodgeable.
- HUD hierarchy too thin -> a single authored top band with a lit lower edge,
  icon-labelled thick integrity and experience bars, a chasing ghost bar and a
  numeric integrity readout, the timer as the hero numeral, and level/kills/gems
  as distinct chips. The integrity icon pulses below 30%.
- Generic draft/death/victory -> the draft is art-directed (deep scrim, bloom,
  rule, hot cards for new lines, rank pips); victory and defeat are different
  compositions (warm bloom and a rotating Core mark vs a cold tight frame), and
  the victory celebration renders at depth 401, ABOVE the depth-400 overlay that
  used to hide it.
- Weak onboarding -> the first minute is scripted: a single drifter is spawned in
  front of the player for the auto-fire beat, and a world-space callout tracks
  the actual object each step is about (that enemy, that gem, the mount).
- Feel gate -> see below.

**Art review - MINOR**

- Microcopy undersized -> formal type scale with an 11 px floor enforced in the
  single text factory; the floating damage/score numbers were the last strings
  still rendering in the fallback system stack and now use the display face and
  the same floor.
- Safe-area handling -> real insets are read back from `env()` in JS
  (`readSafeArea`) and every screen-space position derives from them.

**Feel gate carry-in**

Four spike sources were found and fixed in the previous pass and are described
under "Feel work" above (mid-play audio decode, the draft overlay rebuilt per
level-up, damage-number churn, WebAudio node churn). This round found and fixed
two more:

- The HUD repainted five Phaser `Text` readouts every frame. Phaser rasterises a
  Text object's backing canvas AND re-uploads its GPU texture on every
  `setText`, even when the string is identical, so the timer, level, kills, gems
  and integrity readouts were costing five canvas rasterisations and five
  texture uploads per frame for strings that change at most once a second. All
  HUD writes go through `setTextIfChanged()`; an unchanged write now costs one
  string compare.
- The draft overlay was cached but still BUILT on the first level-up, which
  lands about ten seconds into a run, inside the measured window. It is built
  once during scene create instead, while the loading frame is already long.

**Ship hygiene / provenance**

- LICENSES.md was materially wrong and is rewritten (Rev 2). It claimed "no
  third-party asset ships" and "No font file ships"; two woff2 faces do ship.
  They are ASCII subsets of Kenney Future and Kenney Future Narrow from the
  harvested Kenney ui-pack (CC0). The file now carries the ledger
  cross-reference table naming the exact row, per-file bytes and hashes, the
  exact `fontTools` command that reproduces both faces from the archive, and a
  verification record: 99 glyphs / 98 mapped codepoints each, `unitsPerEm` 1024
  matching upstream, and identical advance widths on all 98 shared codepoints.
  The stale image table is also corrected (atlas is 64 frames, not 37; the
  atlas, atlas.json and ground.png hashes had all moved; `edge.png` was missing
  entirely).
- `sw.js` VERSION bumped to `2026-08-07a-fix1`.
- Payload 1473 KB of 2500 KB; largest file `music_base.mp3` at 340 KB of 400 KB.
  No em dash appears in any user-facing string (the only hits in the source are
  code comments).

### Disputed

- **Art review: "Juice is not behind an accessibility toggle. Shake, hit-stop,
  flash and vignette effects are unconditional. Settings only exposes
  fullscreen."** Partly wrong, and the QA review reached the opposite conclusion
  on the same code ("Juice is correctly behind the accessibility toggle in
  ggkit.js:317-346"). Evidence: `kit.juice.shake()` and `kit.juice.hitStop()`
  both open with `if (!kit.juice.enabled) return;`, and the GGKit settings shell
  has always rendered a persistent "Screen shake" row backed by the
  `gg-horde-meridian-ui` preference; the game's own settings entry point appends
  to that shell rather than replacing it, so fullscreen was an addition, not the
  whole menu. The half that was correct - the damage vignette and the
  invulnerability blink ran unconditionally, because they are raised directly in
  the game and not through `kit.juice` - has been implemented above.

### Deferred

- **Code review MINOR 8, out-of-order music requests.** The defect is entirely
  inside `/play/_shared/ggkit.js` (`music()` commits whichever decode promise
  resolves last rather than the latest requested stem). GGKit is shared runtime
  across every title and is out of this title's lane, so it is not patched here.
  It is also unreachable in this build in practice: both stems are fully decoded
  during the title screen by the audio prewarm, so by the time danger can
  request `musicHeat` the buffers are resolved and `load()` returns
  synchronously. The correct fix is a monotonic request token in GGKit, in a
  shared-runtime lane.
- **QA ART gate, before/after screenshot pair.** Needs an authentic prototype
  "before" capture staged into `review_evidence/aaa/horde-meridian/`, which is
  outside this title's directory and is harness/evidence work, not game code.
- **QA ART/AAA evidence, staged pressure captures** (dense horde, elite, player
  hurt, projectile/gem overlap, draft, boss telegraph, death, victory). Same
  reason: evidence staging outside the lane.
- **QA UX/PWA and SHIP, deployed-HTTPS gate rerun.** The service worker only
  registers over https, so `pwa_sw` cannot pass on `localhost` by construction.
  Rerunning against the deployed origin requires a deploy, which this fix round
  is explicitly forbidden from doing.
- **QA SHIP, ledger `Used by` update.** `/play/_assets/LEDGER.md` is a shared
  path outside this title's lane. LICENSES.md Rev 2 now names the exact row
  (`Kenney ui-pack`), the exact upstream files and the subset command, so the
  ledger side is a one-line edit to that row's `Used by` column by whoever owns
  the shared path.
- **Feel gate rerun.** Not meaningfully measurable on this box right now. During
  this round the machine carried a load average of 44 (a large concurrent review
  batch), and under the identical harness a BLANK canvas page - a single moving
  rectangle, no engine - measured 17/600 and then 38/600 frames over 33 ms with
  a 366 ms worst frame, against a gate budget of 6/600. The game measured 28/600
  worst 233 ms in the same window, i.e. within noise of a page that does
  nothing. The frame deltas are also all exact multiples of 16.7 ms with the
  main thread over 20% idle and no game function above 4.5% self time, which is
  the signature of dropped presentation frames rather than long JS work. The two
  fixes above were therefore chosen from profile evidence (Phaser's
  `Text.updateText` re-rasterise cost, and the first-level-up overlay build
  landing inside the measured window) rather than from the spike count. The gate
  needs a rerun on an uncontended box before any further feel work is justified.

## Fix round 2

### Implemented

- Replaced the hero's circular wedge with an authored interceptor silhouette in
  the existing atlas slots: visible cockpit canopy, twin engine nacelles,
  swept wings, hard keel, panel lines, light-side bevel, and a readable hurt
  state.
- Added render-only motion response: thrust scales the existing pooled flare
  trail and ship glow, the ship banks into heading changes, idle frames breathe,
  and low integrity recolors the ship body. No per-frame allocations or text
  rerasterization were added.
- Re-authored every enemy family and the Meridian Core in the same atlas. The
  roster now reads as a hostile mechanical faction with authored silhouettes:
  drift prism, sprint lance, armored bulwark, armed sapper, orbiting weaver,
  ranged lancer, and escalated Core. Existing elite aura, crown, threat bar,
  hit flash, recoil, death husk, and boss wind-up hooks remain intact.
- Kept hitboxes, behavior, gameplay, feel, balance, audio, UI, environment,
  FX systems, GGKit lifecycle, pooling, and the Fix round 1 repairs unchanged.
  `LICENSES.md` now records the round 2 atlas replacement and `sw.js` is
  versioned as `2026-08-07b-fix2`; the precache file set is unchanged.

### Design notes

1. The ship is a compact Warden interceptor with a broad swept wing planform
   and a forward canopy that reads at portrait scale.
2. Twin nacelles and amber exhaust separate propulsion from the cyan hull, so
   thrust and bank read as motion rather than a generic arrow rotation.
3. Dark plated structure, panel seams, and a bright nose light give the hero a
   directional light read while preserving the teal player color language.

### Deferred

- The required clean boot and 20-second scripted visual play could not run in
  this sandbox: the in-app browser backend had no available browser, Chrome
  aborted on launch, and the sandbox rejected opening the local HTTP port used
  by `hm_playtest.mjs`. `node --check`, atlas-frame validation, and payload
  budget validation passed locally.

## Feature round 1 - bonus weapons

### Implemented

- Added pooled, friendly field pickups for Purge Wave, Aegis, Overdrive, and
  Arsenal using the existing authored atlas glyphs with teal and amber shells.
- Purge Wave clears ordinary enemies, gives the Meridian Core 38% max-integrity
  damage without a one-shot, adds a full-screen pooled shockwave, and preserves
  the existing kill, gem, score, and cadence effects. Reduced motion lowers its
  ring, flash, particles, and shake.
- Aegis lasts 6 seconds, stacks to 9 seconds, blocks damage, destroys enemies
  on contact, and damages the Core on a capped contact cadence. Its shield and
  shrinking timer ring follow the ship.
- Overdrive lasts 8 seconds, stacks to 12 seconds, raises move speed by 42%,
  and uses capped acceleration and braking while active. Thrust FX intensify.
- Arsenal lasts 10 seconds, stacks to 14 seconds, increases weapon damage,
  fire cadence, spread, and projectile count, and changes player projectile
  skins to the amber shard language.
- Drops magnetize within close range, blink during the final 4 seconds of a
  22-second lifetime, never duplicate the same live pickup, and merge active
  timers into one capped HUD slot. The HUD uses five timer pips per active
  power and `setTextIfChanged` for its seconds readout.
- Pickup, activation, and expiry cues use GGKit audio buses through the
  existing unlock, pulse, and click cues. No new asset files were added.
- `sw.js` is versioned as `2026-08-07c-bonus-weapons`; its precache file set is
  unchanged because the feature reuses existing assets.

### Drop-rate table

| Moment | Rule |
|---|---|
| Early taste | Guaranteed on the first eligible kill at 18 seconds or later after at least 2 kills; Purge is excluded from this first drop. |
| Normal chance | 0.22% base per eligible kill, plus up to 0.45% from wave pressure and up to 0.35% from the kill streak. |
| Roster weight | Purge 8%, Aegis 34%, Overdrive 30%, Arsenal 28%. |
| Safety cap | At least 14 seconds between drops, at most 8 drops per run, and at most 7 pooled field slots. |
| Stacking | One active timer row per power; recollecting adds its duration up to the stated cap. |

### Deferred

- Live browser verification of all four pickup effects could not run because no
  browser connector was available and the sandbox rejected the local HTTP
  server. `node --check` passed for changed JavaScript, atlas glyph validation
  passed, all precache paths resolved, and the total payload remains 1,514,741
  bytes with a 348,623-byte largest file.

## Feature round 1b - wingman formation

### Implemented

- Added `Wing` to the existing pooled bonus pickup roster. The rebalance is
  Purge 6%, Wing 12%, Aegis 32%, Overdrive 28%, and Arsenal 22%. Wing is
  excluded from the first early-taste drop and cannot drop after the formation
  reaches three ships.
- Added a fixed three-slot wing pool using the authored `wingman` atlas frame.
  The slots are echelon left, echelon right, and trailing. Wingmen follow with
  fixed-step smoothing, retain their slots across waves, compact after a loss,
  and reset with the run without changing save data.
- Wingmen share the Bolt Lance cadence, fire from their actual slots with
  widened volley angles, deal 56% of the leader's lance damage, and use the
  existing Arsenal projectile and amber boost language.
- Enemy bodies and enemy bolts can be intercepted by a wingman. A loss reuses
  the pooled ring, husk, particle, audio, and text vocabulary at a smaller
  scale. Aegis protects wingmen and preserves the existing boss contact cap.
- Added the always-readable three-pip formation HUD near the existing bonus
  row. The service-worker version is now
  `2026-08-07d-wingman-formation`; the precache file set is otherwise
  unchanged.

### Formation and balance notes

- Wing ships are subordinate at 0.62 base render scale with a narrow hull,
  trimmed wings, one nacelle, teal body, and amber trim. The hero remains
  larger and above them in the render stack.
- Arsenal makes the full formation feel powerful through shared cadence and
  boost visuals, while the 56% wing damage, three-ship cap, rare roster weight,
  and existing enemy pressure keep it from becoming a second full weapon set.
- Interception uses the wing's real slot hit circle. A body contact is absorbed
  by one wing and receives a short contact cooldown; a bolt is consumed by the
  wing. This keeps existing enemy movement and hitboxes unchanged.

### Deferred

- Live browser verification of pickup, formation, shared fire, and intercept
  death could not run because no browser surface was available:
  `agent.browsers.list()` returned `[]`. Static verification passed:
  `node --check game.js`, `node --check sw.js`, atlas bounds and frame checks,
  precache resolution, feature-path assertions, and payload limits. The final
  payload is 1,529,869 bytes with a 348,623-byte largest file.

## Polish round - bigger everything

### Implemented

- Expanded the friendly bonus roster with six original-IP extras, each using
  one existing authored glyph: Arc Link (three-hop chain lightning), Time
  Dilation (enemy slow-mo), Magnet Surge (wide gem pull), Decoy Beacon (enemy
  retarget), Orbital Lance (pooled telegraphed line nuke), and Score Flare
  (score gain banked while active). Purge, Aegis, Overdrive, Arsenal, and Wing
  remain intact.
- Extended the active boost HUD to eight pooled timer slots in a readable
  two-row grid. Added pooled activation edge glow, arc lines, strike line and
  flash, decoy beacon, and purge ring layers. Reduced motion lowers or removes
  the new optional flash, shake, ring, particle, and phase choreography.
- Enlarged elite and Core death beats, damage flashes and squash reactions.
  Purge now has a pre-flash handoff into expanding ring layers. Core phase
  changes at the two integrity thresholds with authored rings, burst, smoke,
  banner, and readable phase escalation. Wave banners now enter with a larger
  eased scale-and-slide beat, and level-up cards enter through a pooled overlay
  scale beat.
- Expanded the arena from 2,600 to 4,200 world units. Three concentric sectors
  at radii 680, 1,320, and 1,900 add relay pylons, recomposed wreck landmarks,
  nebula pockets, sector rings, three parallax star layers, and 28 drifting
  debris shards. Added a pooled 32-dot radar that clamps distant enemies to its
  rim, with elite and Core priority, so enemies remain findable while the
  camera pans through the larger space.
- Existing wave rows, enemy families, movement profiles, hit circles, and
  pressure cadence remain unchanged. Spatial scaling changes only the player
  and enemy arena clamp from the old edge to the new edge. The requested
  Dilation and Decoy boosts are the only new enemy-motion exceptions: Dilation
  slows enemy movement and cooldown clocks, while Decoy changes their target
  point; player contact and hitbox resolution remain against the player.
- All new play FX are scene-time pooled. No new asset files were added, so the
  existing LICENSES.md provenance ledger remains complete. `sw.js` is bumped to
  `2026-08-07e-polish-bigger-everything`; its precache list is unchanged.

### New drop table

| Moment | Rule |
|---|---|
| Early taste | Guaranteed on the first eligible kill at 18 seconds or later after at least 2 kills; Purge and Wing remain excluded from this first drop. |
| Normal chance | 0.30% base per eligible kill, plus up to 0.50% from wave pressure and up to 0.40% from the kill streak. |
| Roster weight | Purge 6%, Wing 8%, Aegis 18%, Overdrive 15%, Arsenal 14%, Arc Link 12%, Time Dilation 9%, Magnet Surge 8%, Decoy Beacon 5%, Orbital Lance 4%, Score Flare 7%. |
| Safety cap | At least 14 seconds between drops, at most 10 drops per run, and at most 7 pooled field slots. |
| Stacking | Timed boosts merge into one capped row; Wing remains a three-ship formation cap; instant Purge and Orbital Lance resolve once on pickup. |

### World-scale notes

- The 4,200-unit arena uses `EDGE = 2,060`; spawn placement still stays in
  the existing 400 to 660-unit band around the player, so exploration grows
  without thinning the approved pressure curve. The boss still lands on the
  Meridian mount at origin.
- The radar is screen-space and pooled, while dressing, stars, debris, and
  landmarks are camera-culled. This preserves the prior parking discipline,
  `setTextIfChanged` HUD writes, and zero per-frame display allocation in the
  hot simulation path.
- Static validation passed: `node --check game.js`, `node --check sw.js`, all
  referenced atlas frames resolved, all precache paths resolved, game payload
  is 1,514,276 bytes, and the largest file is 348,623 bytes.

### Deferred

- Live browser verification and the 4x throttled feel capture could not run.
  The in-app browser reported no available browsers (`agent.browsers.list()`
  returned `[]`), and the sandbox refused the local HTTP server bind. No
  deploy or git commit was performed.

## Expansion round 2 - wings, bases, generosity

### Root cause of invisible wings

- The Wing pool, atlas frame, formation renderer, weapon volley, and HUD pips
  were present and wired. The practical failure was the drop path: the first
  eligible guarantee explicitly excluded Wing, normal bonus rolls were only
  0.30% to 1.20% per eligible kill, a 14 second spacing gate applied, the run
  cap was 10, and Wing was only 8% of the remaining weighted table. A typical
  run therefore had no reliable path to a Wing pickup. The formation was not
  being hidden by its renderer.

### Implemented

- Added a first-Wing schedule guarantee at 50 seconds, before wave 2 ends,
  even on a low-kill route. Losing the last wingman arms a 4.5 second recovery
  signal, and enemy bases provide the same persistent path. The join now flies
  in from behind the camera and snaps into the formation with a pooled scale,
  halo, and heading beat. Wing bodies and halos are larger and brighter.
- Added `window.__hm = { state }` with current wave, active buff timers,
  wingCount, live pickup records with type and position, live base records with
  type, hp, and position, plus forced-generous and force-Wing test switches.
  Records are preallocated and reused.
- Raised the bonus field pool to 12 and the per-run cap to 19. Regular drops
  use an eight second minimum spacing, a 1.20% base chance that rises with
  wave pressure and streak, and a 30 second lifetime. Instant Purge and Orbital
  Lance weights were reduced so the generous table still treats them as rare.
  Every pickup now has a larger glyph, idle bob, breathing halo, and a readable
  beacon column.
- Added three outer-sector Warden structures using the existing authored atlas
  silhouettes: Spawn Hive, Turret Bastion, and Relay Fortress. Hives stream
  guarded enemies and raise wave pressure, Bastions fire fixed heavy bolts,
  and Relays strengthen nearby hostile speed and contact damage. Each has
  pooled alarm rings, visible health damage states, a threat bar, distinct radar
  priority, and a three-stage collapse. Destruction grants a bonus pickup,
  three gem-tier reward drops, score, rings, smoke, debris, and a sector banner;
  an available Wing is guaranteed by every base kill, with the first base also
  guaranteeing the first formation path.
- Densified the 4,200-unit arena with sector-entry base banners and pooled
  convoy drift and meteor streak events. Existing GGKit lifecycle, input, save,
  audio routing, pooled objects, setTextIfChanged HUD writes, camera culling,
  and reduced-motion particle counts remain in use. No new asset files were
  added, so LICENSES.md remains complete. `sw.js` is bumped to
  `2026-08-07f-expansion-round-2`; its existing precache set remains complete.

### New drop table

| Rule | Result |
|---|---|
| First formation | Wing pickup guaranteed by 00:50, before wave 2 ends. |
| Recovery | A new Wing pickup is scheduled 4.5 seconds after the last wingman is lost. |
| Base reward | Every destroyed base drops one bonus pickup and three gems; Wing is selected while formation capacity remains. |
| Regular chance | 2.50% base per eligible kill, plus up to 3.20% from wave pressure and 2.20% from streak. |
| Spacing and cap | Eight second minimum spacing, 30 second pickup lifetime, 12 live pickup slots, 19 drops per run. |
| Instant powers | Purge weight 2.5%; Orbital Lance weight 1.8%; both remain special within the larger table. |

### Base design notes

- The Spawn Hive is a round violet Warden nest with a six-ship escort and a
  2.45 second stream cadence. A live hive adds pressure to normal wave packs.
- The Turret Bastion is a tall coral pylon with bulwark, lancer, and sprinter
  guards. Its alarm ring accelerates before each fixed heavy shot, encouraging
  an approach instead of passive orbiting.
- The Relay Fortress is a blue grated signal block with weaver, lancer, and
  bulwark guards. Hostiles within its 330-unit signal radius receive a visible
  relay state through faster movement and stronger contact damage until the
  fortress is destroyed.
- Base hp bars, alarm rings, flash tint, amber low-health state, radar marks,
  staged rings, smoke, debris, and collapse scaling are all pooled or reused.

### Deferred

- Live browser verification of the forced-generous Wing run, base combat, and
  `window.__hm.state` could not run because no browser surface was available:
  `agent.browsers.list()` returned `[]`. The local HTTP server also could not
  bind in the sandbox. The 4x throttle feel capture therefore remains for the
  dispatcher. Static checks completed: `node --check game.js`, `node --check
  sw.js`, atlas and precache resolution, source hook assertions, and payload
  limits. No deploy or git commit was performed.

## Arsenal round - weapons, powerups, drafts

### Implemented

- Added 11 equipped primary weapons on one shared pooled shot lane: Bolt Lance,
  Scatter Volley, Rail Piercer, Seeker Swarm, Plasma Mortar, Sweep Beam, Glaive
  Return, Mine Layer, Ricochet Shard, Twin Phase, and Storm Coil. Every primary
  has its own pattern, atlas or procedural-style skin treatment, routed cue,
  damage profile, and target behavior. Arsenal boosts all primary families.
- Added a separate pooled weapon-drop class with a hard ring frame, beacon
  column, idle bob, glyph, magnet pull, lifetime blink, and clean pickup swap.
  Weapon drops and draft weapon cards call the same transient `equipWeapon()`
  path. `window.__hm.state` now exposes `equippedWeapon` and the unique
  `weaponsSeen` count.
- Expanded the power roster from 11 to 20: Purge Wave, Aegis, Overdrive,
  Arsenal, Arc Link, Time Dilation, Magnet Surge, Decoy Beacon, Orbital Lance,
  Score Flare, Wing, Drone Turret, Freeze Pulse, Gem Doubler, Vampire Rounds,
  Bomb Carpet, Reflector Shell, Gravity Well, Overcharge, and Phase Cloak.
  New effects use the existing pooled shots, mines, pulses, rings, and drone
  objects. Existing Wing guarantees, recovery schedule, and generous field
  drop behavior remain active.
- Expanded the draft pool to 39 lines across weapon grants and modifiers,
  defense, mobility, formation, and economy. Cards remain cached and pooled;
  common, rare, and epic tiers now change card tint, glow, and tag treatment.
  Stacking caps remain explicit per line.
- Added `forceWeaponDrop` and `forceDraft` switches alongside
  `forceGenerousDrops`, plus `draftOptions` while a draft is open. Debug views
  remain separate arrays backed by preallocated records. No pool array is
  assigned to state or truncated.
- No new asset files were needed. `sw.js` is bumped to
  `2026-08-07h-arsenal-weapons`; its existing precache set remains complete.

### Weapon roster

| Weapon | Pattern | Read | Cue |
|---|---|---|---|
| Bolt Lance | aimed bolt line | pale bolt | shoot |
| Scatter Volley | wide spread | amber shard fan | enemy shoot |
| Rail Piercer | heavy deep-pierce line | cyan rail bolt | pulse |
| Seeker Swarm | soft homing darts | violet wisps | telegraph |
| Plasma Mortar | arcing AoE shell | orange plasma glyph | death |
| Sweep Beam | rotating short beam | teal sweep | click |
| Glaive Return | outbound and returning boomerang | gold shard | hit |
| Mine Layer | rear charge carpet | amber mine glyph | select |
| Ricochet Shard | arena-edge bounce | mint shard | wave |
| Twin Phase | parallel pair | blue bolt pair | hurt |
| Storm Coil | charged chain-on-hit shard | mint coil shard | levelup |

### New drop table

| Lane | Rule |
|---|---|
| Weapon pickup | Separate five-slot pool, 30-second lifetime, ring frame, beacon column, and magnet pull. |
| Forced weapon test | `forceWeaponDrop: true` cycles unseen weapons; a string value requests a specific roster key. It keeps spawning the next weapon after collection. |
| First variation | A weapon variation is guaranteed on an eligible kill from 00:70 if the run has only seen Bolt Lance. |
| Normal weapon chance | 0.60% base, plus up to 1.00% from wave pressure and 0.60% from streak, scaled by Drop Luck. |
| Power pickup | Existing 12-slot pool, eight-second spacing, 30-second lifetime, 19-drop run cap, weighted 20-entry roster. |

| Power group | Entries |
|---|---|
| Core | Purge 2.5%, Aegis 12%, Overdrive 10%, Arsenal 9% |
| Systems | Arc Link 8%, Time Dilation 6.5%, Magnet Surge 6%, Decoy Beacon 4%, Orbital Lance 1.8%, Score Flare 5.5% |
| Formation | Wing 8%, Drone Turret 8% |
| New effects | Freeze Pulse 5.5%, Gem Doubler 6.5%, Vampire Rounds 5.5%, Bomb Carpet 4.5%, Reflector Shell 5%, Gravity Well 5.5%, Overcharge 6.5%, Phase Cloak 4.5% |

### Draft table

| Branch | Draftable lines |
|---|---|
| Weapon grants | 11 primaries, each capped at one rank |
| Core systems | Bolt Lance, Orbit Blades, Nova Pulse, Homing Wisp, Meridian Beam, Drop Mines, Amplifier |
| Weapon mods | Cycle Tuning, Split Chamber, Payload Matrix, Vector Rails, Mass Driver, Breach Core, Critical Fuse |
| Defense | Plating, Vitality, Repair Field, Hull Reserve, Aegis Relay |
| Mobility | Thrusters, Collector, Drift Control |
| Formation | Wing Calibration, Formation Link, Wing Revival |
| Economy | Prism Cut, Fortune Relay |

| Tier | Treatment |
|---|---|
| Common | Blue card tint and standard glow |
| Rare | Cyan card tint, stronger glow, RARE tag |
| Epic | Violet-gold card tint, strongest glow, EPIC tag |

### Save fields added for the hangar lane

- None. The guarded persistent profile remains `{ gems, best, meta, runs,
  tutorialDone }`; no weapon unlocks or customization fields are persisted in
  this lane. `equippedWeapon`, `weaponSeen`, `weaponsSeen`, weapon drop counts,
  and the draft/debug switches are transient run or automation state. The hangar
  lane can extend the existing `validateSave` and `kit.save.set` path without
  migrating this round's profile shape.

### Deferred

- Live browser verification could not run. The local server bind was rejected
  with `PermissionError: Operation not permitted`, and the in-app browser
  reported `No browser is available`. The dispatcher still needs to equip three
  weapons through forced drops, open a forced draft, and confirm zero console
  errors in a live browser. `node --check game.js`, `node --check sw.js`, git
  whitespace checks, atlas reference checks, precache checks, and the 1.63 MB
  payload budget check passed. No deploy or git commit was performed.

## Hangar round - persistent upgrades and customization

### Implemented

- Expanded the old ShopScene into a portrait-safe HANGAR with MODULES,
  LOADOUT, STYLE, and CORE pages. Title and result screens now expose HANGAR,
  while FLY NOW and Enter keep the path fast for players who want to run.
- Run gems bank at `floor(run.gems * 0.75)` into the guarded profile when a run
  finishes. The lifetime balance is shown in the Hangar and the original six
  Core systems remain purchasable on the CORE page.
- Added persistent starting-primary selection from the arsenal roster. A
  weapon is selectable only after `weaponsSeen` records an encounter, and
  locked loadout cards show a dim silhouette plus ENCOUNTER TO UNLOCK.
  Encountering a weapon saves its seen flag immediately through GGKit.
- Added six permanent Hangar tracks, five tiers each. New tier effects are
  independent from cosmetics and are applied at run start only.
- Added paint, trim, and atlas hull-frame selection with immediate Hangar
  preview, idle motion, hover/tap thrust test, and matching in-run tint and
  engine glow. Paints are Teal, Amber, Crimson, Violet, Arctic, and Void.
  Frames use the authored Classic, Recon, and Vector atlas states.
- Added `window.__hm.state.hangar` with `balance`, per-track `tiers`,
  `equippedWeapon`, and `paint`, plus one-shot `forceGrantGems` support. The
  debug pickup, base, and draft views remain separate arrays from all pools.
- Bumped `sw.js` to `2026-08-07i-hangar-meta`. No new assets were needed, so
  the existing precache remains complete. The 1.65 MB payload and 299 KB game
  file remain within budget.

### Upgrade cost and effect table

| Track | Costs by tier | Effect per tier |
|---|---:|---|
| Hull | 45, 73, 118, 191, 309 | +6% max integrity; +30% at tier 5 |
| Reactor | 45, 73, 118, 191, 309 | +5% primary cycle speed; +25% at tier 5 |
| Thrusters | 45, 73, 118, 191, 309 | +5% travel speed; +25% at tier 5 |
| Magnet | 45, 73, 118, 191, 309 | +6% pickup radius; +30% at tier 5 |
| Wing Bay | 45, 73, 118, 191, 309 | Tier 1 starts one wing; each tier raises the cap by one, from 4 to 8 |
| Fortune | 45, 73, 118, 191, 309 | +6% gem value and +7% friendly drop luck per tier |

Costs use `round(45 * 1.62^currentTier)`. The base game remains winnable at
tier 0 because the unmodified ship keeps its original 100 integrity, 196
travel speed, 96 pickup radius, base primary cadence, guaranteed early wing,
and the existing generous recovery schedule. Hangar effects cap at the table
values and never alter enemy health, spawn pressure, or run length.

### Save schema

The guarded GGKit profile is now version 2:

`{ version: 2, best, meta, runs, tutorialDone, hangar: { balance, tiers,
equippedWeapon, weaponsSeen, paint, trim, frame } }`

The prior `{ gems, best, meta, runs, tutorialDone }` profile migrates once,
copying gems into `hangar.balance` and preserving the six Core module ranks.
Unknown tier, weapon, paint, trim, or frame keys reject the save before use.

### Deferred

- Live dispatcher verification remains unrun because the local HTTP server bind
  was rejected with `PermissionError: Operation not permitted` and the browser
  runtime reported `No browser is available`. The dispatcher should set
  `window.__hm.state.forceGrantGems = true`, buy a tier, change paint, restart,
  confirm the version 2 profile and zero console errors, then force three
  weapon encounters to verify the persistent Loadout list.
- `node --check play/horde-meridian/game.js`, `node --check
  play/horde-meridian/sw.js`, atlas frame checks, precache/version checks,
  `git diff --check`, and payload checks passed. No deploy or git commit was
  performed.

## Tide-turner round

### Implemented

- Added six tide-turners: Last Stand, Singularity Core, Rally Beacon, Chrono
  Rewind, Mirror Squadron, and Bounty Frenzy. They use the existing atlas
  glyphs plus pooled gold ring, crown, beacon, activation ring, rewind, black
  hole, mirror, arc, and fireworks effects. The tide class has its own gold
  HUD row, banner treatment, three-part GGKit SFX fanfare, and reduced-motion
  presentation path.
- Last Stand boosts outgoing damage for 8 seconds and adds critical-hull
  resistance scaling. Singularity Core pulls and crushes the horde for 3
  seconds before a capped detonation. Rally Beacon restores the three-ship
  formation and repairs hull. Chrono Rewind restores the highest recorded
  hull value from the last 10 seconds. Mirror Squadron runs two 40% damage
  copies of the equipped weapon for 10 seconds and removes both ghosts at the
  timer. Bounty Frenzy gives each kill a capped eight-target chain burst.
- Tide odds and presentation are surfaced through
  `window.__hm.state.tideOdds`, `window.__hm.state.lastTideTurner`, and the
  `forceTideDrop` switch. A gold-shifting edge tell appears as danger weighting
  rises. Regular bonus counters and generosity remain unchanged. Tide drops
  are separately gated to one every 90 seconds.
- No new assets were added. `sw.js` is now `2026-08-07k-tide-turners`; its
  existing precache remains complete. Total payload is 1,692,156 bytes and the
  largest file is 348,623 bytes.

### Tide odds formula

Per eligible kill, `tideOdds = 0.0012 + 0.0128 * pressure`, clamped pressure
from 0 to 1. Pressure is `0.44 * lowHull + 0.24 * liveEnemies + 0.16 * activeBases
+ 0.28 * recentWingLoss + 0.18 * localDanger`, then clamped to 1. Low hull is
the missing hull fraction, live enemies reach 1 at 120, active bases are the
three scheduled bases, recent wing loss lasts 12 seconds, and local danger is
the existing nearby-threat meter. This produces 0.12% while cruising and up
to 1.40% while drowning, with the 90-second drop gate applied afterward.

### Caps table

| Tide-turner | Numbers and boss safety cap |
|---|---|
| Last Stand | 8s; 2.25x damage at full hull, scaling to 3.15x at critical hull; resistance 48% to 70% maximum |
| Singularity Core | 3s pull; 330 radius; 440 detonation radius; total damage per target capped at 38% of max HP, including bosses |
| Rally Beacon | Restores up to 3 wings; 28 hull plus 10 per missing wing; never exceeds max hull |
| Chrono Rewind | Highest sampled hull in the previous 10s; no value above max hull can be created |
| Mirror Squadron | 2 ghosts; 40% of the equipped weapon damage; 10s timer removes both ghosts |
| Bounty Frenzy | 8s; 210 burst radius; at most 8 chain targets per kill; each target capped at 38% max HP per burst |

### Deferred

- Live browser verification and the 4x throttle feel capture could not run in
  this environment. The local server bind was previously rejected with
  `PermissionError: Operation not permitted`, and the in-app browser reported
  `No browser is available`. `node --check` passed for every changed JS file,
  atlas references, PWA version checks, payload checks, and static regression
  checks passed. No deploy or git commit was performed.

## Spectacle round

### Implemented

- Added one pooled, reduced-motion-gated spectacle lane for pickup and buff
  activation: viewport-crossing shock rings, cyan and magenta additive flash
  layers, color-matched edge washes, and oversized display banners at roughly
  60% viewport width with Back ease overshoot. Tide-turners use the longest,
  brightest treatment and the existing GGKit audio buses.
- Enlarged Purge Wave to cross the full visible diagonal, gave Orbital Lance a
  full-screen sky-split beam with afterglow, and added pooled elite debris and
  light bursts. Base collapses now add a distant light pillar and rolling
  shock ring. Boss phase changes darken the field, spotlight the Core, and
  converge pooled beams on it.
- Added x10, x25, and x50 combo slams with arena pulse waves and a pooled hero
  counter. Added springy wave banners and level-up card entrances. Score,
  combo, level, kill, and gem numerals use `setTextIfChanged` plus pooled scale
  pops without per-frame rerasterization. Tide activation and boss phase
  changes use restrained 2% to 3% camera punch zoom only when juice is enabled
  and never during the Orbital Lance telegraph.
- Added regular weighted bonus powers `Strike Wing` and `Cluster Barrage`.
  Strike Wing sends three pooled Warden bomber silhouettes across the viewport
  with edge arrows, contrails, telegraph and engine cues, and staggered carpet
  impacts. Cluster Barrage arms ten pooled bomb sites around the ship and
  resolves staggered explosions, smoke rings, and fading ground scorch. Both
  use the existing generous drop floor, receive a modest danger-weight boost,
  and cap Core damage at the Purge-style 38% per call-in.
- Added `window.__hm.state.forceSpectacle`, which sequences a tide pickup beat,
  combo x25 slam, and Purge Wave ring. Full-screen beats queue by 250 ms and
  all effects remain additive or ring-based so ship, enemies, and pickups stay
  readable. No new assets were added. `sw.js` is now
  `2026-08-07m-spectacle-strikes`; its existing precache remains complete.

### Beat inventory

Pickup and buff activation, tide-turner rescue, weapon equip, x10/x25/x50
combo milestones, elite defeat, Purge Wave, Orbital Lance telegraph and strike,
base collapse, boss phase change, Strike Wing, and Cluster Barrage.

### Deferred

- Live browser screenshots and the 4x throttle feel capture could not run in
  this environment because the local server bind was previously rejected with
  `PermissionError: Operation not permitted` and the in-app browser reported
  `No browser is available`. `node --check game.js`, `node --check sw.js`,
  atlas reference checks, precache existence checks, payload limits, and
  `git diff --check` for the changed source passed. No deploy or git commit was
  performed.

## Arsenal II round

### Implemented

- Expanded the primary roster from 11 to 21. The ten new entries are late-run
  upgraded weapons on the same shared `shots`, `beams`, `mines`, `pulses`, and
  `arcLines` pools. No per-weapon object pool was added.
- Added distinct upgraded projectile treatments, routed cues, muzzle colors,
  impact colors, and spectacle beats. Existing Arsenal scaling, projectile
  damage, speed, size, pierce, critical, and Split Chamber modifiers feed every
  new pattern. Core damage caps were not changed.
- Added gold-ring upgraded drops, gold-trimmed equipped HUD glyphs, epic draft
  cards with a larger reveal entrance, and upgraded weapon banners. The
  `forceWeaponDrop` hook accepts `upgraded`, `base`, an exact weapon key, or the
  existing boolean behavior. Forced upgraded drops bypass the wave gate only
  for verification.
- Seen flags continue through the guarded `profile.hangar.weaponsSeen` save
  field. The 21-card LOADOUT page stays scale-to-fit, keeps the existing tab
  depths and preview hit rectangle, and shows the same dim silhouette plus
  `ENCOUNTER TO UNLOCK` treatment for unseen upgraded entries.
- Bumped `sw.js` to `2026-08-07n-arsenal-ii`. No new asset files were needed;
  the updated `LICENSES.md` records reuse of the already traced atlas,
  particles, and MP3 cues.

### Per-weapon stats

`B` means the run primary base before the weapon pattern, including Arsenal and
Payload Matrix scaling. Cadence is the authored `rate` multiplier used by the
shared primary timer. The output target is the approximate 1.4x to 1.6x step
over the closest base pattern after ordinary hit coverage is included.

| Upgraded primary | Shared-lane pattern and numbers | Cadence | Output target |
|---|---|---:|---:|
| Lance Array Mk II | 3 lances at `0.52B` each, +1 pierce, convergence steering toward the nearest elite | 1.08x | 1.5x Bolt Lance |
| Nova Scatter | 9 shards at `0.34B` each; each range-end burst is `0.14B` in a 96 radius | 1.22x | 1.5x Scatter Volley |
| Rail Storm | 1 rail at `1.86B`, 4 base pierce; first kill forks two `0.42B` rails | 1.00x | 1.5x Rail Piercer |
| Swarm Matrix | 4 homing darts at `0.62B`; a kill respawns one dart at `0.82x` damage | 1.12x | 1.5x Seeker Swarm |
| Mortar Cascade | 3 arcing mortars at `0.42B`; each rolling wave deals `0.72x` shell damage | 1.05x | 1.5x Plasma Mortar |
| Prism Beam | 1 sweep at `1.28B`; first two hits refract into `0.10x` sub-beams | 1.04x | 1.5x Sweep Beam |
| Glaive Cyclone | 2 counter-orbiting glaives at `0.86B`, spiraling outward at 168 units per second | 1.05x | 1.5x Glaive Return |
| Minefield Web | 3 linked mines at `0.45B`, 116+ radius, with timed tether cascade | 1.02x | 1.5x Mine Layer |
| Ricochet Prism | 1 shard at `1.25B`, 3 base bounces; each boundary bounce splits, capped at depth 2 | 1.05x | 1.5x Ricochet Shard |
| Coil Tempest | 1 short-range bolt at `1.34B` plus a continuous second arc at `0.46x` damage | 1.02x | 1.5x Storm Coil |

### Acquisition rules

- Normal weapon and bonus drop constants remain at the generosity floor. Base
  weapons are eligible before wave 4. Upgraded weapon selection is locked out
  before wave 4, then has a 24% chance within an otherwise eligible weapon
  drop, making it the rarer lane without reducing total drop frequency.
- Upgraded weapon draft lines are hidden before wave 4 and are all `EPIC` card
  entries after wave 4. Selecting one uses the same `equipWeapon` path as a
  pickup, marks the weapon seen, and triggers the spectacle reveal.
- `window.__hm.state.forceWeaponDrop = 'upgraded'` selects the next upgraded
  entry and displays a gold-ring drop. An exact roster key still forces that
  weapon. `livePickups` reports `tier`, while `equippedWeapon` and
  `weaponsSeen` remain synchronized with the run and guarded Hangar profile.
- Collecting or drafting any upgraded primary immediately persists its seen
  flag. LOADOUT cards become selectable only after that encounter; unseen
  cards retain the silhouette and `ENCOUNTER TO UNLOCK` copy.

### Deferred

- Live browser interaction, screenshots, forced upgraded pickup collection,
  and the 4x throttle feel capture could not run. The local server bind was
  rejected with `PermissionError: Operation not permitted`; browser discovery
  returned `No browser is available` and an empty available-browser list.
- `node --check game.js`, `node --check sw.js`, the 21/10 roster invariant,
  unique upgraded cue and atlas-frame checks, service-worker precache checks,
  payload checks, and whitespace checks passed. No deploy or git commit was
  performed.

## Worlds round

### Implemented

- Expanded the authored arena from 4,200 to 12,600 units across with five
  contiguous spacescapes. The player starts in Meridian Verge and crosses
  color-wall borders into the other worlds; each entry updates the pooled
  three-layer backdrop, starfield tint, landmark language, ambient event, and
  sector banner.
- Added a fixed 28-slot landmark pool over 40 authored landmark definitions.
  Only definitions in the camera margin are unparked, and the same pool is
  recycled between worlds. Background layers are also one three-object pool,
  recolored per active region rather than instantiated for every world.
- Added a zoomed-out REGION RING radar mode with a region code and palette
  ring, plus a pooled objective compass pointing toward the nearest active
  base, next scheduled base, or Meridian Core.
- Extended `window.__hm.state` with `region` and `regionsSeen`. Added
  `forceRegionTour`, which teleports the ship to the entry side of every
  region in sequence for screenshot verification.
- Distributed five bases across the five region identities and made convoy,
  meteor, crystal-drift, and void-eddy ambient events region-aware. Enemy
  spawn placement remains local to the player, so combat pressure and screen
  density do not thin out as travel distance grows. Gems and pickups continue
  to be produced by the existing pooled kill, base, and generosity paths.
- Preserved the prior wing, bonus, weapon, draft, hangar, tide, spectacle,
  arsenal, input, save, audio, reduced-motion, `setTextIfChanged`, tab-depth,
  preview-hit, and scale-to-fit behavior. `sw.js` is
  `2026-08-07o-worlds`; no binary assets were added and `LICENSES.md` records
  the reuse.

### Region table

| Name | Palette | Landmarks | Flavor |
|---|---|---|---|
| Meridian Verge | teal, cyan, sea green | relay pylons, anchor plates, Meridian mount | stable anchor grid around the Core mount |
| Ember Drift | ember red, coral, orange | burning wreck plates, hazard rails, nebula pockets | drifting hazard streaks and red-nebula pressure |
| Crystal Shoals | arctic blue, ice cyan, pale violet | refractive shard rails, vents, crystal plates | shard drift and refraction-field read |
| Void Rift | deep navy, indigo, electric violet | fracture discs, void rails, lightning hazards | restrained vision-pocket lens and void eddies |
| Aurelion Graveyard | plum, rust, warm gold | giant derelict plates, capital hull grates, gravity-wake markers | capital-ship debris and derelict wake |

### Scaling notes

- World bounds are `WORLD = 12600` with the existing player/enemy clamp and
  400 to 660-unit local spawn band retained. The five-base schedule is spread
  across regions while the horde row, pack pressure, bonus-drop floor,
  weapon-drop floor, wing guarantees, pickup lifetimes, and pool caps remain
  unchanged.
- Starfield and debris are reseeded into the active region pool on entry,
  landmarks are camera-culled, and all new region dressing uses procedural
  palette/layout work over existing atlas and particle art. Payload is
  1,778,144 bytes; largest file is `game.js` at 408,744 bytes / 398.38 KiB.

### Deferred

- Live browser screenshots, forced region-tour interaction, and the 4x
  throttle feel capture could not run. Browser discovery returned no available
  browser surfaces (`[]`), so no visual or timing claim is made here.
- `node --check game.js`, `node --check sw.js`, region/hook/pool invariants,
  stale-dressing checks, precache path checks, and payload limits passed.
  `LICENSES.md` is Markdown and was not a JavaScript syntax target. No deploy
  or git commit was performed.

## Region warfare round

### Implemented

- The opening now sends the first forced enemy at 1.8 seconds, the first cache
  at 10.5 seconds, and the free opening strike at 5 seconds. The strike spends
  one new charge, leaves the standing two charges intact, calls the pooled
  Warden Wing, and clears the live board. Reduced-motion keeps the beat but
  uses a short, quiet sweep. Wave rows move to 18, 48, 82, 125, and 168
  seconds so the horde becomes busy one wave earlier. Tutorial coach marks
  remain active over the run.
- Added pooled region variants and authored hostile behavior: Ember Drift has
  cinder kamikazes, ash wraiths, and ember scarabs; Crystal Shoals has
  refracting shard drones, glasswing drones, and shard larvae; Void Rift has
  blink stalkers, gravity mites, and null leeches; Aurelion Graveyard has
  derelict guard hulks, salvage swarms, scrap rippers, and grave eggs;
  Meridian Verge keeps the classic roster. Variants reskin existing enemy
  movement primitives and never create a region-specific pool.
- Added five insect-readable Swarm Lords. Each has a two-phase threshold,
  telegraphed attacks, pitch-shifted existing bus cues, and pooled spectacle
  death. The shared boss treatment composites wings, abdomen, and proboscis
  over the existing atlas body so the silhouette reads at phone scale.

### Region/enemy/boss/weapon matrix

| Region | Combat roster | Swarm Lord | Regional upgraded weapons |
|---|---|---|---|
| Meridian Verge | Classic drifter, sprinter, bulwark, sapper, lancer, weaver | PROBOSCIS PRIME, latch drain and wing-buzz aura | Lance Array Mk II, Rail Storm |
| Ember Drift | Cinder kamikaze, ash wraith, ember scarab | CINDER HAEMATARCH, ember strips and dive bombs | Nova Scatter, Mortar Cascade |
| Crystal Shoals | Refracting shard drone, glasswing drone, shard larva | GLASSWING TYRANT, shot refraction and larva swarms | Prism Beam, Glaive Cyclone |
| Void Rift | Blink stalker, gravity mite, null leech | NULL PROBOSCIS, blink drain mark to outrun | Swarm Matrix, Ricochet Prism |
| Aurelion Graveyard | Derelict guard hulk, salvage swarm, scrap ripper, grave egg | CARRION QUEEN, wreck hatcheries and egg clusters | Minefield Web, Coil Tempest |

- Region bases grant one gated weapon and Swarm Lords unseal the remaining
  cache entries. LOADOUT displays `FOUND IN THE <REGION>` for unseen upgraded
  weapons. Regional weapon rewards skip held or live entries and stay within
  the same pooled weapon-drop lane.
- Arsenal III adds PRIMARY, SECONDARY, and TERTIARY slots. Slot multipliers
  are 1.00, 0.55, and 0.35 with independent cadence multipliers of 1.00,
  0.90, and 0.84. They auto-fire through the shared shot pool, whose live cap
  is 196, and all damage, Arsenal, and draft modifiers feed every slot. The
  Gun Deck hangar track costs 140 and 320 for start-of-run secondary and
  tertiary unlocks. Otherwise slots unlock at wave 3 and wave 6 or after the
  first and second regional boss kills. The rail shows lock hints, upgraded
  gold trim, and a guarded tap-to-rotate control. Duplicate pickups convert
  to gems and announce the conversion. `forceWeaponDrop` unlocks all slots
  and three collected forced drops fill three distinct slots in order.
- Bonus generosity is now `0.078 + up to 0.065` wave pressure plus `up to
  0.045` streak pressure, subject to the existing rank and hangar multipliers,
  with a four-second spacing, a 14-second/one-kill floor, and a 34-drop run
  cap. Landmark entry seeds seven pooled gems at value two per region.
  Ambient events run every 13 to 25 seconds, including base skirmishes with
  regional packs and drone markers.

### Verification hooks and file split

- `window.__hm.state` now exposes `regionEnemiesSeen`, `regionBossActive`,
  `weaponSlots`, and `slotsUnlocked`. `forceRegionTour` remains intact;
  `forceRegionBoss` accepts a region key or the current region. The debug
  state keeps the existing pool-backed inspection contract.
- `hm_data.js` holds enemy families, region and boss tables, weapon and draft
  data, drop tuning, hangar tracks, and atlas frame maps. `game.js` holds
  pooled runtime systems and rendering. `index.html` loads `hm_data.js`
  before `game.js`, and `sw.js` precaches it with version
  `2026-08-08r-region-warfare`. No new binary assets were added, so
  `LICENSES.md` remains the asset record.
- `node --check game.js`, `node --check hm_data.js`, and `node --check sw.js`
  passed. Region counts, boss-key lookups, ten distinct regional weapon keys,
  slot multipliers, atlas references, precache paths, and whitespace checks
  passed. Payload files total 1,700,938 bytes excluding NOTES and LICENSES;
  the largest file is `game.js` at 358,670 bytes.

### Deferred

- Live browser interaction, screenshots, forced collection runs, and the 4x
  median feel capture could not run. Browser discovery returned no available
  browser surface and the local server bind was previously rejected with
  `PermissionError: Operation not permitted`, so no visual or timing claim
  is made here. No deploy or git commit was performed.

## Stall fix round

### Finding -> fix

| Finding | Fix |
|---|---|
| 1. Mid-play audio decode race | Boot now awaits `kit.audio.preload()` for every registered SFX cue and both music stems before hiding the loader or starting `title`; no first-use decode is left in play. |
| 2. Arsenal III hot-path saturation | Reduced the shared projectile pool from 196 to 160, added an explicit live-shot counter, shed secondary/tertiary fire at the 136-shot soft cap, cached spread patterns, and retargeted homing shots every 120 ms instead of every simulation step. |
| 3. Ordinary-kill hit-stop | Removed the 28 ms stop from common kills. Elite, regional-boss, and Core beats retain their existing reserved hit-stop windows. |
| 4. Blur pause can stick | Removed GGKit's blur pause/resume reason; visibility remains authoritative and the existing blur input-clear path remains. |
| 5. Five-step accumulator spiral | Lowered `MAX_STEPS` to 3. Any remaining accumulator time is charged through `advanceClock()` and then discarded, preserving coarse run-clock progress without a catch-up burst. |
| 6. Orientation flap | GGKit now consults `screen.orientation`/`matchMedia()` with a dimension fallback and requires the bad portrait state to remain stable for 600 ms before pausing. |
| 7. Carrion egg pool eviction | Hatch events release the parent slot first, admit only free children, and queue overflow in a fixed hatchling pool. Carrion boss attacks also cap egg spawning to free slots and never force-evict. |
| 8. Weapon cues bypass limiter | Added a 52 ms weapon voice gate and routed primary, mirror, beam, pulse, and weapon-drop cues through it independently of semantic SFX gaps. |
| 9. Hot-loop allocations | GGKit reuses its mutable juice-frame result; hash bucket clearing uses a stable callback; HUD time formatting only runs when the displayed second changes. |
| 10. Region mutation burst | Region marks and debris reseed over successive render frames in 24-mark/6-debris batches instead of mutating all 186 objects on the crossing frame. |

### GGKit and cache notes

The shared-kit changes are conservative and backward-compatible: blur no longer
acquires a pause reason, orientation pausing is debounced, and the juice-frame
object is reused without changing the `frame()` shape. Every title service
worker that precaches `/play/_shared/ggkit.js` will pick up this shared change
on its next own `VERSION` bump: `ace-vector`, `blockborough`, `cloudhopper`,
`driftlands`, `horde-meridian`, `lunker-lake`, `rally-dust`, `redline-gt`,
`shout-it`, `skyfall-command`, `stomp-circuit`, `torque-trail`, and
`wanderlight`. The `_smoke` fixture only contains a commented placeholder and
is not a precaching title. No other title versions were bumped.

### Zoom camera notes

The mobile `baseZoom = 0.8` remains on the main world camera. After all
create-time HUD, draft, input, and pooled UI objects exist, Horde now creates a
second `uiCam`, keeps it at zoom 1 with a static screen scroll, makes the main
camera ignore scroll-factor-0 UI, and makes `uiCam` ignore world objects. The
screen-locked ground is explicitly retained on the world camera as a parallax
background. Boss telegraph objects and later pause/tutorial/result overlays are
registered with the appropriate camera, so they do not render twice. The
`window.__hm` contract is unchanged. `sw.js` is bumped to
`2026-08-08r-stall-fix-1`.

### Deferred

- `node --check play/horde-meridian/game.js`, `play/_shared/ggkit.js`, and
  `play/horde-meridian/sw.js` passed.
- Live browser playtest, screenshots, 4x throttle/frame-time capture, and
  deployed/PWA verification could not run in this round because no browser
  surface was available and deploys are prohibited. No deploy or git commit
  was performed.

## HUD one-line + freeze hunt

### HUD before and after

Before: a 78 px two-band header with hull and XP meters, a level/time/skull/gem
row, a separate score/objective row, conditional buff and tide rows, separate
WING and STRIKE rows, and a labeled three-slot weapon rail with unlock hints.

After: the live header is one 42 px primary row with a compact hull bar on the
left, timer in the center, score on the right, and inline LV, gem, and streak
chips. A single 22 px secondary row combines wing pips, strike pips, and the
three weapon glyph slots. Slot locks are only padlock glyphs; unlock details
remain in banners. The objective text line is replaced by a rotating icon and
edge chevron beside the radar. XP and skull count leave the live HUD and remain
available through pause/end data. Temporary buff and tide rows remain
conditional. The compact minimal-fade tutorial strip is retained.

### Freeze suspects and fixes

1. Banner replacement used nested Phaser tween completion callbacks. Concurrent
   WING SIGNAL, Proboscis latch, and approach events could kill an older tween
   and leave the banner dependent on a callback Safari might delay. Banners now
   use a bounded simulation-time clock with a render fallback and no completion
   callback.
2. The spectacle queue could wait on several active effects at once. It now
   records queue age and starts the queued beat after a 3 second simulation-time
   ceiling, even if a visual effect completion was skipped.
3. The Proboscis latch path was audited. It has no unbounded loop or per-frame
   tween creation. Drain is fixed-step arithmetic and damage is protected by
   the existing iframe gate. Latch, boss approach, banner, spectacle, strike,
   and hatch phases are now watchdog-tagged.
4. No separate buzz cue or render-loop audio start exists in this build.
   Telegraph and enemy-shot cues are event-only, rate-limited, and both audio
   buffers are decoded by the boot preload before a run can start.
5. All runtime while-loops were audited. The accumulator is capped at three
   steps, cluster and wave cursors are finite, and region reseeding and draft
   selection have explicit budgets or finite pools.

### Watchdog

`window.__hm.state.watchdog` is pool-backed and exposes
`{maxStepMs, lastBeatAgoMs, longSteps}`. `longSteps` holds the last five steps
at or above 8 ms as `{atRunTime, ms, phase}`. `maxStepMs` measures the largest
simulation-step wall time, `lastBeatAgoMs` is the age of the last completed
frame, and the phase tags include `boss-approach`, `latch`, `banner`,
`spectacle`, `strike`, `wing`, `hatch`, and `enemies`. The pause screen now
shows `WATCHDOG MAX STEP` on its small bottom debug line. `sw.js` is bumped to
`2026-08-08r-hud-freeze-1`.

### Deferred

- iPhone Safari verification, screenshots, headless playtest, and 4x feel
  capture remain deferred. The local server bind was blocked by the execution
  sandbox (`PermissionError: Operation not permitted`), so no browser timing or
  visual claim is made.
- `node --check game.js`, `node --check hm_data.js`, and `node --check sw.js`
  passed. `index.html` was unchanged and is not a JavaScript syntax-check
  target. No deploy or git commit was performed.

## Campaign round - 9-level progression

### Implemented

- Nine-mission campaign over the existing run engine. Levels are FULLY
  DECLARATIVE files (levels/level1.js .. level9.js) against the binding
  contract in LEVELS_SPEC.md: waves, mods, bases, scheduled Swarm Lords, a
  final encounter, 1-4 objectives, exactly 3 star rules, and up to 24 timed
  events (banners, packs, drops, gem caches, heat, callouts). No functions in
  level data; game.js validates every definition at boot and excludes a
  malformed level with a console warning.
- Campaign framework in game.js: window.__HM_CAMPAIGN (levels/start/
  totalStars), per-run schedule swap (activeWaves/activeBases/
  activeRegionBossSchedule/duration/levelMods), objective engine with an
  AREA SECURED early-complete rule (survive is a ceiling; pure-survival
  missions run the clock), star scoring (strict-before time stars), campaign
  result screen with star pips + NEXT MISSION chain, and save v3
  (campaign { unlocked, stars, bestTimes }, v2 migrates in place).
- Mission select scene (hm_campaign_ui.js, window.__HM_CAMPAIGN_UI): region
  palette cards, star pips, best times, locked states, drag/wheel scroll,
  LAUNCH MISSION, total-star header; registered as 'missions' with a
  direct-launch fallback if absent. Title gained CAMPAIGN (primary) +
  CLASSIC RUN; the classic 10:00 Core run is byte-identical in behavior
  (this.level null preserves every schedule; probe-verified 600s clock).
- Arc: First Contact (3:00 survival) -> Proboscis Hunt -> Ember Gauntlet ->
  Shoal Crossing -> Rift Passage -> Graveyard Requiem -> Siege Line (5 bases)
  -> Swarmfall (all five Swarm Lords) -> The Meridian Core (9:00, Core at
  1.35x/1.15x with two sequential Swarm Lord escorts at 0.6x).
- Debug: __hm.state.campaign {levelId, unlocked, totalStars, objectives},
  forceMission = <id> (title screen), forceCompleteObjectives = true (in-run
  instant win).

### Adversarial review round (Luna XHIGH, 5 MAJOR / 10 MINOR)

Fixed: final-Core spawn failure now retries instead of bricking the mission;
win requires the final boss (and escorts) actually dead, not merely spawned;
campaign Core death clears bossUp so later scheduled lords and waves resume;
escorts take over the boss bar once the Core is down; stale mission token
consumed on title entry; time stars strictly before; validator rejects
duplicate boss objectives and non-boolean heat/elite; mission-select mask
graphics destroyed on shutdown; objective HUD rebuilds its string only when
the displayed value changes. Spec updated where behavior was the intent:
survive-as-ceiling semantics, Meridian-has-no-variants exception.
Not fixed (pre-existing, documented): a live Swarm Lord at 600s delays the
classic Core spawn until it dies (shipped behavior before this round);
event spawnPack/spawnBase silently yield under saturated pools.

### Verification

hm_campaign_probe.mjs: 42/44 (both fails are probe draft-freeze artifacts;
dedicated L2/L9 probes cover them). L2 ends at boss death t=211 with 3 stars
and unlock persistence; L9 Core lands at 1.35x hull with sequential escorts
and the win correctly held until the full triad is dead. Zero console errors
across all runs. sw.js VERSION 2026-08-09t-campaign-9-levels; levels/ and
hm_campaign_ui.js precached.

## Retina pass 2026-08-16

- Target 390x844 CSS at DPR 3. Before ratio: 1.00x CSS-sized RESIZE baseline. After target: 3.00x, 1170/390, via `GGKit.hiDpi.resize`. Live canvas read was unavailable because no browser surface or private local listener was available.
- Recipe: `Phaser.Scale.RESIZE`, removed the ignored Phaser `resolution` config, applied `GGKit.renderDefaults`, local hi-DPI canvas baking, and recursive DPR-matched Phaser text. No factor cap.
- Gameplay screenshot and runtime backing-store measurement remain deferred. No palette change was made because the retina law identifies density, not colour depth, as the defect.

## Retina pass 2

- Delayed DPR 3 canvas ratio: not measured. The slug-derived private harness port was rejected with `EPERM`, and headless Chrome aborted before creating a page. Configured `cfg.ggDpr` is 3.00 at the audit viewport.
- Converted boot to `GGKit.hiDpi.phaser` with `Phaser.Scale.NONE`, retained render defaults and existing dense art, and replaced the ignored resolution path with dense text creation and density-aware text scaling, including campaign UI.
- Title, shop, mission, play, pause, draft, banner, and result layouts now use Phaser scale dimensions normalized by `cfg.ggDpr`; main and UI cameras set zoom and center on their viewport midpoint.
- Gameplay screenshot, render-loop probe, and movement or upgrade input proof could not be completed because the local browser infrastructure was unavailable.
