# Shout It!

A pass-the-phone party word game. Two to four teams, one phone, one hidden buzzer.

## Goal

Describe the phrase on the card to your team without saying any of its words.
The team holding the phone when the hidden buzzer goes off loses the round
point. First team to the match target wins.

## Controls

- Tap GOT IT when your team guesses right. You score a phrase point and the
  phone passes to the next team.
- Tap PASS to skip a phrase. No point, and you keep the phone.
- Swipe the card right for GOT IT, left for PASS.
- Tilt to score is optional: turn it on in Settings, then tilt the phone
  forward for GOT IT and back for PASS.
- Keyboard: SPACE / ENTER / RIGHT / UP / D / W = GOT IT.
  LEFT / DOWN / A / S / P / BACKSPACE = PASS. R = restart, M = mute,
  ESC = pause. On menu screens the same keys confirm and go back.
- Pause button is top left, sound toggle top right.

## Match flow

Set the number of teams (2 to 4), the match length (Quick 5, Classic 7 or
Marathon 10 round points) and which phrase decks are in the shuffle. Team
names are drawn from an original name pool. New decks unlock as you play
matches, and your best team phrase run is kept between sessions.

---

# Developer notes

## Build

Phaser 3.87 loaded from `/play/_shared/phaser.min.js`, GGKit from
`/play/_shared/ggkit.js`. Design resolution 390x844, portrait, `Scale.FIT`
with `CENTER_BOTH`; the page background matches the in-game gradient so any
letterbox band is invisible. Safe-area insets are applied to the canvas
parent in `index.html`.

GGKit owns: pause/resume/restart lifecycle, rotate overlay, visibility and
blur pause, guarded and validated saves, the audio buses and touch unlock,
the loading screen, the settings shell (with an extra Tilt to score row) and
the juice budget (shake behind the accessibility toggle). No second
implementation of any of those exists in this dir.

Render rules that matter:

1. Every panel, button, card face and pill is a **baked texture** created
   once (`Graphics.generateTexture` or a `CanvasTexture`) and reused as a
   tinted `Image`. Phaser re-tessellates a `Graphics` command buffer every
   frame. The only per-frame vector redraw left is the tension ring, and
   that is skipped on frames where nothing about it changed.
2. **Overdraw is the frame budget.** The gate renders through software GL,
   so every large additive layer costs milliseconds directly. The background
   is ONE opaque baked image (gradient, blooms, vignette and grain all
   resolved at bake time); the card is ONE image with its drop shadow baked
   in; there is no full-screen ADD blending in the steady state; MSAA is off
   (`antialiasGL: false`) while texture filtering stays linear.
3. **FX are pooled.** Bursts recycle a fixed pool of primitive quads driven
   by one integrator, so a celebration allocates nothing.
4. Boot work is split one bake per frame rather than one monolithic
   `create()`, which is the largest single spike a Phaser title can produce.

## Preserved prototype behaviors (regression checks)

- Hidden round clock, 45 to 75 seconds, never shown as a number. The
  difficulty ramp only tightens the upper bound (75 down to 55 by round 6);
  the band always stays inside the original 45 to 75.
- Accelerating tick: interval `max(0.11, 1.10 * 0.085^progress)`, exactly the
  prototype curve, with a higher pitched tick once the clock enters the danger
  window.
- GOT IT scores a phrase point, then hands the phone to the next team.
  PASS skips with no point and the holder keeps the phone.
- Handoff curtain: 1.35 s, fully opaque and input-blocking for its whole
  life, releasable early by a tap after 0.45 s. CHANGED in fix round 1: the
  round clock is now HELD for the curtain instead of running through it, so
  the buzzer can no longer fire while the phone is covered (code review
  MAJOR 2). Everything else about the handoff is unchanged.
- At the buzzer the holder loses the round point and the phone passes on.
  With two teams the other team scores, exactly as before; with three or four
  teams every team except the holder scores.
- Deck reshuffle never repeats the phrase that was just on screen.
- Best team phrase run persists. A prototype `shoutit.best.v1` value on the
  device is migrated into the GGKit save on first run.
