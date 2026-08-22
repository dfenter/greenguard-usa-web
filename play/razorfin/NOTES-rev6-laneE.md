# NOTES — Rev 6 Overhaul, Lane E (engine)

Scope: SPEC3D.md "Rev 6 — OVERHAUL CONTRACTS" sections 6.1 (camera), 6.2
(state bag), 6.5 (lunge/eat state), 6.6 (generosity + blood), 6.7 (powerups),
6.8 (controls). Files touched: `engine3d.js` only (abilities.js was read but
needed no changes — see "abilities.js" below).

## 6.8 Controls

- `STICK_DEAD` 0.12 -> 0.03.
- `stepControl` rewritten: `p.angle = atan2(iy, ix)` instantly when the stick
  is active; `p.vx/vy = cos/sin(angle) * speedCap * mag` direct assignment.
  Idle is a hard `vx = vy = 0` stop. No turn-rate cap, no accel lerp, no idle
  drag — `TURN_EASE_MIN/MAX` and `IDLE_DRAG` are deleted.
- **Airborne exception**: while `p.y < 0` (breach arc), `stepControl` never
  writes `vy` — neither in the direct-assignment branch nor the idle hard
  stop. Only `vx` is touched; gravity (`stepMotion`) owns `vy` exclusively
  during the arc. The speed-cap clamp at the end of `stepControl` is likewise
  vx-only while airborne.
- `ctl.turnIn` is now presentation-only: derived from the actual heading delta
  this step (`angDelta(prevAngle, p.angle)`), normalized by
  `s.turn * TURN_BOOSTA * STEP`, clamped to [-1, 1]. It only feeds
  bank/tail/pose in `stepAnim`; nothing reads it back for motion.
- Keyboard merge, 2nd-pointer boost + meter, and `liveMult`-driven `speedCap`
  are all unchanged.
- Selftest: the old "sub-dead-zone deflection does not creep" probe dragged
  to `0.05*radius`, which is now ABOVE the new 0.03 dead zone. Changed to
  `0.02*radius` per the brief.

## 6.1 Camera

- New `camZForLen(lenPx)`: `clamp(lenPx * 1.60, 185, 400)`. `camZForTier(tier)`
  keeps its exported NAME (per the contract) but now resolves a def with that
  tier from `RFD.SHARKS` and delegates to `camZForLen(sharkLenPx(def))`. The
  one call site that already had the def in hand (`startRun`) skips the extra
  tier lookup and calls `camZForLen` directly.