- Tap advances every non-gameplay screen; the full prototype key map is
  intact (see Controls).

## Content inventory

- 8 original phrase decks, 417 phrases total, no duplicates:
  Everyday Objects 52, Made-Up Movies 52, Animal Situations 52,
  Food Mashups 52, Around Town 52, Feelings and Moods 52,
  Sports and Sillier Sports 53, Gadgets and Glitches 52.
- Decks 1-6 are the prototype's 261 phrases plus top-ups; decks 7 and 8 are new.
- Meta progression (GGKit save, schema validated on load): matches played,
  rounds played, phrases guessed, best team run, tutorial seen, team count,
  match length, selected decks, tilt preference. Deck unlocks by matches
  played: Food Mashups at 1, Around Town at 2, Made-Up Movies at 3,
  Sports at 5, Gadgets at 7. Objects, Animals and Moods start unlocked.
- Interactive first-run tutorial: four steps on the live board, two of which
  require the real GOT IT and PASS taps, with a skip button.
- Time to exhaust: a Classic match (first to 7) runs 9 to 14 rounds of 45 to
  75 s plus summaries, about 12 to 16 minutes. Quick, Classic and Marathon
  lengths, 2 to 4 team setups and 8 decks put full content well past 20
  minutes; unlocking every deck takes 7 matches.
- Difficulty ramp: round length upper bound drops 4 s per round to a floor of
  55 s, and the tick curve compresses as the round progresses.

## Audio inventory

Two music tracks plus sixteen distinct SFX, all mp3 (mono, 40 to 96 kbps)
per the audio format law. Music lazy-loads on the first interaction; SFX are
pre-decoded during the loading screen.

- Music: `music_lobby` (menus, setup, summaries), `music_round` (gameplay).
- SFX: tap, select, back, got (correct stinger), pass, tick, tickHi (danger
  tick), buzzer, fanfare (round end), win, card (deal/flip), shuffle,
  handoff, unlock (deck unlocked), countdown (round start and score reveal),
  crowd (the murmur bed).
- The crowd bed is retriggered on the GGKit sfx bus every 3.6 s with its own
  level, rising with round tension and ducked to 35 percent for 0.45 to
  0.7 s under every stinger. It is a separate control, not a second audio
  implementation: GGKit remains the only audio graph in this title.

## Art and FX

- **No bitmap game art ships.** Every card face, card back, deck motif,
  panel, button, mascot and FX primitive is drawn procedurally into the
  texture manager at boot. The only PNGs in the payload are the PWA icons.
- The card face is an authored paper stock: warm vertical ramp, upper-left
  key light, fibre grain, bottom shade, a bright inset edge and an ink
  hairline keyline, plus a baked soft shadow. The card back is an original
  reversible pattern (the tile grid is drawn once and again rotated 180
  degrees, so a face-down card leaks no orientation) with a symmetric centre
  emblem. Eight original deck motifs mark the band and the card corner and
  double as the deck-select tiles.
- Card states: idle float, drag tilt with resistance, snap-back overshoot,
  throw-right (accept), throw-left (pass), deal-in face down, and a real
  flip through zero with a leading-edge highlight where the new phrase only
  exists past the midpoint. The mascot has idle bob, shout squash, sulk and
  cheer.
- Five pooled primitive FX families (correct, pass, buzzer, victory, swipe),
  10 to 16 instances per burst, built from strips, diamonds, triangles,
  rings and burst arcs, team-aware and visibly distinct in shape, colour and
  physics; plus expanding shockwaves and one ambient mote emitter.
- Tension timer: a 64 px ring on a four-state machine (calm, tension,
  imminent, contact) that drives colour, squeeze, the dot glyph, the label
  and the tick rate/pitch/volume together. Buzzer impact runs the house
  three-beat: anticipation, 60 ms cosmetic hit-stop with a contact flash and
  burst, then one-overshoot recovery.
- Sequenced summaries: the round board reveals loser, award, rows, counted-up
  scores and the winner accent before the call to action; the match board
  runs winner lockup, mascot cheer, staggered count-up, and fires the final
  confetti on the last score landing.
- One reduced-motion policy: the GGKit accessibility toggle gates shake,
  flashes, every particle burst, ring pulses, mascot spins, idle loops, the
  tutorial hand and all staggered reveals. Reduced mode keeps every piece of
  information and drops only the movement.

## Known limitations

- Tilt to score is off by default and is best effort: it re-baselines after
  every action and every handoff and needs the phone returned to neutral to
  re-arm. Beta deltas are normalised to the shortest signed angle. On iOS the
  setting is only saved once the motion permission actually returns granted;
  a denial leaves tap and swipe as the full-featured path.
- Team names come from a curated original pool with a reshuffle each match;
  there is no on-screen keyboard for custom names.
- The service worker only registers over https, so offline play starts from
  the first https visit.


---

## Fix round 1

Scope: the three read-only reviews (code, QA six-gate, art/FX/design) plus the
failing `feel_no_spikes` carry-in. Every CRITICAL and MAJOR is implemented,
plus every MINOR except the three evidence/ledger items listed as deferred.

Re-measured on the exact harness (`aaa/harness/gate.mjs`, 4x CPU throttle,
390x844, DPR 2, local server): **feel_no_spikes now 0/600 frames over 33 ms,
worst 33.3 ms** (was 114/600, worst 250.1 ms); median holds at 16.7 ms; zero
console errors; zero failed requests; payload 1016 KB, largest file 302 KB.
Every automated check passes except `pwa_sw`, which is https-only and cannot
pass from a local server.

### Implemented

Code review, CRITICAL

- Answer leaks during the handoff curtain -> the curtain's backdrop is opaque
  and visible on the frame it is raised; only the non-sensitive furniture
  (glow, phone, names, note) fades in behind it.

Code review, MAJOR

- Deck unlock order-dependent -> newly unlocked decks are resolved by
  `d.unlockGames === SAVE.games` after the increment, never by slicing the
  content-order array, so a deck the player deliberately turned off is never
  silently re-enabled.
- Round clock runs during the handoff -> the clock is held for the entire
  curtain and resumed on dismissal, so the buzzer cannot fire while the phone
  is covered. The curtain copy changed from "the clock is still running" to a
  tap-to-continue prompt to match.
- Keyboard and tilt unlock before the curtain disappears -> `canAct()` fails
  while `handoff > 0`, the curtain's backdrop is an input-capturing layer, and
  both score buttons carry a `blocked()` predicate on top of that.
- Pass then Got It double-commits -> one central action transaction lock. Any
  committed action locks the turn immediately and unlocks only after both the
  card transition and the curtain have finished; `card.busy` is also part of
  `canAct()`.
- Score controls without per-pointer identity -> the shared press component
  records the pointer id on press and commits only for that same pointer;
  card drags are bound to their own pointer id; the action lock still allows
  exactly one committed action per card.
- Pause does not clear Phaser press state -> every press registers a releaser
  in one registry; GGKit's `onPause` and `onRestart` release them all, and
  `pointerupoutside` / `pointerout` / `pointercancel` release without
  committing.
- Tilt setting does not sync, iOS permission ignored -> the setting, the
  permission result and the live listener are one transaction: the preference
  is written only when permission returns granted, and the active scene starts
  or stops its listener immediately. Denial leaves tap and swipe intact.
- Tilt baseline/debounce not reset -> `tiltRebase()` after every action and
  every handoff; the gesture must return to neutral to re-arm; beta deltas are
  normalised to the shortest signed angle so a swing across +/-180 cannot fake
  an action.
- Action acceptance not tied to a real deadline -> the round clock is a
  monotonic `performance.now()` deadline, held on scene pause and on the
  handoff and resumed on the far side, and `canAct()` checks the remaining
  time inside every action path.

Code review, MINOR

- Save validation -> `tutorial` and `tilt` must be `0|1`, deck ids must be
  known, unique and bounded by the deck count.