- `CAM_PITCH`/`CAM_LOOK_Y` (fixed px) replaced with `CAM_PITCH_FRAC` (0.17)
  and `CAM_LOOK_FRAC` (0.07), multiplied by the LIVE `z` at every camera
  write site (`startRun`'s initial placement and `stepCamera`).
- `CAM_BOB` 5 -> 3.
- Yaw orbit hint: `camState.yaw` eases at 2.5/s toward
  `headingSign * 0.13 * speedFrac` (`headingSign` reuses the same
  `cos(angle) < 0` left-facing test `renderPlayer` already uses). Applied
  only to `camera.position.x` (`yawX = camState.yaw * z`); `lookAt.z` and
  `lookAt.x` are never touched by yaw — quarter-view hint, not a chase cam.
- Lookahead 0.28s/190px -> 0.34s/150px.
- New selftest gate: `CAM_FRAME_TAN2` — the framing-fraction denominator.
  **Deviation/clarification**: the contract's worked constant "2.018" is NOT
  `2*tan(fov/2)` for fov=50 (that's 0.9326) — it is
  `2*tan(fov/2) * (CSS_W/CSS_H)`, i.e. the HORIZONTAL projection width at the
  gameplay plane, using the vertical PerspectiveCamera fov combined with the
  844:390 design aspect ratio. That product is exactly 2.0183, matching the
  contract's number. Documented inline at the constant's declaration so the
  next reader doesn't have to re-derive it.
- Framing selftest checks `sharkLenPx / (CAM_FRAME_TAN2 * z)` lands in
  [0.28, 0.34] for tiers 1 (`reef`), 6 (`megalodon`), and 12
  (`leviathanrex`) — all three pass (0.310, 0.310, 0.338; the tier-12 shark
  is at the `CAM_Z_MAX` ceiling so its fraction sits near the top of the band
  rather than the flat 0.31 the other two get).

## 6.2 State bag

- Player `st` gains: `preyNear`, `preyNearCd`, `lungeT`, `lungeCd`,
  `lungeX/lungeY` (numbers only, never an entity ref), `tooBigCd`.
- `p.anim.state` (the bag handed to `RF.Art3D.animate`) gains `vy`,
  `preyNear`, `lungeT`, published every `stepAnim`. `tailAmp`/`TAIL_AMP_IDLE`
  (0.03) / `TAIL_AMP_TURN` (0.28) match the contract numbers exactly.

## 6.5 Eat / lunge

- `stepPreyNear(p)`: refreshes every 0.25s (`PREY_NEAR_REFRESH`), true while
  an eatable target (same tier gate as the eat loop, hazards gated by
  `junkEater`) sits inside `2.2 * mouthR` (with `wideBite`'s 1.55x folded in
  first, matching the existing mouth-radius convention elsewhere in the
  file). No facing-cone gate — that's lunge's job.
- `stepLunge(p)`: an eatable target inside a cone of `±35°` off heading,
  range `2.2 * p.r`, captures the target's `(x, y)` as two scratch numbers on
  `st.lungeX/lungeY` (never the entity — pools recycle). While `lungeT > 0`
  the player accelerates at `stat.accel * liveMult(speed) * 2.4` toward the
  captured point for 0.22s, heading blends 0.35 toward the point (not an
  instant snap), then a 0.9s cooldown (`lungeCd`) before another lunge can
  fire. Airborne exception is honored here too (`vy` untouched while
  `p.y < 0`).
- `stepLunge`/`stepPreyNear` are called from `step()` right after
  `stepControl`, before `stepMotion` integrates — so a lunge's added velocity
  is part of the same frame's integration.
- `publishMouth` now sets `MOUTH.lunge` (bool) and ramps
  `MOUTH.strength` 260 -> 900 while lunging, per contract. `magnet` buff
  (6.7) multiplies `MOUTH.r` by 2.5 in the same function.
- Jaw: `stepAnim`'s jaw target is `JAW_OPEN * 0.85` (`JAW_ANTICIPATE`) on
  `preyNear` (eased `dt*10`), overridden by the existing chew-window gape
  when biting is active (that's still the bigger, more urgent signal).
  `jawSnapT` on **swallow** is now `JAW_SNAP_T` (0.12s) per contract; the
  chew-window snap in `multiBite` is unchanged at 0.18s (that's a different
  timer — the per-chew feedback cadence, not the swallow snap). While
  `jawSnapT > 0` the jaw eases toward a small negative overshoot
  (`-JAW_OPEN * 0.08`) at `dt*24`, giving the snap a little snap-back before
  the normal ease takes back over.

## 6.6 Generosity + blood

- New `BITE_UP_BASE = 1` folded directly into the ONE gate formula used by
  `stepEat`, `publishMouth` (`MOUTH.eligibleTierMax`), `stepPreyNear`, and
  `stepLunge` — there is exactly one "is this eatable" formula in the file,
  megajaw-widened or not (`megajawBiteUp()`/`megajawInstantBonus()` are pure
  reads of `ctx.run.buffs.megajaw`, not a second gate).
- Instant swallow moved from `tier <= p.tier - 2` to `tier <= p.tier - 1`
  (plus `megajawInstantBonus()`).
- TOO BIG cue: replaces the old silent `continue` on an ineligible non-hazard
  target. 0.6s cooldown (`tooBigCd`, decremented once per `stepEat` call):
  `shake(2, 70)`, a dim `ring` fxEmit at the prey's position, a 0.7-rate
  0.5-vol `chomp` sfx, and a `'TOO BIG'` toast via the existing `uiCall`
  path. Hazards never trigger it (a junkEater's silent pass-through is
  unchanged).
- Blood Frenzy trigger condition changed from the old near-tier heuristic
  (`tier > p.tier - 2`) to the contract's `tier >= p.tier` (equal-or-bigger
  kills only), still gated on the kill actually finishing (`ent.hp <= 0`).
- New scratch arrays `FRENZY_EAT_X`/`FRENZY_EAT_Y` (parallel to the existing
  `FRENZY_EAT_PACK`/`BLOOD`/`TIER`/`COMBO_T`), filled in `recordFrenzyKill`
  with the prey's `(x, y)` as numbers.
- `processFrenzyEvents`'s blood branch now fires ONE-SHOT
  `fxEmit('deathBurst', FRENZY_EAT_X[i], FRENZY_EAT_Y[i], {count:22,
  tint:0xb3122a, tint2:0x5a0812, scale:1.3})` at the PREY position. The old
  sustained `fxEmit('motes', p.x, p.y, ...)` call at the PLAYER position —
  the player-attached mist loop the contract orders deleted — is gone from
  this file. (fx3d.js's matching pool-side removal, if the old `motes`
  sustain path lived there too, is Lane F's half of the same law; nothing
  in engine3d.js calls it anymore either way.)

## 6.7 Powerups

- `ctx.run.buffs = { overdrive, shield, megajaw, magnet, chum, apex }` — HM's
  exact pattern (`run.buffs.<name>`, numeric timers, `shield` is a charge
  count not a timer). New `stepBuffs()` decays the five timer buffs, decays
  nothing for `shield` (it only decrements in `stepPlayerHits` when it
  actually absorbs a hit), and publishes the lowest-priority cue on the
  shared bus (`buffApex`/`buffOverdrive`/`buffMegajaw`/`buffMagnet`/
  `buffChum`) ONLY when `frenzyCue` is still empty — damage > frenzy >
  goldRush > buff, exactly per the contract's ordering (damage itself is the
  separate `hudHurt` edge pulse, not `frenzyCue`, so it was already
  effectively above this by construction).
- `stepPickups(p)`: a NEW, separate collection path from the existing
  coin-pickup no-op in `stepEat`/`collectPickup` (RF-COINS-01 stays
  world.js's). Queries `RF.World.query(p.x, p.y, r, 'buffpickup')` (fully
  guarded — no `RF.World.query` or no matching kind is a silent no-op) and
  applies `applyBuffPickup(id)` on overlap, then calls `RF.World.kill` (or
  degrades to `e.active = false`).
- `applyBuffPickup`: `overdrive` (8s, `+35%` speed folded into `stepControl`'s
  `speedCap`), `shield` (+2 charges, capped at 2 — HM has no explicit stacking
  rule beyond "absorbs 2 hits" so this lane caps rather than lets charges pile
  past that), `megajaw` (10s, folds `+1`/`+1` into the ONE gate formula),
  `magnet` (8s, `2.5x` `MOUTH.r` in `publishMouth`), `chum` (6s, publishes
  `ctx.chum = {active, x, y}` for World to read — a pure flag, no-op if World
  doesn't implement convergence yet), `apex` (5s, folds `overdrive` +
  `megajaw` to at least its own 5s window via `maxTimer`, which only ever
  RAISES a timer — an already-longer overdrive from a separate pickup is not
  shortened by picking up apex on top of it).
- Notable-kill buff drop: `swallow()` calls `RF.World.spawnBuffDrop(e.x, e.y)`
  (guarded) when the kill was equal-or-bigger (`tier >= p.tier`, same bar as
  Blood Frenzy) OR landed on a combo streak threshold (`FRENZY.steps`).
  World owns spawning/drift entirely per the contract; this is only the
  trigger call and is a complete no-op until Lane W implements the method.
- Superpower charge economy: `ctx.run.powerCharges` starts at
  `POWER_CHARGE_START` (3), caps at `POWER_CHARGE_CAP` (8)
  (`grantPowerCharge` clamps both directions). Earned every 8 combo
  (`POWER_CHARGE_COMBO_STEP`, edge-triggered via `_lastComboCharge` so a
  held streak doesn't grant every step) and on both frenzy completions
  (Gold Rush's first announce, Golden School's clear) via `grantPowerCharge`
  calls added at those two existing sites.
- `firePower()` now gates on `ctx.run.powerCharges > 0` IN ADDITION TO
  `RF.Abilities.canFire` (abilities.js's own meter/cooldown gate is
  untouched — `abilities.js` was read but needed zero code changes for this
  round; the charge gate lives entirely in the engine per the contract's
  "add charge gating in engine/abilities" wording, engine side chosen since
  the charge state (`ctx.run.powerCharges`) is engine-owned run state, not
  an abilities-internal timer). A charge is spent only on a SUCCESSFUL
  `RF.Abilities.fire()` return, never on a declined fire.
- Double-tap: ported verbatim from horde-meridian `game.js` `release()`
  (:2640-2662) into `checkDoubleTap`, wired into the existing `onUp`
  handler in `bindInput` so ANY pointer's release counts (not just the
  steering pointer — that's the exact "mobile fix" HM's own comment
  documents, a second finger tapping elsewhere gets a new pointer id and
  must not be skipped). Thresholds are named constants
  (`DTAP_HOLD_MAX`=400ms, `DTAP_MOVE_MAX`=34px, `DTAP_GAP_MIN`=40ms,
  `DTAP_GAP_MAX`=500ms, `DTAP_DIST_MAX`=160px) matching HM's numbers exactly.
  `lastTapAt` resets in `unbindInput` so a stale tap timer never survives
  across a run boundary.
- HUD state object (`HUD_STATE`) gains `powerCharges`, `powerChargeCap`, and
  a reused `buffs` sub-object mirroring `ctx.run.buffs`; `powerReady` is now
  `ab.ready && powerCharges > 0`.
- Shield absorption: `stepPlayerHits` checks `buffs.shield > 0` BEFORE the
  existing `hurt()` call — one charge is consumed per damage EVENT (matching
  the existing "one damage event per frame however many contacts landed"
  rule), emits a small cyan ring + `shieldhit` sfx, and returns without
  calling `hurt` (combo is not broken by an absorbed hit).

## Selftests

`node --import ./tools/reg.mjs tools/selftest.mjs game abilities` — **194
checks pass, 0 fail**. `world art3d` — world 178 pass, art3d 24 pass, 0 fail
in either (confirms no breakage in the neighboring lanes' files from this
lane's changes, as instructed). `fx` — unaffected (0/0, that module's
selftest is presently empty).

New/changed selftest sections added to `engine3d.js`'s `__selftestBody`:
- Camera constants (rewritten for the length-proportional dolly + fraction
  pitch/look), `camZForLen` clamp behavior, `camZForTier` delegation,
  framing-fraction gate at tiers 1/6/12.
- TOO BIG cue: toast fires once, cooldown-gates a repeat, target takes no
  damage.
- Gate formula: `MOUTH.eligibleTierMax` mirrors `p.tier + BITE_UP_BASE +
  biteUp`; megajaw widens it by +1 and widens the instant-swallow tier by +1.
- Buff timer expiry to exactly 0 (never negative) across all five timer
  buffs; `applyBuffPickup` arms each buff correctly, `apex`'s fold-in,
  unknown-id no-op.
- Charge economy: grant from zero, clamp at cap, `firePower` no-ops at zero
  charges, spends exactly one charge on a successful fire, does not spend on
  a declined fire.
- Lunge timing: `preyNear` detection, lunge fires and captures the point as
  numbers, the 0.22s window ends on schedule, the 0.9s cooldown blocks a
  refire and fully decays in isolation, velocity actually changed toward the
  captured point.
- Deliberate deadzone edit: the old `0.05*radius` sub-dead-zone probe
  updated to `0.02*radius` (STICK_DEAD is now 0.03, so 0.05*radius is no
  longer below the line).

## Deviations from a literal reading of the brief (loud, on purpose)

1. **CAM_FRAME_TAN2 derivation**: the brief's "2.018" is the HORIZONTAL
   projection constant (`2*tan(fov/2)*aspect`), not the raw vertical
   `2*tan(fov/2)` a literal reading of "2*tan(fov/2) for fov=50" would give
   (that's 0.9326, off by the 844/390 aspect factor). Verified numerically
   against the brief's own "2.018" and documented inline. If a future lane
   changes `CSS_W`/`CSS_H`, this constant must be re-derived from the new
   aspect ratio, not hand-edited.
2. **Shield charge stacking**: the brief specifies "SHIELD BUBBLE (absorbs 2
   hits)" but doesn't specify what a second shield pickup while one is
   already active does. Chose to cap at `SHIELD_CHARGES` (2) rather than let
   charges accumulate past that, since nothing in the brief calls for a
   stacking shield and an unbounded shield would undercut the "damage still
   matters" balance the rest of 6.6 is built around.
3. **Buff cue naming**: 6.7 says "Buffs feed the existing single-cue bus for
   vignettes... coordinate via existing cue names; Lane F renders." The
   existing cue names (`blood`/`school`/`golden`/`goldRush`) are frenzy-only;
   there was no existing buff cue name to reuse for five distinct buffs, so
   this lane introduces five new lowest-priority cue strings
   (`buffOverdrive`/`buffShield`.../`buffApex`) rather than overloading an
   existing name. `buffShield` was omitted (shield has no duration to show
   as a sustained vignette — it's an instant charge count, better suited to
   the HUD charge readout than a screen vignette) — flagging this in case
   Lane F/V wants a shield vignette after all.
4. **`stepPickups` runs unconditionally**, even when Lane W has not
   implemented buff-capsule spawning or the `'buffpickup'` kind at all. It is
   a fully guarded no-op until that lands (empty/undefined query result), so
   it costs nothing today but is ready the moment `data.js`/`world3d.js`
   grow the `PICKUPS` table.

---

# Fix round 2 (2026-08-21, post-Luna-review; SPEC3D.md 6.11)

Scope this round: `engine3d.js`, `abilities.js`, `tools/selftest.mjs` ONLY,
per the binding fix-round contract (6.11) and the Luna code/design review
findings (`reviews/code_out.md`, `reviews/design_out.md`). world3d.js,
shark3d.js/fish3d.js, fx3d.js/ui3d.js/index.html, meta.js were all read-only
this round (never written) — meta.js in particular is in flux under another
lane/owner and item 6 below could not be completed from this lane's file
scope; see "Not done" below.

## 1. Buff pickup lifecycle (CRITICAL, review MAJOR #1)

- `step()` reordered: `stepPickups(p)` now runs BEFORE `stepEat(p)` (was
  after). Comment at the call site explains why.
- `stepEat`'s per-entity loop now has an explicit
  `if (e.kind === 'buffpickup') continue;` right after the existing
  `kind === 'pickup'` branch — a buffpickup entity is NEVER edible or scored,
  independent of ordering (belt-and-braces: even if `stepPickups` missed one
  outside its `PICKUP_QUERY_R`, stepEat now still refuses to eat it).
- `applyBuffPickup(e.buffId || e.defId)` -> `applyBuffPickup(e.buffId)` — the
  `|| e.defId` fallback that produced unresolvable ids like `buff_overdrive`
  is gone; engine reads `e.buffId` ONLY per the PICKUP ID SEAM world3d is
  switching to.
- Replaced the old `check(true, 'an unknown buff id is a silent no-op...')`
  with (a) a real assertion that an unknown id leaves `ctx.run.buffs`
  byte-for-byte unchanged (`JSON.stringify` before/after), and (b) a genuine
  spawn -> collect integration test: a fake `{kind:'buffpickup', buffId:
  'overdrive', defId:'buff_overdrive', ...}` entity is queried by both
  `RF.World.query`/`eatQuery` mocks; `stepPickups(pc)` is called directly and
  asserted to both arm `ctx.run.buffs.overdrive` to its full duration AND
  kill the entity with `cause==='collected'`; then the entity is re-armed
  `active=true` and `stepEat(pc)` is called directly and asserted to leave it
  untouched (`active` still true, not killed, zero score/coins awarded) —
  proving the eat-path exclusion independent of step() ordering.

## 2. Controls exactness (CRITICAL, design review)

- `stepControl`'s keyboard branch is no longer gated on `!ctl.active`.
  Keyboard `kx/ky` axes are now ALWAYS computed and added to the stick's
  `sx*mag`/`sy*mag` (when active) into a combined `dx/dy`, matching HM
  `stepInput` :5439-5446 (`dx=kx; if(stick.active){dx+=stick.dx}`) exactly.
  The combined vector is renormalized (`len`, clamped to 1) into
  `ix/iy/mag`, then the existing `STICK_DEAD` gate applies to the COMBINED
  magnitude, same as before.
- OVERDRIVE_SPEED_MULT changed 1.35 -> 1.42 (HM's exact multiplier). Two new
  constants ported verbatim from HM :5453/:5467: `OVERDRIVE_ACCEL` (860
  px/s^2) and `OVERDRIVE_BRAKE` (8.5 idle-decay coefficient). `stepControl`'s
  motion branch now has three paths instead of two: driving+overdrive
  accelerates toward the target velocity clamped by `OVERDRIVE_ACCEL*STEP`
  per axis (was a direct assignment before); idle+overdrive brakes toward
  zero (`vx *= max(0, 1-STEP*8.5)`) instead of the flat hard stop; the
  original driving/idle direct-assignment and hard-stop paths are unchanged
  for the non-overdrive case. Airborne vy exception (6.8) still applies in
  all three paths.
- Verified live in a real headless-Chrome run (see "Browser verification"
  below): holding ArrowRight while a script-driven stick points straight
  down produces a 45° diagonal heading and equal vx/vy, proving the merge is
  additive, not stick-exclusive.

## 3. Lunge / chomp cadence

- Confirmed `LUNGE_RANGE_MULT` (2.2) was ALREADY multiplying `p.r` (body
  radius), not `mouthR` — no change needed there; the review's file:line
  citation predates this constant's current form. Verified by reading
  `stepLunge`'s `range = LUNGE_RANGE_MULT * p.r` directly.
- `LUNGE_CD` 0.9 -> 0.5s.
- `multiBite`'s per-target chew cooldown (`e._biteCd`) 0.25 -> 0.15s.
- Updated the two selftest asserts that hardcoded the old numbers:
  "multiBite stores the ... cooldown on each target" now expects 0.15s.

## 4/5. MegaJaw / Frenzy sustain

- `swallow()` now sets `e.hp = 0` immediately before its `RF.World.kill`
  call (with a comment explaining why: instant swallows skip `multiBite`'s
  HP drain entirely, so without this line `recordFrenzyKill`'s `ent.hp <= 0`
  gate would silently reject a real, completed instant-swallow kill).
- Blood Frenzy trigger relaxed from `tier >= p.tier` to `tier >= p.tier - 1`
  in `recordFrenzyKill`'s `FRENZY_EAT_BLOOD` assignment.
- Zone-pressure hunger multiplier in `stepHunger` changed 3 -> 2.
- Updated the two selftest asserts that hardcoded the old numbers: "zone
  pressure multiplies drain" now checks `deep > shallow * 1.5` (was `* 2.5`).

## 6. clearDev()/?dev=0 (NOT DONE — out of file scope)

`clearDev()`, the `forceGoldRush`/`forcePower` dev-state fields, and
`window.__rf.switches` all live in `meta.js`, which this lane does NOT own
and which git status shows is being actively edited this round (presumably
by the owner directly, per SPEC3D.md 6.10 "Landscape menu + dev mode (Fable
direct)"). Nothing in `engine3d.js`/`abilities.js`/`tools/selftest.mjs`
implements or calls `clearDev()`, so there was no in-scope file where this
fix could land. Flagging explicitly rather than reaching into `meta.js`.

## 7. Teardown: EAT_BUF

`endRun()` now zeroes every slot of the module-scratch `EAT_BUF` array
(`for (eb=0; eb<EAT_BUF.length; eb++) EAT_BUF[eb] = null;`) right after
`teardownPops()`. `EAT_BUF` is a reused copy of World's query results inside
`stepEat`/`stepPickups` and was the only engine-side scratch array actually
holding live entity object references across a run boundary (the
`FRENZY_EAT_*` parallel arrays only ever store numbers, per 6.6's original
design — confirmed by re-reading `recordFrenzyKill`, nothing there needed
the same treatment).

## 8. tools/selftest.mjs: consume checks/fails

The runner previously only read `res.notes` (and `res.sections[*].notes`).
`ui3d.js`'s selftest instead returns `{pass, checks, fails, log}` with no
notes array, so a ui failure always printed as `ok=0 fail=0` — silently
reporting green. The runner now ALSO reads `res.checks`/`res.fails` (added
to whatever the notes-based tally already produced) and, if `fails > 0`,
scans `res.log` for `FAIL`/`EXCEPTION`-prefixed lines to print. `allPass`
now also goes false whenever the combined `fail` count is nonzero, not just
on `!res.pass` — so a lane whose `pass` flag is miscomputed but whose
fail-count is nonzero (or vice versa) can no longer slip through. Output
format (`<target>: pass=... ok=... fail=...` plus per-failure lines) is
unchanged.

## 9. Superpower economy: default active for ability-less sharks

`abilities.js`'s `activeId(player)` now falls back to `DEFAULT_ACTIVE_ID`
('sonic' — Sonic Roar, tied for the cheapest `charge` cost in `ABILITIES` at
12, alongside `volt`) whenever a shark def has no `active` at all (the
starter reef shark, `data.js:6`, plus any other free/ability-less shark
authored the same way). `data.js`/`gen_data.py` were NOT touched (another
lane owns them this round) — the fallback lives entirely in the resolver.
`engine3d.js`'s HUD gate (`pushHud`) changed from `if (ab && p.def.active)`
to `if (ab && ab.id)`, since `ab.id` now reflects the RESOLVED id (including
the fallback) while `p.def.active` stays `null` for the reef shark forever —
without this HUD-side change the fallback would be armed and firable but
have no visible button, which would have defeated the point.

## 10. Ability spectacle hooks

New `abilityFireSpectacle(player, def)` in `abilities.js`, called once from
`fire()` right after the existing `emit('ring', ...)` line. Calls, each
individually guarded with its own `typeof fn === 'function'` check plus a
try/catch (so a not-yet-landed or differently-named F2 primitive can never
throw out of `fire()`, and the calls are independent of each other so their
relative order never matters):
- `RF.Fx.eatShockwave(player.x, player.y, {tint, scale:1.3})`
- `RF.Fx.hologramFlash(player.x, player.y, {tint, count:16})`
- `RF.Fx.requestVignette('buff', 900)`
- `player.rig.group.userData.rfFlash(tint || 0xff2bd6, def.dur||0.4, 1)` —
  reusing Lane A's existing reversible emissive-tint hook (same one the
  Blood Frenzy crackle in `engine3d.js` already calls), read-only from this
  file's perspective.
All four no-op cleanly under the selftest harness (no `RF.Fx`/`player.rig`
there), confirmed by an unchanged 0-fail `abilities` selftest run.

## Verification

```
node --import ./tools/reg.mjs tools/selftest.mjs game abilities world
game: pass=true ok=198 fail=0
abilities: pass=true ok=0 fail=0
world: pass=true ok=185 fail=0
```

world stayed green with zero asserts needing changes (no ctx-shape changes
this lane made touch anything world's own selftest reads). game went from
196/2-fail (after the buff/controls/lunge/frenzy fixes, before updating the
two deliberately-changed asserts) to 198/0-fail once those two asserts were
updated to the new 6.11 numbers; also added net +2 new checks from the
buffpickup integration test replacing the single `check(true)`.

### Browser verification (headless Chrome, 844x390 @dpr3, port 8935, served
from the scratchpad `serve.mjs` against the live repo; killed after)

- `RF.Game.startRun('reef')` + force-clearing `kit.paused` (the run starts
  paused behind the menu/tap-to-start gate, unrelated to this round's
  changes) to drive the fixed step directly.
- Keyboard+stick merge: set `ctl.active=true, sx=0, sy=1, mag=1` (stick
  pointing straight down) via `RF.Game.ctx`, then held a REAL `ArrowRight`
  keydown through Puppeteer for 300ms. Result: `angle=0.7853981633974483`
  (exactly 45°) and `vx===vy===203.65` — proving the keyboard axis (kx=+1)
  and the stick's down axis (sy=+1) summed into a genuine diagonal instead
  of the keyboard being ignored (which would have held it at the pure-down
  90°/π/2 the stick alone specifies).
- Buff pickup: called the LIVE `RF.World.spawnBuffDrop(p.x, p.y)` (world
  lane's real implementation, not a mock) near the player, waited ~600ms of
  real sim time, and read `ctx.run.buffs` back: `magnet` armed to `~7.6`
  (nonzero), confirming a real spawned buffpickup is collected and arms a
  buff end-to-end through this round's reordered `stepPickups`/`stepEat`
  and the `e.buffId`-only read. No console/page errors during the whole
  sequence.
- No commits, no deploys. Server (`serve.mjs 8935`) started and killed
  within this session.

---

## Fix-round 3 (2026-08-21, post re-review; SPEC3D 6.12) — engine3d.js + abilities.js

Scope this round: SPEC3D "6.12 Fix-round 3 contracts" engine-side items only.
world3d.js/fx3d.js/ui3d.js/index.html were never opened for writing (two
other lanes own those concurrently this round).

1. **Stick math double-scaling (CRITICAL).** `stepControl()` combined
   `dx += ctl.sx * ctl.mag` (and the equivalent `dy`) — since `ctl.sx/sy`
   (set in `dragStick`) are ALREADY the deflection-scaled components
   (`dx/max`, each independently carrying direction AND magnitude fraction),
   multiplying by `ctl.mag` again squared the deflection: half stick
   (`sx=0.5`) became `0.5*0.5=0.25` speed instead of `0.5`. Fixed to
   `dx += ctl.sx; dy += ctl.sy` (no second multiply) — matches HM
   `game.js:5445-5446` exactly, which adds the raw stored components with no
   re-multiply. The single magnitude clamp still happens once via
   `clampedLen = Math.min(1, len)` right after. Verified in-browser: full
   deflection gave `vx=288=speedCap`; half deflection gave `vx=144`, ratio
   exactly `0.500`.

2. **Shared eligibility helper (CRITICAL + MAJOR).** Added `eatEligible(p, e)`
   as the single predicate for "is this entity a valid target": excludes
   null/inactive/self/player/`pickup`/`buffpickup`; hazards only for a
   junkEater; otherwise `tier <= p.tier + BITE_UP_BASE + biteUp` where
   `biteUp` folds in the player's passive AND megajaw's +1 while active.
   `stepPreyNear`, `stepLunge`, and `stepEat` all now call it instead of each
   keeping its own (previously divergent) inline filter. Also fixed
   `stepPreyNear`'s range from `2.2*mouthR` to `2.2*p.r` (body radius) to
   match the lunge query range exactly, closing the dead zone where lunge
   could arm on a target preyNear itself never saw. `buffpickup` is now
   provably excluded from both preyNear and lunge capture (it already was in
   stepEat).

3. **Ability meter starts full at run start.** Added
   `RF.Abilities.seedMeterFull(ctx)` (abilities.js): resolves the player's
   active ability id/def and sets `st.powerCharge = def.charge` directly, a
   silent no-op if there's no resolvable charge cost. Called once from
   `startRun()` right after `buildPlayer`. Meter/charge economy after the
   first fire is completely unchanged. Verified in-browser:
   `powerCharges=3, canFire=true` immediately after `startRun`, and
   `firePower()` returned success on the very first call.

4. **Buff drop cooldown.** Added `ctx.run._lastBuffDropAt` (seeded
   `-Infinity` in `buildContext`) and a module `BUFF_DROP_COOLDOWN = 10`
   (seconds). `swallow()`'s `spawnBuffDrop` call now also requires
   `(ctx.time.now - _lastBuffDropAt) >= 10`, and stamps `_lastBuffDropAt` on a
   successful call. World's own live-concurrency cap is additive on top of
   this, not a replacement.

5. **Blood Frenzy threshold + no re-trigger.** Formula changed to
   `ent.tier >= (p.tier >= 4 ? p.tier - 1 : p.tier)` in `recordFrenzyKill`
   (equal-or-bigger required below tier 4, tier-1 grace at tier >= 4).
   `processFrenzyEvents` now also requires `!(r.blood.t > 2)` before
   triggering, so a qualifying bite mid-window only decays the timer instead
   of re-announcing/re-flashing every kill; it can refresh again once the
   window has decayed to <= 2s.

6. **Spectacle wiring.**
   - `swallow()`'s `eatShockwave` call is no longer gated to `mealT >= p.tier`
     — it fires on every completed bite (swallow() is the single completion
     point for both instant swallows and multiBite's kill), and now passes
     `{ tier: mealT }` always (previously the meal tier was in an object only
     built when the gate passed).
   - Removed the engine-owned `speedlines` boost emitter entirely
     (`stepAnim`'s `ctl.boosting && f > 0.5 ...` block) — fx3d owns all boost
     visuals now; no second emitter competing for pool budget.
   - `abilityFireSpectacle(player, def, id)` (abilities.js) now takes the
     fired ability's `id` and derives `isAtomic = id === 'atomic'`, passing
     `{ kind: id, atomic: isAtomic }` through to `eatShockwave`/
     `hologramFlash` plus atomic-scaled `scale`/`count`/vignette duration/
     rfFlash intensity, so fx3d has the element identity and an explicit
     ceiling flag available rather than only a raw tint to re-derive family
     from.
   - Frenzy's `rfFlash` call site (`processFrenzyEvents`) was already reading
     `p.rig.group.userData.rfFlash` correctly (not `p.rig.userData`) before
     this round — confirmed, no change needed. fx3d.js's own `rfArcs` lookup
     (the actual bug the review flagged) is fx3d's file, not touched here.

7. **Prey panic cue** (world/fx territory) — not engine-owned, no action
   taken in this file.

### Incidental defensive fix (engine3d.js `recordFrenzyKill`)

While verifying, found `RF.World.__selftest()` crashing with
`TypeError: Cannot read properties of undefined (reading 'packId')` at
`recordFrenzyKill`'s `r.golden.packId` read. Root cause: `boot()` calls
`buildContext()` unconditionally on every real page load, which calls
`installFrenzyHooks()`, which wraps `RF.World.kill` PERMANENTLY (guarded
once, never unwrapped) for the rest of the page's life — reading `RF.ctx`
fresh on every call. World3d's own selftest fixture builds a minimal
`ctx.run = { score, coins }` (no `.golden`) and calls the real `World.kill`
directly, which now routes through the hook against that minimal ctx and
crashes. **Confirmed pre-existing on HEAD** (reproduced identically after
`git stash` of both my files, then restored) — not introduced by this round's
changes, and not caused by anything in the other lanes' concurrent world3d.js
edits either, since it reproduces from a fresh page load before any selftest
runs. Added a one-line defensive guard in `recordFrenzyKill`:
`if (!r.golden) r.golden = { packId: 0, eaten: 0, deadline: 0 };` right after
the existing null checks — real runs always have the full schema from
`buildContext`, so this only changes behavior for a hand-built `ctx.run`
missing the field. This is the only change in this round outside the six
SPEC3D 6.12 engine items above; flagging it explicitly since it's a
defensive fix rather than a requested contract item.

### Selftest updates (deliberate asserts)

- **Half-deflection assert** (`stepControl`/stick test region): the old
  probe (`ctl.sx=cos*0.5, mag=0.5`, asserting `halfSpeed < movingSpeed*0.75`)
  passed even under the double-scaling bug, since `0.25x` easily clears a
  `<0.75x` ceiling — a one-sided bound can't distinguish 0.25x from 0.5x.
  Replaced with a tight ratio band: `halfRatio > 0.42 && halfRatio < 0.58`.
- **preyNear range comment/assert** updated from "2.2*mouthR" to "2.2*p.r
  (body radius)" to match the new shared-range fix.
- New: Blood Frenzy threshold asserted at player tiers 1, 6, and 12 (six
  checks) directly against `recordFrenzyKill`, both sides of each tier's
  threshold.
- New: no-retrigger-while-blood.t>2 asserted via `stepFrenzy()` (decay-only
  above the floor, refresh once at/below it).
- New: staged eatShockwave-on-every-bite asserted via a spy `RF.Fx` mock,
  including `{tier: mealT}` on a plain below-tier swallow.
- New: buff-drop 10s cooldown asserted via a spy `RF.World.spawnBuffDrop`
  mock across three notable kills (first fires, second inside the window is
  blocked, third after `ctx.time.now += BUFF_DROP_COOLDOWN + 0.001` fires
  again).
- New: `RF.Abilities.seedMeterFull` spied (wrapping the REAL abilities.js
  function, not a bare mock) inside the existing LIFE-01 5-cycle
  `startRun`/`endRun` loop — asserts exactly 5 calls, one per cycle, each
  with the live `ctx`.
- Full suite: **world 186/186, game 213/213, abilities all pass (0 notes)**,
  run individually per-suite on a fresh page load. A combined single-page
  world→game→abilities run showed one flaky `resolveBody` push-out check in
  world3d.js (1/37 contacts) that did not reproduce on a re-run — order/RNG
  state sensitivity in world3d.js's own physics probe, not reproducible
  deterministically and not touched by this lane's files.

### Browser sanity (headless Chrome, 844x390 @dpr2, port 8935, scratchpad
`serve.mjs`; killed after)

- `RF.Game.startRun('reef')` then immediately read `ctx.run.powerCharges`
  (3), `RF.Abilities.canFire(ctx)` (true), and called `RF.Game.firePower()`
  (returned a truthy/successful fire, charges dropped 3 -> 2) — proves item 3
  end-to-end through the real rAF-driven fixed step, not just the selftest
  mock.
- Set `p.ctl.sx=1, sy=0, mag=1`, let the real fixed step run ~600ms:
  `vx settled at 288 === ctl.speedCap`. Then `sx=0.5, sy=0, mag=0.5`, another
  ~600ms: `vx settled at 144`, ratio `144/288 = 0.500` exactly — item 1
  confirmed end-to-end at real half deflection, not only via the selftest's
  synthetic ratio band.
- No commits, no deploys. Server (`serve.mjs 8935`) started and killed
  within this session.