- Legacy score migration -> the prototype key is read once, written straight
  through `kit.save.set` and then removed; GGKit is the only storage owner.
- Em dash in public metadata -> replaced in `index.html`.
- Rotate/visibility pause raised before Phaser existed -> `syncPause()` runs
  on `Phaser.Core.Events.READY` and again on every scene entry.

QA gates

- AUDIO (critical): every `.ogg` reference is gone from `LICENSES.md`;
  attribution is codec-neutral and states that only mp3 transcodes ship.
- CONTENT: covered by the save-validation and deck-unlock fixes above.
- UX/PWA: fullscreen is wired into Settings as its own action row.
- SHIP: em dash replaced; `sw.js` VERSION bumped to 1.1.0 and its asset list
  updated for the removed images and the added crowd bed.

Art/FX/design, CRITICAL

- Primitive-only focal surfaces -> authored card art. The face is a real
  paper stock (warm ramp, upper-left key light, fibre grain, bottom shade,
  bright inset edge, ink hairline keyline, baked soft shadow); the back is an
  original reversible pattern with a 180-degree-symmetric centre emblem;
  eight original deck motifs mark the band and the card corner. Menu panels
  gained layered lighting (fill, top gloss, hairline edge) instead of flat
  rectangles.
- Stock loading screen -> a branded loader: the SHOUT / IT! lockup, an
  animated megaphone mark, a themed progress track with a moving sweep and a
  "shuffling the decks" tagline, safe-area aware. GGKit still owns the loader
  lifecycle; the title only re-skins the shell it creates.
- VFX violate the house pattern -> all PNG particle sprites deleted from the
  payload. Five pooled primitive families (correct, pass, buzzer, victory,
  swipe) built from strips, diamonds, triangles, rings and burst arcs, 10 to
  16 instances per burst, team-aware tints, and distinct shape/colour/physics
  per event, plus expanding shockwaves on contact beats.

Art/FX/design, MAJOR

- Timer state machine -> explicit calm / tension / imminent / contact states
  drive ring colour, squeeze, dot glyph, label and the tick rate, pitch and
  volume together. (Two sub-points disputed, see below.)
- Timer too small -> the ring is now 64 px across with a 9 px stroke, sitting
  on a track ring, with a three-dot state glyph in the centre and a state
  label under it.
- Audio escalation not synchronised -> tick and ring now read the same state.
  A crowd murmur bed ships (`sfx_crowd.mp3`, original, synthesised) on the
  GGKit sfx bus with its own level, rising with tension and ducked under
  every stinger.
- Card flip is a squash swap -> throw out, deal the next card in FACE DOWN,
  then a real flip: leading-edge highlight, scale through zero about the
  card's own centre, new phrase revealed only past the midpoint, shadow and
  resting place preserved (the shadow lives on the container, only the
  flipper scales).
- Buzzer lacks three-beat choreography -> anticipation (the imminent state
  arms a full second of red pulse and a rising tick), a 60 ms cosmetic
  hit-stop with a white contact flash and a burst plus shockwave, then a
  one-overshoot spring recovery on the card and the ring.
- Pass-the-phone screen generic -> a composed privacy moment: team-coloured
  wash, "COVER THE SCREEN" / "ANSWER HIDDEN" lockup, a phone showing the card
  back with an animated hinge edge, a directional arrow sweep, "PASS THE
  PHONE TO / [TEAM] / YOUR TURN", and tap-to-release after 0.45 s.
- Round summary static -> sequenced: buzz pop and shockwave, mascot sulk, who
  was caught, who scored, staggered rows, per-team count-up with ticks,
  winner-row accent, then the call to action last.
- Final scoreboard incomplete -> winner lockup, mascot cheer, staggered rows
  with counted-up phrases and points, and the confetti burst timed to land on
  the final score rather than starting independently.
- Onboarding is a copy overlay -> four themed coachmarks with a real
  spotlight cut (four dim bars plus a pulsing halo around the live element),
  a step indicator (dots plus "n OF 4"), an animated hand on the two steps
  that require a real tap, a live card-flip demonstration on step one, and an
  explicit privacy-screen beat captioned on the curtain itself.
- Deck chooser has no art -> every deck row carries a card-back tile with its
  own motif, with locked, selected and pressed states.
- Four-team HUD unreadable at 390 px -> a two-column HUD, auto-fitting
  tracking with truncation as a last resort, and a segmented meter with an
  "n/target" count replacing the hairline pip ladder. The "has the phone"
  banner folded into the active pill as a caret, freeing the vertical space.
- Typography not one scale -> one role table (display 62, h1 38, btnLg 30,
  h2 27, h3 20, btnSm/body 15, small 13, label 11, micro 10) with weights,
  tracking and explicit line heights, plus a bounded five-step phrase display
  ladder (46/39/33/28/24). No call site invents a size outside the table.
- Settings breaks the visual language -> the GGKit settings shell is re-skinned
  to the title's palette, type and radii. GGKit remains the only settings and
  lifecycle implementation.
- Feel gate -> see the measurement above. The wins were: baking the whole
  background (gradient, blooms, vignette, grain) into one opaque image
  instead of three live additive blooms; folding the card shadow into the
  card texture so the focal object is one quad; removing the full-screen
  tutorial dim in favour of the spotlight bars; pooling FX instead of
  spawning emitters; splitting boot bakes one per frame; and turning MSAA off
  while keeping linear filtering.
- Motion reduction incomplete -> one `motionOK()` policy gates shake, every
  flash, every particle burst, ring pulse, mascot spin, idle loop, tutorial
  hand and every staggered reveal and count-up. Reduced mode keeps all the
  information and shows the final values immediately.
- Tap feedback not universal -> one shared press component on buttons, icon
  buttons and deck rows, at the house 0.96 press scale with an ease-out-back
  release pop.
- Safe-area stops at the wrapper -> a content bound of 806 in design units is
  now respected: tutorial skip 806 -> 762, match-screen bottom row 786 ->
  772, deck chooser DONE 790 -> 772, how-to BACK 776 -> 770.

Art/FX/design, MINOR

- Default easing -> explicit ease-out cubic on the handoff and summary fades
  and slides, ease-out back on modal and celebration entries; the pause menu
  gained a slide-and-fade enter and exit with one controlled overshoot.
- Secondary text too dim -> the dim ramp was raised (#a99ad4 -> #c2b6ea) and
  every 0.26 to 0.35 alpha white label was replaced with a real colour token.
- Colour semantics compete -> the four saturated team hues are now reserved
  for team identity alone. Calls to action are neutral paper with ink labels,
  the brand accent is violet, the buzzer state is crimson (moved off coral),
  and gold was removed from the palette entirely.
- "MATCH LENGTH" is misleading -> renamed "MATCH TARGET", and the hint reads
  "First to N points wins."

### Disputed

- Art MAJOR, "use `M.left <= 5`" for the danger state. The round clock is
  hidden by design and never resolves to seconds on screen (`MIN_T`/`MAX_T`
  are 45/75 and the number is never drawn); `M.left <= 5` is only knowable
  from the drawn round length, so wiring the visual state to it would leak
  the buzzer. The intent behind the finding is implemented instead: the
  state machine escalates at `IMMINENT_AT = MIN_T - 4`, the first instant the
  buzzer can actually land, and the label says "BUZZ ANY MOMENT" rather than
  implying a countdown. The rest of that finding (explicit calm/tension/
  last-state colour, scale, pulse and label) is implemented.
- Art MAJOR, "use `elapsed / M.dur`" for the arc. Same reason: an arc scaled
  to the drawn round length completes exactly at the buzzer, which turns the
  ring into a visible countdown and removes the title's central mechanic.
  The arc stays on `elapsed / MAX_T`, which is honest about the possible
  window without revealing the draw. Everything else in that finding (size
  64 px, heavier stroke, readable centre state and label) is implemented.

### Deferred

- ART gate, before/after evidence shots. Evidence artifacts live under
  `review_evidence/aaa/shout-it/`, outside this title's directory, and this
  round is scoped to `play/shout-it/`. The rerun above regenerated the gate
  frames; a prototype before-shot has to come from the gate runner.
- UX/PWA and SHIP gates, deployed-HTTPS rerun and `pwa_sw`. Service worker
  registration is https-only by design and this round is explicitly no-deploy,
  so `pwa_sw` and the offline-reload check cannot be satisfied from a local
  server. Everything else in both gates passes locally.
- `/play/_assets/LEDGER.md` pending "Used by" rows. The ledger is a shared
  file outside this title's directory. Note for whoever updates it: this
  title no longer uses ANY image pack row (all five Kenney particle PNGs were
  deleted with the FX rebuild); the audio rows are unchanged, and one new
  original file, `sfx_crowd.mp3`, has no pack row because it is synthesised.

## Simplify round - party loop

### Implemented

- Recentered the game on the classic pass-the-device loop: one hidden random
  round clock, aloud clue giving, NEXT to hand the device to the next team,
  SKIP for a new clue, and the holder caught by the buzz gives every other
  team one point. First to 7 points wins.
- Kept the category picker on one compact screen, with all eight categories
  available, 2 to 4 team selection, seven score pips per team, and the GGKit
  settings sheet. The clue text uses the large display ladder and a 344 px
  card so it remains readable at 390 px from arm's length.
- Kept the hidden monotonic deadline and held it during the opaque, input
  blocking PASS TO TEAM beat. The beat lasts 1.35 seconds and accepts an
  early tap only after 0.45 seconds. The central action lock still prevents
  duplicate pointer or keyboard commits.
- Kept the accelerating GGKit SFX tick buses, danger tick, buzzer flash,
  pooled burst and shockwave FX, point award beat, reduced motion policy,
  pooled renderer objects, and the `window.__si` hook with `state.mode`,
  `state.clue`, `state.scores`, `state.timerRunning`, and a `forceBuzz`
  switch.
- Made all phrase categories family-safe and original. Counts are: Everyday
  Objects 52, Made-Up Movies 52, Animal Situations 52, Food Mashups 52,
  Around Town 52, Feelings and Moods 52, Sports and Sillier Sports 53, and
  Gadgets and Glitches 52. Total: 417 clues.
- Bumped `sw.js` to version 1.2.0 and kept its precache list aligned with the
  shipped title and shared GGKit assets.

### Removed

- Separate how-to, deck library, deck unlock progression, round summary, and
  match summary screens.
- Quick, Classic, and Marathon target modes. The only target is seven points.
- First-run tutorial, swipe scoring, tilt scoring, visible timer ring,
  phrase-point scoring, and the old GOT IT and PASS action labels.
- The old feature-heavy board mechanics. Play now has only NEXT and the
  smaller, two-use SKIP control. A winner state remains only to close a game.

### Deferred

- Browser visual QA, the 4x feel capture, and deployed HTTPS PWA/offline
  verification were not run because this round was explicitly no-deploy.
- `node --check` passed for every changed JavaScript file: `game.js`,
  `content.js`, and `sw.js`. No browser or network test was run.

## Retina pass 2026-08-16

- Before ratio: 1.00x static FIT baseline from the 390x844 design backing store. A live pre-pass canvas readback was unavailable in this sandbox.
- After ratio: 3.00x target by factor math at emulated DPR 3, producing a 1170x2532 backing store for the 390x844 design viewport.
- Recipe: Phaser `Scale.FIT`, design coordinates preserved, scale dimensions multiplied by `GGKit.hiDpi.factor(390, 844)`, shared `GGKit.renderDefaults` merged, and zoom applied in boot, background, title, setup, play, and pause scene `create()` methods. All Phaser text uses the same factor.
- Factor cap: none beyond GGKit's default clamp to [1, 3].
- Could not do: live `canvas.width / getBoundingClientRect().width` readback, gameplay screenshot, and `retina_audit.mjs` acceptance because no browser surface was available and private port binding was denied.
